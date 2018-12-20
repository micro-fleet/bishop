const opentracing = require('opentracing')
const bloomrun = require('bloomrun')
const ld = require('lodash')
const { EventEmitter2 } = require('eventemitter2')
const Promise = require('bluebird')
const LRU = require('lru-cache')
const { createTraceSpan, finishSpan, initTracer } = require('@fulldive/common/src/tracer')
const createDefaultLogger = require('@fulldive/common/src/logger')
const errors = require('common-errors')

const {
  split,
  registerInMatcher,
  beautify,
  routingKeyFromPattern,
  ensureIsFuction,
  registerRemoteTransport,
  registerTransport,
  registerGlobal,
  calcDelay,
  normalizeHeaders,
  createPayloadWrapper,
  createSlowExecutionWarner,
  createChainRunnerPromise
} = require('./utils')

const { validateAddArguments } = require('./helpers')

// default options for bishop instance
const defaultConfig = {
  forbidSameRouteNames: false,
  //  if set to insertion, it will try to match entries in insertion order
  //  if set to depth, it will try to match entries with the most properties first
  matchOrder: 'depth', // insertion, depth
  // default timeout for pattern execution in ms
  timeout: 1000,
  // emit warning on slow execution in ms
  slowPatternTimeout: null,
  // emit warning in big execution chain
  maxExecutionChain: 10,
  // in case of .follow same message can be delivered over different transports
  ignoreSameMessage: false,
  // default logger instance
  logger: { name: 'bishop' },
  trace: {
    name: 'bishop'
  }
}

const uniqueIds = new LRU({
  maxAge: 60 * 1000
})

class Bishop {
  constructor(userConfig) {
    const config = (this.config = ld.defaultsDeep({}, userConfig, defaultConfig))
    this.log =
      config.logger && config.logger.info ? config.logger : createDefaultLogger(config.logger)

    // listen incoming events and handle corresponding patterns
    this.eventEmitter = new EventEmitter2({
      wildcard: true,
      delimiter: '.',
      newListener: false,
      maxListeners: 10,
      verboseMemoryLeak: false
    })

    this.userErrorHandler =
      config.onError ||
      function errorHandler(err) {
        throw err
      }
    this.emitError = (error, headers = {}, span = null) => {
      // default error handler
      this.eventEmitter.emit(`pattern.${headers.id || 'unknown'}.error`, error, headers)
      if (span) {
        finishSpan(span, error)
      }
      return this.userErrorHandler(error, headers)
    }

    this.globalPatternMatcher = bloomrun({ indexing: config.matchOrder })
    this.localPatternMatcher = bloomrun({ indexing: config.matchOrder })
    this.beforePatternMatcher = bloomrun({ indexing: config.matchOrder })
    this.afterPatternMatcher = bloomrun({ indexing: config.matchOrder })

    this.beforeGlobalHandlers = []
    this.afterGlobalHandlers = []

    this.transports = {} // transportName: { options, follow, notify, request }
    this.followableTransportsEnum = []

    this.tracer = ld.isPlainObject(config.trace) ? initTracer(config.trace) : config.trace
  }

  // register payload for specified pattern
  add(_pattern, _handler) {
    const { pattern, options, handler } = validateAddArguments(this, _pattern, _handler)

    // add payload to global pattern matcher
    registerInMatcher(this.globalPatternMatcher, [pattern, options], handler)
    if (ld.isFunction(handler)) {
      // also register payload as local function (opposite to remote network calls)
      registerInMatcher(this.localPatternMatcher, [pattern, options], handler)
    }
  }

  // listen for pattern and execute payload on success
  async follow(message, listener) {
    const [pattern, headers] = split(message)
    const { ignoreSameMessage } = this.config
    const eventEmitter = this.eventEmitter
    const tracer = this.tracer

    async function handler(message, headers) {
      const id = headers.id
      if (ignoreSameMessage && uniqueIds.has(id)) {
        // do not emit same message
        return
      }
      const spanName = beautify(headers.pattern, 20)
      const span = headers.trace && createTraceSpan(tracer, spanName, headers.trace)
      if (span) {
        span.setTag('bishop.follow.pattern', beautify(headers.pattern))
        span.setTag(opentracing.Tags.SPAN_KIND_RPC_CLIENT, true)
      }
      uniqueIds.set(id, true)

      try {
        const result = await listener(message, headers)
        if (span) {
          finishSpan(span)
        }
        eventEmitter.emit(`notify.${id}.success`, result, message, headers)
      } catch (err) {
        if (span) {
          finishSpan(span, err)
        }
        eventEmitter.emit(`notify.${id}.error`, err, message, headers)
        throw err // throw this error so transport can catch and handle it
      }
    }
    // subscribe to local event
    // https://github.com/asyncly/EventEmitter2#multi-level-wildcards
    const uniqueEvent = `**.${routingKeyFromPattern(pattern).join('.**.')}.**`
    eventEmitter.on(uniqueEvent, handler)

    // subscribe to events from transports
    return Promise.map(this.followableTransportsEnum, transportName => {
      return this.transports[transportName].follow(pattern, handler, headers)
    })
  }

  embed(key, instance) {
    if (typeof this[key] !== 'undefined') {
      throw errors.ArgumentError(`bishop.${key} already embedded somewhere else`)
    }
    this[key] = instance
    return instance
  }

