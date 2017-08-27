const bloomrun = require('bloomrun')
const ld = require('lodash')
const { EventEmitter2 } = require('eventemitter2')
const LRU = require('lru-cache')

const { validateOrThrow } = require('./validator')
const { beautify, normalizePattern, routingKeyFromPattern } = require('./utils')

const uniqueIds = LRU({
  maxAge: 60 * 1000
})

class Bishop extends EventEmitter2 {

  constructor(_options) {
    super({ wildcard: true })
    const options = this.options = ld.cloneDeep(_options || {})
    validateOrThrow(this.options, 'options')

    this.patternMatcher = bloomrun({ indexing: options.matchOrder })

    this.on('warning', console.log)
  }

/**
 *
 */
  add(...args) {
    const payload = args.pop()
    if (!ld.isFunction(payload)) {
      throw new Error('.add: please pass payload in last argument')
    }
    const { pattern, options } = normalizePattern(...args)
    if (this.options.forbidSameRouteNames) {
      const foundPattern = this.patternMatcher.lookup(pattern, { patterns: true })
      if (ld.isEqual(foundPattern, pattern)) {
        throw new Error(`.add: .forbidSameRouteNames option is enabled, and pattern already exists: ${beautify(pattern)}`)
      }
    }

    this.patternMatcher.add(pattern, { payload, options })
  }

/**
 *
 */
 act(...args) {
   const { pattern } = normalizePattern(...args)
   const { payload, options } = this.patternMatcher.lookup(pattern)
   const result = payload(pattern, options)
   const eventName = routingKeyFromPattern(pattern).join('.')
   this.emit(eventName, result, pattern, options)
   return result
 }

/**
 *
 */
 follow(...args) {
   const listener = args.pop()
   if (!ld.isFunction(listener)) {
     throw new Error('.follow: please pass listener in last argument')
   }
   const { pattern } = normalizePattern(...args)
   const eventName = `**.${routingKeyFromPattern(pattern).join('.**.')}.**`

   function handler(output, inputPattern, inputOptions) {
     const { id } = inputOptions

     if (uniqueIds.has(id)) {
       return this.emit('warning', `message with #${id} was handled before`)// do not emit same message twice
     }
     uniqueIds.set(id, true)

     try {
       const result = listener(output, inputPattern, inputOptions)
       this.emit(`notify.${id}.success`, result, inputPattern, inputOptions)
     } catch (err) {
       this.emit(`notify.${id}.fail`, err, inputPattern, inputOptions)
     }

   }
   this.on(eventName, handler)
 }

// /**
// WARN: register('before|after', pattern, handler) order not guaranteed
// .register('before', handler)
// .register('before', pattern, handler)
// .register('after', handler)
// .register('after', pattern, handler)
// .register('remote', name, handler, options)
// .register('transport', name, instance, [options])
//  */
//   register(...params) {
//     const [ type, arg1, arg2, arg3 ] = params
//
//     switch (type) {
//       case 'remote': // backward
//         utils.registerRemoteTransport(this.transports, arg1,
//           utils.ensureIsFuction(arg2, '.register remote: please pass valid Promise as second paramerer'),
//         arg3)
//         this.followableTransportsEnum = Object.keys(this.transports).filter(name => {
//           return this.transports[name].follow // `follow` method exists in transport
//         })
//         return
//       case 'transport':
//         utils.registerTransport(this.transports, arg1, arg2, arg3)
//         this.followableTransportsEnum = Object.keys(this.transports).filter(name => {
//           return this.transports[name].follow // `follow` method exists in transport
//         })
//         return
//       case 'before':
//         return arg2 ? utils.registerInMatcher(this.beforePatternMatcher, arg1, utils.ensureIsFuction(arg2)) :
//           utils.registerGlobal(this.beforeGlobalHandlers, utils.ensureIsFuction(arg1))
//       case 'after':
//         return arg2 ? utils.registerInMatcher(this.afterPatternMatcher, arg1, utils.ensureIsFuction(arg2)) :
//           utils.registerGlobal(this.afterGlobalHandlers, utils.ensureIsFuction(arg1))
//       default:
//         throw new Error('.register(before|after|transport, ...)')
//     }
//   }
//
//   // remove pattern from pattern matcher instance
//   remove(message) {
//     const [ pattern ] = utils.split(message)
//     this.globalPatternMatcher.remove(pattern)
//     this.localPatternMatcher.remove(pattern)
//   }
//
//   // load module with routes
//   async use(plugin, ...options) {
//     utils.ensureIsFuction(plugin, '.use: function expected, but not found')
//     return plugin(this, ...options)
//   }
//
//   // find first matching service by pattern, and execute it
//   //  $timeout - redefine global request timeout for network requests
//   //  $slow - emit warning if pattern executing more than $slow ms
//   //  $local - search only in local patterns, skip remote transports
//   //  $nowait - resolve immediately (in case of local patterns), or then message is sent (in case of transports)
//   //  $notify - emit event to global listeners
//   async act() {
//     return this.actRaw(...arguments).then(({ message }) => message)
//   }
//
//   async actRaw(message, ...payloads) {
//
//     const actStarted = utils.calcDelay(null, false)
//     const [ pattern, actHeaders, sourceMessage ] = utils.split(message, ...payloads)
//
//     const normalizeHeadersParams = { actHeaders, sourceMessage,
//       notifyableTransportsEnum: this.notifyableTransportsEnum
//     }
//
//     if (ld.isEmpty(message)) {
//       return this.emitError(
//         new Error('.act: please specify at least one search pattern'),
//         utils.normalizeHeaders(normalizeHeadersParams)
//       )
//     }
//
//     const patternMatcher = actHeaders.local ? this.localPatternMatcher : this.globalPatternMatcher
//     const result = patternMatcher.lookup(pattern, { patterns: true, payloads: true })
//     if (!result) {
//       return this.emitError(
//         new Error(`pattern not found: ${utils.beautify(sourceMessage)}`),
//         utils.normalizeHeaders(normalizeHeadersParams)
//       )
//     }
//
//     const matchedPattern = result.pattern
//     const [ payload, addHeaders ] = result.payload
//
//     // resulting message headers (heders from .act will rewrite headers from .add by default)
//     normalizeHeadersParams.addHeaders = addHeaders
//     normalizeHeadersParams.matchedPattern = matchedPattern
//     const headers = utils.normalizeHeaders(normalizeHeadersParams)
//
//     const slowTimeoutWarning = headers.slow ? parseInt(headers.slow, 10) : this.config.slowPatternTimeout
//     const timeout = headers.timeout ? parseInt(headers.timeout, 10) : this.config.timeout
//
//     // 2do: think about execution chain caching
//     // travel over all patterns and return pass-thru chain of service calls
//     const executionChain = [
//       ...this.beforeGlobalHandlers,
//       ...this.beforePatternMatcher.list(pattern).reverse(),
//       utils.createPayloadWrapper(payload, headers, this.transports),
//       ...this.afterPatternMatcher.list(pattern),
//       ...this.afterGlobalHandlers
//     ]
//
//     if (slowTimeoutWarning) { // emit warning about slow timeout in the end of execution chain
//       utils.registerGlobal(
//         executionChain,
//         utils.createSlowExecutionWarner(slowTimeoutWarning, actStarted, headers, this.log)
//       )
//     }
//
//     if (executionChain.length > this.config.maxExecutionChain) {
//       this.log.warn(`execution chain for ${utils.beautify(sourceMessage)} is too big (${executionChain.length})`)
//     }
//
//     const chainRunnerAsync = utils.createChainRunnerPromise({
//       executionChain,
//       pattern,
//       headers,
//       errorHandler: this.emitError,
//       globalEmitter: this.eventEmitter,
//       transports: this.transports,
//       log: this.log
//     })
//
//     if (headers.nowait) { // sometimes client dont want to wait, so we simply launch chain in async mode
//       chainRunnerAsync()
//       return Promise.resolve({ message: undefined, headers })
//     }
//
//     if (!timeout) { // no need to handle timeout
//       return chainRunnerAsync()
//     }
//
//     return chainRunnerAsync()
//       .timeout(timeout)
//       .catch(Promise.TimeoutError, () => {
//         return this.emitError(
//           new Error(`pattern timeout after ${timeout}ms: ${utils.beautify(headers.source)}`),
//           headers
//         )
//       })
//     }

}

module.exports = Bishop
