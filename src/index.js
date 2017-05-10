const bloomrun = require('bloomrun')
const ld = require('lodash')
const { EventEmitter2 } = require('eventemitter2')
const Promise = require('bluebird')
const { calcDelay, throwError, beautify, split, ensureIsFuction, objectify, routingKeyFromPattern } = require('./utils')

// default options for bishop instance
const defaultConfig = {
  forbidSameRouteNames: false,
  //  if set to insertion, it will try to match entries in insertion order
  //  if set to depth, it will try to match entries with the most properties first
  matchOrder: 'depth', // insertion, depth
  // default timeout for pattern execution in ms
  timeout: 500,
  // append debbuging information into response
  // debug: false,
  // emit warning on slow execution in ms
  slowPatternTimeout: null,
  // default behaviour on error - emit exception
  onError: throwError,
  // default logger instance
  logger: console
}

class Bishop {
  constructor(userConfig) {

    const config = this.config = Object.assign({}, defaultConfig, userConfig)
    this.log = config.logger
    this.onError = config.onError

    // listen incoming events and handle corresponding patterns
    this.eventEmitter = new EventEmitter2({
      wildcard: true,
      delimiter: '.',
      newListener: false,
      maxListeners: 10,
      verboseMemoryLeak: false
    })


    this.globalPatternMatcher = bloomrun({ indexing: config.matchOrder })
    this.localPatternMatcher = bloomrun({ indexing: config.matchOrder })
    this.beforePatternMatcher = bloomrun({ indexing: config.matchOrder })
    this.afterPatternMatcher = bloomrun({ indexing: config.matchOrder })

    this.beforeGlobalHandlers = []
    this.afterGlobalHandlers = []

    this.transports = {} // transportName: { wrapper, options }
  }

  // register service for specified pattern
  add(message, service) {
    if (!service) {
      throwError(new Error('.add: please pass pattern handler as last parameter'))
    }
    const [ ,, pattern ] = split(message)

    if (this.config.forbidSameRouteNames) { // ensure same route not yet exists
      const foundPattern = this.globalPatternMatcher.lookup(pattern, { patterns: true })
      if(ld.isEqual(foundPattern, pattern)) {
        throwError(new Error(`.add: .forbidSameRouteNames option is enabled, and pattern already exists: ${beautify(pattern)}`))
      }
    }

    this.globalPatternMatcher.add(pattern, service) // add service to global pattern matcher

    if (ld.isFunction(service)) { // also register service as local function (opposite to remote network calls)
      this.localPatternMatcher.add(pattern, service)
    }
  }

  notify(message) {
    const [ ,, pattern ] = split(message)
    const uniqueEvent = `${routingKeyFromPattern(pattern)}.**`
    // add handler after pattern to catch result and emit it
    this.register('after', pattern, (...params) => {
      this.eventEmitter.emit(uniqueEvent, ...params)
      return params[0] // [ message, headers ]
    })
  }

  // listen for pattern and execute payload on success
  follow(message, listener) {
    const [ ,, pattern ] = split(message)
    const uniqueEvent = `${routingKeyFromPattern(pattern)}.**`
    this.eventEmitter.on(uniqueEvent, listener)
  }

  unfollow() {
    throw new Error('not implemented')
  }

/**
WARN: register('before|after', pattern, handler) order not guaranteed
.register('before', handler)
.register('before', pattern, handler)
.register('after', handler)
.register('after', pattern, handler)
.register('remote', name, handler, options)
 */
  register() {
    const [ type, ...args ] = arguments
    const [ arg1, arg2, arg3 = {} ] = args

    switch (type) {
      case 'before':
        return arg2 ? this.beforePatternMatcher.add(objectify(arg1), ensureIsFuction(arg2)) // pattern, service
          : this.beforeGlobalHandlers.push(ensureIsFuction(arg1)) // service

      case 'after':
        return arg2 ? this.afterPatternMatcher.add(objectify(arg1), ensureIsFuction(arg2)) // pattern, service
          : this.afterGlobalHandlers.push(ensureIsFuction(arg1)) // service

      case 'remote':
        if (this.transports[arg1]) {
          throwError(new Error(`.register remote: ${arg1} already exists`))
        }
        this.transports[arg1] = {
          wrapper: ensureIsFuction(arg2, '.register remote: please pass valid Promise as second paramerer'),
          options: arg3
        }
        return
      default:
        throw new Error('.register(before|after|remote, ...)')
    }
  }

