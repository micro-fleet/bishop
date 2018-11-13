const opentracing = require('opentracing')
const bloomrun = require('bloomrun')
const ld = require('lodash')
const { EventEmitter2 } = require('eventemitter2')
const Promise = require('bluebird')
const utils = require('./utils')
const LRU = require('lru-cache')
const { createTraceSpan, finishSpan, initTracer } = require('@fulldive/common/src/tracer')
const createDefaultLogger = require('@fulldive/common/src/logger')
const errors = require('common-errors')

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

const uniqueIds = LRU({
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
  add(message, payload) {
    if (!message) {
      this.log.warn('Empty pattern detected...')
      if (payload) {
        this.log.warn(payload.toString())
      }
      throw errors.ArgumentError('.add: looks like you trying to add an empty pattern')
    }
    const [pattern, options] = utils.split(message)
    if (!payload) {
      throw errors.ArgumentError('.add: please pass pattern handler as last parameter')
    }
    if (this.config.forbidSameRouteNames) {
      utils.throwIfPatternExists(this.globalPatternMatcher, pattern)
    }
    utils.registerInMatcher(this.globalPatternMatcher, [pattern, options], payload) // add payload to global pattern matcher
    if (ld.isFunction(payload)) {
      // also register payload as local function (opposite to remote network calls)
      utils.registerInMatcher(this.localPatternMatcher, [pattern, options], payload)
    }
  }

  // listen for pattern and execute payload on success
  async follow(message, listener) {
    const [pattern, headers] = utils.split(message)
    const { ignoreSameMessage } = this.config
    const eventEmitter = this.eventEmitter
    const tracer = this.tracer

    async function handler(message, headers) {
      const id = headers.id
      if (ignoreSameMessage && uniqueIds.has(id)) {
        // do not emit same message
        return
      }
      const span = createTraceSpan(tracer, 'bishop.follow', headers.trace)
      span.setTag('bishop.follow.pattern', utils.beautify(headers.pattern))
      span.setTag(opentracing.Tags.SPAN_KIND_RPC_CLIENT, true)
      uniqueIds.set(id, true)

      try {
        const result = await listener(message, headers)
        finishSpan(span)
        eventEmitter.emit(`notify.${id}.success`, result, message, headers)
      } catch (err) {
        finishSpan(span, err)
        eventEmitter.emit(`notify.${id}.error`, err, message, headers)
        throw err // throw this error so transport can catch and handle it
      }
    }
    // subscribe to local event
    // https://github.com/asyncly/EventEmitter2#multi-level-wildcards
    const uniqueEvent = `**.${utils.routingKeyFromPattern(pattern).join('.**.')}.**`
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
        utils.registerRemoteTransport(
          this.transports,
          arg1,
          utils.ensureIsFuction(
            arg2,
            '.register remote: please pass valid Promise as second paramerer'
          ),
          arg3
        )
        this.followableTransportsEnum = Object.keys(this.transports).filter(name => {
          return this.transports[name].follow // `follow` method exists in transport
        })
        return
      case 'transport':
        utils.registerTransport(this.transports, arg1, arg2, arg3)
        this.followableTransportsEnum = Object.keys(this.transports).filter(name => {
          return this.transports[name].follow // `follow` method exists in transport
        })
        return
      case 'before':
        return arg2
          ? utils.registerInMatcher(this.beforePatternMatcher, arg1, utils.ensureIsFuction(arg2))
          : utils.registerGlobal(this.beforeGlobalHandlers, utils.ensureIsFuction(arg1))
      case 'after':
        return arg2
          ? utils.registerInMatcher(this.afterPatternMatcher, arg1, utils.ensureIsFuction(arg2))
          : utils.registerGlobal(this.afterGlobalHandlers, utils.ensureIsFuction(arg1))
      default:
        throw errors.ArgumentError('.register(before|after|transport, ...)')
    }
  }

  // remove pattern from pattern matcher instance
  remove(message) {
    const [pattern] = utils.split(message)
    this.globalPatternMatcher.remove(pattern)
    this.localPatternMatcher.remove(pattern)
  }

  // load module with routes
  async use(plugin, ...options) {
    utils.ensureIsFuction(plugin, '.use: function expected, but not found')
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
    const actStarted = utils.calcDelay(null, false)
    const [pattern, actHeaders, sourceMessage] = utils.split(message, ...payloads)
    const span = createTraceSpan(this.tracer, 'bishop.act', actHeaders.trace)
    span.setTag(opentracing.Tags.SPAN_KIND_RPC_CLIENT, true)
    span.setTag('bishop.act.pattern', utils.beautify(pattern))

    const normalizeHeadersParams = {
      actHeaders,
      sourceMessage,
      notifyableTransportsEnum: this.notifyableTransportsEnum
    }

    if (ld.isEmpty(message)) {
      return this.emitError(
        errors.ArgumentError('.act: please specify at least one search pattern'),
        utils.normalizeHeaders(normalizeHeadersParams),
        span
      )
    }

    const patternMatcher = actHeaders.local ? this.localPatternMatcher : this.globalPatternMatcher
    const result = patternMatcher.lookup(pattern, { patterns: true, payloads: true })
    if (!result) {
      return this.emitError(
        errors.NotFoundError(`Pattern not found: ${utils.beautify(sourceMessage)}`),
        utils.normalizeHeaders(normalizeHeadersParams),
        span
      )
    }

    const matchedPattern = result.pattern
    const [payload, addHeaders] = result.payload
    span.setTag('bishop.act.match', utils.beautify(matchedPattern))

    // resulting message headers (heders from .act will rewrite headers from .add by default)
    normalizeHeadersParams.addHeaders = addHeaders
    normalizeHeadersParams.matchedPattern = matchedPattern
    const headers = utils.normalizeHeaders(normalizeHeadersParams)

    const slowTimeoutWarning = headers.slow
      ? parseInt(headers.slow, 10)
      : this.config.slowPatternTimeout
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

    if (slowTimeoutWarning) {
      // emit warning about slow timeout in the end of execution chain
      utils.registerGlobal(
        executionChain,
        utils.createSlowExecutionWarner(slowTimeoutWarning, actStarted, headers, this.log)
      )
    }

    if (executionChain.length > this.config.maxExecutionChain) {
      const text = `execution chain for ${utils.beautify(sourceMessage)} is too big (${
        executionChain.length
      })`

      this.log.warn(text)
    }

    const chainRunnerAsync = utils.createChainRunnerPromise({
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
      finishSpan(span)
      return Promise.resolve({ message: undefined, headers })
    }

    if (!timeout) {
      // no need to handle timeout
      return chainRunnerAsync().tap(() => {
        finishSpan(span)
      })
    }

    return chainRunnerAsync()
      .timeout(timeout)
      .catch(Promise.TimeoutError, () => {
        return this.emitError(
          errors.TimeoutError(
            `pattern timeout after ${timeout}ms: ${utils.beautify(headers.source)}`
          ),
          headers,
          span
        )
      })
      .tap(() => {
        finishSpan(span)
      })
  }
}

module.exports = Bishop