  /**
WARN: register('before|after', pattern, handler) order not guaranteed
.register('before', handler)
.register('before', pattern, handler)
.register('after', handler)
.register('after', pattern, handler)
.register('remote', name, handler, options)
.register('transport', name, instance, [options])
 */
  register(...params) {
    const [type, arg1, arg2, arg3] = params

    switch (type) {
      case 'remote': // backward
        registerRemoteTransport(
          this.transports,
          arg1,
          ensureIsFuction(arg2, '.register remote: please pass valid Promise as second paramerer'),
          arg3
        )
        this.followableTransportsEnum = Object.keys(this.transports).filter(name => {
          return this.transports[name].follow // `follow` method exists in transport
        })
        return
      case 'transport':
        registerTransport(this.transports, arg1, arg2, arg3)
        this.followableTransportsEnum = Object.keys(this.transports).filter(name => {
          return this.transports[name].follow // `follow` method exists in transport
        })
        return
      case 'before':
        return arg2
          ? registerInMatcher(this.beforePatternMatcher, arg1, ensureIsFuction(arg2))
          : registerGlobal(this.beforeGlobalHandlers, ensureIsFuction(arg1))
      case 'after':
        return arg2
          ? registerInMatcher(this.afterPatternMatcher, arg1, ensureIsFuction(arg2))
          : registerGlobal(this.afterGlobalHandlers, ensureIsFuction(arg1))
      default:
        throw errors.ArgumentError('.register(before|after|transport, ...)')
    }
  }

  // remove pattern from pattern matcher instance
  remove(message) {
    const [pattern] = split(message)
    this.globalPatternMatcher.remove(pattern)
    this.localPatternMatcher.remove(pattern)
  }

  // load module with routes
  async use(plugin, ...options) {
    ensureIsFuction(plugin, '.use: function expected, but not found')
    return plugin(this, ...options)
  }

  // find first matching service by pattern, and execute it
  //  $timeout - redefine global request timeout for network requests
  //  $local - search only in local patterns, skip remote transports
  //  $nowait - resolve immediately (in case of local patterns), or then message is sent (in case of transports)
  //  $notify - emit event to global listeners
  async act() {
    return this.actRaw(...arguments).then(({ message }) => message)
  }

  async actRaw(message, ...payloads) {
    const actStarted = calcDelay(null, false)
    const [pattern, actHeaders, sourceMessage] = split(message, ...payloads)
    const spanName = beautify(actHeaders.pattern, 20)
    const span = actHeaders.trace && createTraceSpan(this.tracer, spanName, actHeaders.trace)
    if (span) {
      span.setTag(opentracing.Tags.SPAN_KIND_RPC_CLIENT, true)
      span.setTag('bishop.act.pattern', beautify(pattern))
    }

    const normalizeHeadersParams = {
      actHeaders,
      sourceMessage,
      notifyableTransportsEnum: this.notifyableTransportsEnum
    }

    if (ld.isEmpty(message)) {
      return this.emitError(
        errors.ArgumentError('.act: please specify at least one search pattern'),
        normalizeHeaders(normalizeHeadersParams),
        span
      )
    }

    const patternMatcher = actHeaders.local ? this.localPatternMatcher : this.globalPatternMatcher
    const result = patternMatcher.lookup(pattern, { patterns: true, payloads: true })
    if (!result) {
      return this.emitError(
        errors.NotFoundError(`Pattern not found: ${beautify(sourceMessage)}`),
        normalizeHeaders(normalizeHeadersParams),
        span
      )
    }

    const matchedPattern = result.pattern
    const [payload, addHeaders] = result.payload
    if (span) {
      span.setTag('bishop.act.match', beautify(matchedPattern))
    }

    // resulting message headers (heders from .act will rewrite headers from .add by default)
    normalizeHeadersParams.addHeaders = addHeaders
    normalizeHeadersParams.matchedPattern = matchedPattern
    const headers = normalizeHeaders(normalizeHeadersParams)

    const slowTimeoutWarning = headers.slow
      ? parseInt(headers.slow, 10)
      : this.config.slowPatternTimeout
    const timeout = headers.timeout ? parseInt(headers.timeout, 10) : this.config.timeout

    // 2do: think about execution chain caching
    // travel over all patterns and return pass-thru chain of service calls
    const executionChain = [
      ...this.beforeGlobalHandlers,
      ...this.beforePatternMatcher.list(pattern).reverse(),
      createPayloadWrapper(payload, headers, this.transports),
      ...this.afterPatternMatcher.list(pattern),
      ...this.afterGlobalHandlers
    ]

    if (slowTimeoutWarning) {
      // emit warning about slow timeout in the end of execution chain
      registerGlobal(
        executionChain,
        createSlowExecutionWarner(slowTimeoutWarning, actStarted, headers, this.log)
      )
    }

    if (executionChain.length > this.config.maxExecutionChain) {
      const text = `execution chain for ${beautify(sourceMessage)} is too big (${
        executionChain.length
      })`

      this.log.warn(text)
    }

    const chainRunnerAsync = createChainRunnerPromise({
      executionChain,
      pattern,
      headers,
      errorHandler: this.emitError,
      globalEmitter: this.eventEmitter,
      transports: this.transports,
      log: this.log,
      span
    })

    if (headers.nowait) {
      // sometimes client dont want to wait, so we simply launch chain in async mode
      chainRunnerAsync()
      if (span) {
        finishSpan(span)
      }
      return Promise.resolve({ message: undefined, headers })
    }

    if (!timeout) {
      // no need to handle timeout
      return chainRunnerAsync().tap(() => {
        if (span) {
          finishSpan(span)
        }
      })
    }

    return chainRunnerAsync()
      .timeout(timeout)
      .catch(Promise.TimeoutError, () => {
        return this.emitError(
          errors.TimeoutError(`pattern timeout after ${timeout}ms: ${beautify(headers.source)}`),
          headers,
          span
        )
      })
      .tap(() => {
        if (span) {
          finishSpan(span)
        }
      })
  }
}

module.exports = Bishop