  unregister() {
    throw new Error('not implemented')
  }

  // remove pattern from pattern matcher instance
  remove(message) {
    const [ ,, pattern ] = split(message)
    this.globalPatternMatcher.remove(pattern)
    this.localPatternMatcher.remove(pattern)
  }

  // load module with routes
  use(plugin, options) {
    ensureIsFuction(plugin, '.use: function expected, but not found')
    return plugin(this, options)
  }

  // find first matching service by pattern, and execute it
  //  $timeout - redefine global request timeout for network requests
  //  $slow - emit warning if pattern executing more than $slow ms
  //  $local - search only in local patterns, skip remote transports
  //  $nowait - resolve immediately (in case of local patterns), or then message is sent (in case of transports)
  async act() {
    return this.actRaw(...arguments).then(({ message }) => message)
  }

  async actRaw(message, ...payloads) {
    if (!message) {
      return throwError(new Error('.act: please specify at least one search pattern'))
    }
    const actStarted = calcDelay(null, false)
    const [ pattern, headers, raw ] = split(message, ...payloads)
    const patternMatcher = headers.local ? this.localPatternMatcher : this.globalPatternMatcher
    const result = patternMatcher.lookup(pattern, { patterns: true, payloads: true })
    if (!result) {
      return throwError(new Error(`pattern not found: ${beautify(raw)}`))
    }
    headers.pattern = result.pattern  // save found pattern in headers
    headers.input = raw               // save incoming message in headers
    const service = result.payload

    // 2do: think about execution chain caching
    // travel over all patterns and return pass-thru chain of service calls

    const executionChain = [
      ...this.beforeGlobalHandlers,
      ...this.beforePatternMatcher.list(pattern).reverse()
    ]

    // add service endpoint
    const endpoint = (() => {
      if(headers.local || ld.isFunction(service)) { // local pattern
        return service
      }
      // link to external transport
      const { wrapper, options } = this.transports[service] || {}
      if (!wrapper) {
        throwError(new Error(`looks like ${service} handler is not registered via .register(remote)`))
      }
      if (options.timeout && !headers.timeout) { // redefine pattern timeout if transport-specific is set
        headers.timeout = options.timeout
      }
      return wrapper
    })()
    executionChain.push(endpoint)

    executionChain.push(
      ...this.afterPatternMatcher.list(pattern),
      ...this.afterGlobalHandlers
    )

    const slowTimeoutWarning = this.config.slowPatternTimeout || headers.slow && parseInt(headers.slow, 10)
    const timeout = headers.timeout || this.config.timeout

    if (slowTimeoutWarning) { // emit warning about slow timeout in the end of execution chain
      executionChain.push(message => {
        const executionTime = calcDelay(actStarted, false)
        if (executionTime > slowTimeoutWarning) {
          this.log.warn(`pattern executed in ${executionTime}ms: ${beautify(pattern)}`)
        }
        return message
      })
    }

    // execute found chain and return result to client
    const chainRunner = () => {
      return Promise.reduce(executionChain, async (data, method) => {
        const [ input, headers ] = data
        if (headers.break) { // should break execution and immediately return result
          const error = new Promise.CancellationError('$break found')
          error.message = input
          error.headers = headers
          throw error
        }
        const res = await method(input, headers)
        return [ res, headers ]
      }, [ pattern, headers ])
      .then(([ message, headers ]) => {
        return { message, headers }
      })
      .catch(Promise.CancellationError, err => {
        const { message, headers } = err
        return { message, headers }
      })
      .catch(err => {
        return { message: this.onError(err), headers }
      })
    }

    if (headers.nowait) {
      // sometimes client dont want to wait, so we simply launch chain in async mode
      chainRunner()
      return Promise.resolve([ null, headers ])
    }

    if (!timeout) { // no need to handle timeout
      return chainRunner()
    }

    return Promise
      .resolve(chainRunner())
      .timeout(timeout)
      .catch(Promise.TimeoutError, () => {
        throw new Error(`pattern timeout after ${timeout}ms: ${beautify(pattern)}`)
      })
    }
}

module.exports = Bishop
