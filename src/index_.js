const bloomrun = require('bloomrun')
const ld = require('lodash')
const { objectify, runMethodsParallel, isFunction, calcDelay, requirePlugin, throwError, stringify } = require('./utils')
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
  // handle only user errors by default and fall down on others
  // example: ReferenceError, RangeError, SyntaxError, TypeError, Error, ...
  // own sync function can be passed
  terminateOn: ['ReferenceError', 'RangeError', 'SyntaxError', 'TypeError', 'Error']
}

const Bishop = (_config = {}, logger = console) => {
  const config = ld.assign({}, defaultConfig, _config)
  // additional wrappers which can be executed durning .act
  const registeredWrappers = {}

  // create two pattern matchers: matcher with all patterns (local + network), and local only
  const pm = bloomrun({ indexing: config.matchOrder })
  const pmLocal = bloomrun({ indexing: config.matchOrder })
  const pmWrappers = bloomrun({ indexing: config.matchOrder })

  // check if error should be passed to caller instead of throwing
  const errorHandler = isFunction(config.terminateOn) ? config.terminateOn : err => {
    if (config.terminateOn.includes(err.name)) {
      throw err
    }
    // falsy - handle error (return to sender, emit message etc)
    // truthy - mute error (ex: error already logged)
    return false
  }

  const emitSlowTimeoutWarning = (patternStarted, slowTimeout, pattern) => {
    const executionTime = calcDelay(patternStarted, false)
    if (executionTime > slowTimeout) {
      logger.warn(`pattern executed in ${executionTime}ms: ${JSON.stringify(pattern)}`)
    }
  }

  const executeChain = (message, chain, options) => {
    const { immediate, ctx } = options
    const timeout = message.$timeout || ctx.timeout

    const internalErrorHandler = err => {
      const muteError = errorHandler(err)
      if (!muteError) { ctx.log.error(err) }
    }

    const executor = () => {
      return Promise.reduce(chain, (input, [ method, ...parameters]) => method(input, ...parameters), message).catch(internalErrorHandler)
    }

    if (immediate) {
      executor()
      return Promise.resolve()
    }

    if (!timeout) {
      return executor()
    }

    return Promise
      .resolve(executor())
      .timeout(timeout)
      .catch(Promise.TimeoutError, () => {
        throw new Error(`pattern timeout after ${timeout}ms: ${stringify(message)}`)
      })
  }

  const getExecutionChain = (message, expressLikeWrappers = []) => {
    // 1) search all wrappers via pattern-matching-style
    // 2) execute all wrappers via expressjs-style
    return pmWrappers.list(message).concat(...expressLikeWrappers).reduce((arr, method) => {
      if (typeof method !== 'string') { // local function
        arr.push([ method ])
      } else { // remote function
        const [ methodName, ...parameters] = method.split(':')
        const { wrapper, options } = registeredWrappers[methodName]
        if (!wrapper) {
          throw new Error(`looks like ${method} handler is not registered via .register method`)
        }
        if (options.timeout) { // update timeout on external transport
          message.$timeout = options.timeout
        }
        arr.push([ wrapper, ...parameters ])
      }
      return arr
    }, [])
  }

  return {

    timeout: config.timeout,

    // default logger for bishop instances
    log: logger,

    // keep all named routes here
    routes: {},

    // loaded remote connectors for further usage
    transport: {},

    register(name, wrapper, options = {}) {
      const [ externalMethodName ] = name.split(':')
      if (registeredWrappers[externalMethodName]) {
        throw new Error(`wrapper ${externalMethodName} already registered`)
      }
      registeredWrappers[name] = { wrapper, options }
    },

    // registered wrapper will be executed on pattern match before .act will emit
    wrap(sourcePattern, wrapper) {
      if (!wrapper || !isFunction(wrapper)) {
        throw new Error('.wrap: please pass callback as last argument')
      }
      pmWrappers.add(
        objectify(sourcePattern),
        wrapper
      )
    },

    // append handler for route (local or remote)
    // .add(route, function) // execute local payload
    // .add(route, 'wrapper', wrapper, 'transportname') // execute payload using transport
    // .add(route, 'transportname') // execute payload using transport
    add(sourcePattern, ...wrappers) {
      const handler = wrappers[wrappers.length - 1] || throwError(new Error('.add: please pass handler as last argument'))
      const pattern = objectify(sourcePattern)

      if (config.forbidSameRouteNames) { // ensure same route not yet exists
        const foundPattern = pm.lookup(pattern, { patterns: true })
        if(ld.isEqual(foundPattern, pattern)) {
          throwError(new Error(`.forbidSameRouteNames option is enabled, and pattern already exists: ${stringify(pattern)}`))
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
      if (!sourcePattern) {
        throw new Error('.act: please specify at least one search pattern')
      }
      const actBeginTimestamp = calcDelay(null, false)
      const pattern = ld.assign({}, objectify(sourcePattern), ...payloads)

      const matchResult = (pattern.$local ? pmLocal : pm).lookup(pattern, { patterns: true, payloads: true })

      if (!matchResult) {
        throw new Error(`pattern not found: ${stringify(pattern)}`)
      }

      const { wrappers } = matchResult.payload // array of wrappers for specified pattern
      const handler = wrappers[wrappers.length - 1] // last wrapper is required business-logic
      const isLocalPattern = isFunction(handler)

      // create execution chain
      const chain = await getExecutionChain(pattern, wrappers)

      const slowTimeoutWarning = config.slowPatternTimeout || pattern.$slow
      if (slowTimeoutWarning) { // emit warning about slow timeout in the end of execution chain
        chain.push([ emitSlowTimeoutWarning, actBeginTimestamp, slowTimeoutWarning, pattern ])
      }

      return executeChain(pattern, chain, {
        // in case of local pattern - resolve immediately and emit error on fail
        // in case of transports - they should respect $nowait flag and emit errors manually
        immediate: isLocalPattern && pattern.$nowait,
        ctx: this
      })
    },

    // load plugin, module etc
    async use(path, options) {
      const plugin = requirePlugin(path)
      if (!isFunction(plugin)) {
        throw new Error('unable to load plugin: function expected, but not found')
      }

      const data = await plugin(this, options)
      if (!data) { return } // this plugin dont return any suitable data
      const { name, routes } = data

      switch (data.type) {

        case 'transport': // transport connection
          if (!name) { throw new Error('transport plugins should return .name property') }
          this.transport[name] = data
          // register transport as local wrapper
          this.register(name, this.transport[name].send, options)
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
