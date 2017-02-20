const bloomrun = require('bloomrun')
const ld = require('lodash')
const { objectify, runMethodsParallel, isFunction, calcDelay, requirePlugin } = require('./utils')
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
  debug: false,
  // emit warning on slow execution in ms
  slowPatternTimeout: null,
  // handle only user errors by default and fall down on others
  // example: ReferenceError, RangeError, SyntaxError, TypeError, Error, ...
  // own sync function can be passed
  terminateOn: ['ReferenceError', 'RangeError', 'SyntaxError', 'TypeError']
}

const Bishop = (_config = {}, logger = console) => {
  const config = ld.assign({}, defaultConfig, _config)

  // create two pattern matchers: matcher with all patterns (local + network), and local only
  const pm = bloomrun({ indexing: config.matchOrder })
  const pmLocal = bloomrun({ indexing: config.matchOrder })

  // check if error should be passed to caller instead of throwing
  const errorHandler = isFunction(config.terminateOn) ? config.terminateOn : err => {
    if (config.terminateOn.includes(err.name)) {
      logger.error(err)
      process.exit(1)
    }
    // falsy - handle error (return to sender, emit message etc)
    // truthy - mute error (ex: error already logged)
    return false
  }

  return {

    timeout: config.timeout,

    // default logger for bishop instances
    log: logger,

    // keep all named routes here
    routes: {},

    // loaded remote connectors for further usage
    transport: {},

    registerWrapper: {},

    // append handler for route (local or remote)
    // .add(route, function) // execute local payload
    // .add(route, 'wrapper', wrapper, 'transportname') // execute payload using transport
    // .add(route, 'transportname') // execute payload using transport
    add(sourcePattern, ...wrappers) {
      const handler = wrappers[wrappers.length - 1]
      if (!handler || !isFunction(handler)) {
        throw new Error('.add: please pass callback as last argument')
      }
      const pattern = objectify(sourcePattern)

      if (config.forbidSameRouteNames) { // ensure same route not yet exists
        const foundPattern = pm.lookup(pattern, { patterns: true })
        if(ld.isEqual(foundPattern, pattern)) {
          throw new Error(`.forbidSameRouteNames option is enabled, and pattern already exists: ${JSON.stringify(pattern)}`)
        }
      }

      const isLocalPattern = isFunction(handler)
      const data = { wrappers }

      pm.add(pattern, data)
      if (isLocalPattern) {
        pmLocal.add(pattern, data)
      }
    },

    remove(sourcePattern) {
      const pattern = objectify(sourcePattern)
      pm.remove(pattern)
      pmLocal.remove(pattern)
    },

    // $timeout - redefine global request timeout for network requests
    // $slow - emit warning if pattern executing more than $slow ms
    // $local - search only in local patterns, skip remote transporting
    // $nowait - resolve immediately (in case of local patters), or then message is sent (in case of transports)
    async act(sourcePattern, ...payloads) {
      const patternStarted = calcDelay(null, false)
      if (!sourcePattern) {
        throw new Error('.act: please specify at least one search pattern')
      }
      const pattern = ld.assign({}, objectify(sourcePattern), ...payloads)
      const slowTimeout = config.slowPatternTimeout || pattern.$slow
      const timeout = pattern.$timeout || this.timeout

      const matchResult = (pattern.$local ? pmLocal : pm).lookup(pattern, {
        patterns: true,
        payloads: true
      })
      if (!matchResult) {
        throw new Error(`pattern not found: ${JSON.stringify(pattern)}`)
      }

      const { wrappers } = matchResult.payload
      // debug.push('pattern matched', matchResult.pattern)

      const handler = wrappers.pop()
      const isLocalPattern = isFunction(handler)
      let executeChain
      if (isLocalPattern) {
        // wrappers
        executeChain = handler
      } else {
        // wrap with network call
        if (!this.transport[handler] || !this.transport[handler].send) {
          throw new Error(`transport "${handler}" not exists`)
        }
        executeChain = this.transport[handler].send
      }

      const doPostOperations = () => {
        if (slowTimeout) {
          const executionTime = calcDelay(patternStarted, false)
          if (executionTime > slowTimeout) {
            this.log.warn(`pattern executed in ${executionTime}ms: ${JSON.stringify(pattern)}`)
          }
        }
      }


      const executor = isLocalPattern && pattern.$nowait ? (...input) => {
        Promise.resolve(executeChain(...input)).catch(err => {
          // in case of local pattern - resolve immediately and emit error on fail
          // in case of transports - they should respect $nowait flag and emit errors manually
          const muteError = errorHandler(err)
          if (!muteError) { this.log.error(err) }
        })
        doPostOperations()
        return Promise.resolve()
      }: async (...input) => {
        let result = null
        try {
          result = await executeChain(...input)
        } catch (err) {
          const muteError = errorHandler(err)
          if (!muteError) { throw err }
        }
        doPostOperations()
        return result
      }

      if (!timeout) {
        return executor(pattern)
      }
      return Promise
        .resolve(executor(pattern))
        .timeout(timeout)
        .catch(Promise.TimeoutError, () => {
          throw new Error(`pattern timeout after ${timeout}ms: ${JSON.stringify(pattern)}`)
        })
    },

    // load plugin, module etc
    async use(...input) {
      const [ path, ...params ] = input
      const plugin = requirePlugin(path)
      if (!isFunction(plugin)) { throw new Error('unable to load plugin: function expected, but not found') }
      const data = await plugin(this, ...params)
      if (!data) { return } // this plugin dont return any suitable data

      const { name, routes } = data

      switch (data.type) {

        case 'transport': // transport connection
          if (!name) { throw new Error('transport plugins should return .name property') }
          this.transport[name] = data
          break

        default: // plugin with business logic
          if (name && routes) {
            this.routes[name] = this.routes[name] || {}
            ld.assign(this.routes[name], routes)
          }
      }
      return data
    },

    // connect to all remote instances
    async connect() {
      await runMethodsParallel(this.transport, 'connect')
    },

    // disconnect from all remote instances
    async disconnect() {
      await runMethodsParallel(this.transport, 'disconnect')
    },

    // listen all transports
    async listen() {
      await runMethodsParallel(this.transport, 'listen')
    },

    // disconnect from all transports
    async close() {
      await runMethodsParallel(this.transport, 'close')
    }
  }
}

module.exports = Bishop
