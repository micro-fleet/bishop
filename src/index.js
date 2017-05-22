const bloomrun = require('bloomrun')
const ld = require('lodash')
const { EventEmitter2 } = require('eventemitter2')
const Promise = require('bluebird')
const utils = require('./utils')
const LRU = require('lru-cache')
const pkg = require('../package')
const debug = require('debug')(pkg.name)

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
  // emit warning in big execution chain
  maxExecutionChain: 10,
  // in case of .follow same message can be delivered over different transports
  ignoreSameMessage: false,
  // default behaviour on error - emit exception
  onError: utils.throwError,
  // default logger instance
  logger: console
}

const uniqueIds = LRU({
  maxAge: 60 * 1000
})

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

    this.transports = {} // transportName: { options, follow, notify, request }
    this.followableTransportsEnum = []
  }

  // register payload for specified pattern
  add(message, payload) {
    const [ pattern, options ] = utils.split(message)
    if (!payload) {
      utils.throwError(new Error('.add: please pass pattern handler as last parameter'))
    }
    debug('add service, message:', JSON.stringify(message), 'resulting pattern:', JSON.stringify(pattern), 'options:', JSON.stringify(options))
    if (this.config.forbidSameRouteNames) {
      utils.throwIfPatternExists(this.globalPatternMatcher, pattern)
    }
    utils.registerInMatcher(this.globalPatternMatcher, [ pattern, options ], payload) // add payload to global pattern matcher
    if (ld.isFunction(payload)) { // also register payload as local function (opposite to remote network calls)
      utils.registerInMatcher(this.localPatternMatcher, [ pattern, options ], payload)
    }
  }

  // listen for pattern and execute payload on success
  async follow(message, listener) {
    const [ pattern, headers ] = utils.split(message)
    const ignoreSameMessage = this.config.ignoreSameMessage
    const eventEmitter = this.eventEmitter

    async function handler(message, headers) {
      const id = headers.id

      if (ignoreSameMessage && uniqueIds.has(id)) {
        // do not emit same message
        return
      }
      uniqueIds.set(id, true)
      debug('.follow: got message, message:', JSON.stringify(message), 'headers:', JSON.stringify(headers))

      try {
        const result = await listener(message, headers)
        eventEmitter.emit(`notify.${id}.success`, result, message, headers)
      } catch (err) {
        eventEmitter.emit(`notify.${id}.error`, err, message, headers)
      }

    }
    // subscribe to local event
    // https://github.com/asyncly/EventEmitter2#multi-level-wildcards
    const uniqueEvent = `**.${utils.routingKeyFromPattern(pattern).join('.**.')}.**`
    debug(`.follow: subscribed to ${uniqueEvent}`)
    eventEmitter.on(uniqueEvent, handler)

    // subscribe to events from transports
    return Promise.map(this.followableTransportsEnum, transportName => {
      return this.transports[transportName].follow(pattern, handler, headers)
    })
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
    const [ type, arg1, arg2, arg3 ] = params

    switch (type) {
      case 'remote': // backward
        utils.registerRemoteTransport(this.transports, arg1,
          utils.ensureIsFuction(arg2, '.register remote: please pass valid Promise as second paramerer'),
        arg3)
        this.followableTransportsEnum = Object.keys(this.transports).filter(name => {
          return this.transports[name].follow // `follow` method exists in transport
        })
        return
      case 'transport':
        utils.registerTransport(this.transports, arg1, arg2, arg3)
        this.followableTransportsEnum = Object.keys(this.transports).filter(name => {
          return this.transports[name].follow // `follow` method exists in transport
        })
        debug(`.register transport: ${arg1}`)
        return
      case 'before':
        debug(`.register before: ${arg2 ? arg1 : 'global'}`)
        return arg2 ? utils.registerInMatcher(this.beforePatternMatcher, arg1, utils.ensureIsFuction(arg2)) :
          utils.registerGlobal(this.beforeGlobalHandlers, utils.ensureIsFuction(arg1))
      case 'after':
        debug(`.register after: ${arg2 ? arg1 : 'global'}`)
        return arg2 ? utils.registerInMatcher(this.afterPatternMatcher, arg1, utils.ensureIsFuction(arg2)) :
          utils.registerGlobal(this.afterGlobalHandlers, utils.ensureIsFuction(arg1))
      default:
        throw new Error('.register(before|after|transport, ...)')
    }
  }

  // remove pattern from pattern matcher instance
  remove(message) {
    const [ pattern ] = utils.split(message)
    this.globalPatternMatcher.remove(pattern)
    this.localPatternMatcher.remove(pattern)
  }

  // load module with routes
  async use(plugin, options) {
    utils.ensureIsFuction(plugin, '.use: function expected, but not found')
    return plugin(this, options)
  }

  // find first matching service by pattern, and execute it
  //  $timeout - redefine global request timeout for network requests
  //  $slow - emit warning if pattern executing more than $slow ms
  //  $local - search only in local patterns, skip remote transports
  //  $nowait - resolve immediately (in case of local patterns), or then message is sent (in case of transports)
  //  $notify - emit event to global listeners
  async act() {
    return this.actRaw(...arguments).then(({ message }) => message)
  }

  async actRaw(message, ...payloads) {
    if (!message) {
      return utils.throwError(new Error('.act: please specify at least one search pattern'))
    }
    const actStarted = utils.calcDelay(null, false)
    const [ pattern, actHeaders, sourceMessage ] = utils.split(message, ...payloads)
    debug('.act request:', JSON.stringify(pattern), ', actHeaders:', JSON.stringify(actHeaders))
    const patternMatcher = actHeaders.local ? this.localPatternMatcher : this.globalPatternMatcher
    const result = patternMatcher.lookup(pattern, { patterns: true, payloads: true })
    if (!result) {
      return utils.throwError(new Error(`pattern not found: ${utils.beautify(sourceMessage)}`))
    }

    const matchedPattern = result.pattern
    const [ payload, addHeaders ] = result.payload

    // resulting message headers (heders from .act will rewrite headers from .add by default)
    const headers = utils.normalizeHeaders({
      addHeaders, actHeaders, sourceMessage, matchedPattern,
      notifyableTransportsEnum: this.notifyableTransportsEnum
    })
    const slowTimeoutWarning = headers.slow ? parseInt(headers.slow, 10) : this.config.slowPatternTimeout
    const timeout = headers.timeout ? parseInt(headers.timeout, 10) : this.config.timeout

    // 2do: think about execution chain caching
    // travel over all patterns and return pass-thru chain of service calls
    const executionChain = [
      ...this.beforeGlobalHandlers,
      ...this.beforePatternMatcher.list(pattern).reverse(),
      utils.createPayloadWrapper(payload, headers, this.transports),
      ...this.afterPatternMatcher.list(pattern),
      ...this.afterGlobalHandlers
    ]

    if (slowTimeoutWarning) { // emit warning about slow timeout in the end of execution chain
      utils.registerGlobal(
        executionChain,
        utils.createSlowExecutionWarner(slowTimeoutWarning, actStarted, headers, this.log)
      )
    }

    if (executionChain.length > this.config.maxExecutionChain) {
      this.log.warn(`execution chain for ${utils.beautify(sourceMessage)} is too big (${executionChain.length})`)
    }

    const chainRunnerAsync = utils.createChainRunnerPromise({
      executionChain,
      pattern,
      headers,
      errorHandler: this.onError,
      globalEmitter: this.eventEmitter,
      transports: this.transports,
      log: this.log
    })

    if (headers.nowait) { // sometimes client dont want to wait, so we simply launch chain in async mode
      chainRunnerAsync()
      return Promise.resolve({ message: undefined, headers })
    }

    if (!timeout) { // no need to handle timeout
      return chainRunnerAsync()
    }

    return chainRunnerAsync()
      .timeout(timeout)
      .catch(Promise.TimeoutError, () => {
        throw new Error(`pattern timeout after ${timeout}ms: ${utils.beautify(headers.source)}`)
      })
    }
}

module.exports = Bishop
