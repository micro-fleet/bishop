const ld = require('lodash')
const Promise = require('bluebird')
const Ajv = require('ajv')

const ajv = new Ajv({
  coerceTypes: 'array',
  useDefaults: true
})
const isHeadersValid = ajv.compile({
  type: 'object',
  properties: {
    timeout: {
      type: 'number'
    },
    slow: {
      type: 'number'
    },
    local: {
      type: 'boolean'
    },
    nowait: {
      type: 'boolean'
    },
    notify: {
      type: 'boolean'
    }
  }
})


function calcDelay(offset, inNanoSeconds = true) {
  const now = (() => {
    if (inNanoSeconds) {
      const [ seconds, nanoseconds ] = process.hrtime()
      return seconds * 1e9 + nanoseconds
    }
    return new Date().getTime()
  })()
  return offset ? now - offset : now
}

// 'model:comments, target, action:create' => { model: 'comments', target: /.*/, action: 'create' }
function text2obj(input) {
  return input.split(',').reduce((prev, cur) => {
    let [ key, value ] = cur.trim().split(':')
    if (typeof value === 'undefined') {
      value = '/.*/'
    }
    const trimmedValue = value.trim()
    prev[key.trim()] = trimmedValue[0] === '/' ?
      new RegExp(trimmedValue.slice(1, -1)) :
      trimmedValue
    return prev
  }, {})
}

function ensureIsFuction(func, message = 'function expected') {
  if (!func || !ld.isFunction(func)) {
    throw new Error(message)
  }
  return func
}

function objectify(obj) {
  return ld.isString(obj) ? text2obj(obj) : ld.cloneDeep(obj)
}

// split all patterns into one, extract payload and meta info from it
function split(...args) {
  const meta = {}
  const message = {}
  const raw = {}
  args.forEach(item => {
    const partialPattern = objectify(item)
    for (let field in partialPattern) {
      if (field[0] === '$') { // meta info like $timeout, $debug etc
        meta[field.substring(1)] = partialPattern[field]
      } else {
        message[field] = partialPattern[field]
      }
      raw[field] = partialPattern[field]
    }
  })
  return [ message, meta, raw ]
}

function beautify(obj) {
  return ld.keys(obj).map(key => {
    const value = obj[key]
    if (ld.isPlainObject(value)) {
      return `${key}:{${ld.keys(value).join(',')}}`
    }
    return value ? `${key}:${value.toString()}` : key
  }).join(', ')
}

// convert object { qwe: 'aaa', asd: 'bbb'} to string 'qwe.aaa.asd.bbb' with sorted keys
function routingKeyFromPattern(pattern) {
  return Object.keys(pattern).sort().map(key => {
    const keyType = typeof pattern[key]
    const value = keyType === 'string' ? pattern[key] : '*'
    return `${key}.${value}`
  }).join('.')
}

module.exports = {

  calcDelay, ensureIsFuction, objectify, split, beautify, routingKeyFromPattern,

  throwError(err) {
    throw err
  },

  registerRemoteTransport(remoteTransportsStorage, name, wrapper, options = {}) {
    if (remoteTransportsStorage[name]) {
      throw new Error(`.register(remote): ${name} already exists`)
    }
    remoteTransportsStorage[name] = { options, wrapper }
  },

  registerInMatcher(matcher, message, payload) {
    const [ pattern, options ] = ld.isArray(message) ? message : split(message)
    matcher.add(pattern, [ payload, options ])
  },

  registerGlobal(globalQueue, payload) {
    globalQueue.push([ payload, {} ])
  },

  throwIfPatternExists(matcher, pattern) {
    const foundPattern = matcher.lookup(pattern, { patterns: true })
    if (ld.isEqual(foundPattern, pattern)) {
      throw new Error(`.add: .forbidSameRouteNames option is enabled, and pattern already exists: ${beautify(pattern)}`)
    }
  },

  createPayloadWrapper(payload, headers, remoteTransportsStorage) {
    if(headers.local || ld.isFunction(payload)) { // this method found in local patterns
      return [ payload, {} ]
    }
    // thereis a string in payload - redirect to external transport
    const { wrapper, options } = remoteTransportsStorage[payload] || {}
    if (!wrapper) {
      throw new Error(`looks like ${payload} handler is not registered via .register(remote)`)
    }
    if (options.timeout && !headers.timeout) { // redefine pattern timeout if transport-specific is set
      headers.timeout = options.timeout
    }
    return [ wrapper, {} ]
  },

  createSlowExecutionWarner(slowTimeoutWarning, userTime, headers, logger) {
    const actStarted = userTime || calcDelay(null, false)
    return message => {
      const executionTime = calcDelay(actStarted, false)
      if (executionTime > slowTimeoutWarning) {
        logger.warn(`pattern executed in ${executionTime}ms: ${beautify(headers.source)}`)
      }
      return message
    }
  },

  normalizeHeaders({addHeaders, actHeaders, sourceMessage, matchedPattern}) {
    const headers = ld.merge({}, addHeaders, actHeaders, {
      pattern: matchedPattern,
      source: sourceMessage
    })

    if (!isHeadersValid(headers)) { // should append defaults, convert values into valid ones etc
      throw new Error(ajv.errorsText(isHeadersValid.errors))
    }
    return headers
  },

  // create cancelable promise from chain of payloads
  createChainRunnerPromise({ executionChain, pattern, headers, errorHandler, globalEmitter }) {
    // NOTE: `headers` can be modified by chain item
    return () => {
      return Promise.reduce(executionChain, (input, chainItem) => {
        const [ handlerAsync ] = chainItem
        if (headers.break) { // should break execution and immediately return result
          const error = new Promise.CancellationError('$break found')
          error.message = input
          error.headers = headers
          throw error
        }
        return handlerAsync(input, headers)
      }, pattern)
      .then(message => {
        if (headers.notify) { // notify global listeners on success
          const uniqueEvent = `${routingKeyFromPattern(headers.pattern)}`
          globalEmitter.emit(uniqueEvent, message, headers)
        }
        return { message, headers }
      })
      .catch(Promise.CancellationError, err => { // stop execution chain if `break` event raised
        const { message, headers } = err
        return { message, headers }
      })
      .catch(err => {
        return { message: errorHandler(err), headers }
      })
    }
  }
}
