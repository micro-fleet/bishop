const bloomrun = require('bloomrun')
const ld = require('lodash')
const { objectify, calcDelay, throwError, stringify } = require('./utils')
const Promise = require('bluebird')

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
  onError: null,
  // default logger instance
  logger: console
}

class Bishop {
  constructor(userConfig) {

    const config = this.config = Object.assign({}, defaultConfig, userConfig)
    this.log = config.logger
    this.onError = config.onError

    this.globalPatternMatcher = bloomrun({ indexing: config.matchOrder })
    this.localPatternMatcher = bloomrun({ indexing: config.matchOrder })
    this.chainPatternMatcher = bloomrun({ indexing: config.matchOrder })

    this.registeredWrappers = {}
  }

  // register service for specified pattern
  add(_pattern, service) {
    const pattern = objectify(_pattern)
    if (!service) {
      throwError(new Error('please pass pattern handler as last parameter'))
    }

    if (this.config.forbidSameRouteNames) { // ensure same route not yet exists
      const foundPattern = this.globalPatternMatcher.lookup(pattern, { patterns: true })
      if(ld.isEqual(foundPattern, pattern)) {
        throwError(new Error(`.forbidSameRouteNames option is enabled, and pattern already exists: ${stringify(pattern)}`))
      }
    }

    this.globalPatternMatcher.add(pattern, service) // add service to global pattern matcher
    if (pattern.$local || ld.isFunction(service)) { // also register service as local function (opposite to remote network calls)
      this.localPatternMatcher.add(pattern, service)
    }
  }

  // remove pattern from pattern matcher instance
  remove(_pattern) {
    const pattern = objectify(_pattern)
    this.globalPatternMatcher.remove(pattern)
    this.localPatternMatcher.remove(pattern)
  }

  // find first matching service by pattern, and execute it
  //  $timeout - redefine global request timeout for network requests
  //  $slow - emit warning if pattern executing more than $slow ms
  //  $local - search only in local patterns, skip remote transports
  //  $nowait - resolve immediately (in case of local patterns), or then message is sent (in case of transports)
  async act(_pattern, ...payloads) {
    if (!_pattern) {
      return throwError(new Error('.act: please specify at least one search pattern'))
    }
    const actStarted = calcDelay(null, false)
    const pattern = ld.assign({}, objectify(_pattern), ...payloads)
    const patternMatcher = pattern.$local ? this.localPatternMatcher : this.globalPatternMatcher
    const result = patternMatcher.lookup(pattern, { patterns: true, payloads: true })
    if (!result) {
      return throwError(new Error(`pattern not found: ${stringify(pattern)}`))
    }
    // result.pattern = found pattern
    const service = result.payload

    // travel over all patterns and return pass-thru chain of service calls
    // 2do: think about caching

    const executionChain = this.chainPatternMatcher.list(pattern).reduce((chain, method) => {
      if (typeof method !== 'string') { // local function is registered
        chain.push(method)
      } else { // remote function expected: should look for registered transport wrapper and return ready call
        const { wrapper, options } = this.registeredWrappers[method] || {}
        if (!wrapper) {
          throwError(new Error(`looks like ${method} handler is not registered via .register`))
        }
        if (options.timeout && !pattern.$timeout) { // redefine pattern timeout if transport-specific is set
          pattern.$timeout = options.timeout
        }
        chain.push(wrapper)
      }
      return chain
    }, [])
    executionChain.push(service)

    const slowTimeoutWarning = this.config.slowPatternTimeout || parseInt(pattern.$slow, 10)
    const isLocalPattern = pattern.$local || ld.isFunction(service)
    const timeout = pattern.$timeout || this.config.timeout

    if (slowTimeoutWarning) { // emit warning about slow timeout in the end of execution chain
      executionChain.push(message => {
        const executionTime = calcDelay(actStarted, false)
        if (executionTime > slowTimeoutWarning) {
          this.log.warn(`pattern executed in ${executionTime}ms: ${stringify(pattern)}`)
        }
        return message
      })
    }

    // execute found chain and return result to client
    const chainRunner = () => {
      return Promise.reduce(executionChain, (input, method) => method(input), pattern)
        // .catch(err => {
        //   console.log('????', err)
        //   // 2do: do something with error
        // })
    }

    if (pattern.$nowait && isLocalPattern) {
      // sometimes client dont want to wait, so we simply launch chain in async mode
      chainRunner()
      return Promise.resolve()
    }

    if (!timeout) { // no need to handle timeout
      return chainRunner()
    }

    return Promise
      .resolve(chainRunner())
      .timeout(timeout)
      .catch(Promise.TimeoutError, () => {
        throw new Error(`pattern timeout after ${timeout}ms: ${stringify(pattern)}`)
      })
    }
}

module.exports = Bishop
