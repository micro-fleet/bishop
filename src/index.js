const bloomrun = require('bloomrun')
const ld = require('lodash')
const { objectify, runMethodsParallel, isFunction } = require('./utils')
const Promise = require('bluebird')

// default options for bishop instance
const defaultConfig = {
  forbidSameRouteNames: false,
  //  if set to insertion, it will try to match entries in insertion order
  //  if set to depth, it will try to match entries with the most properties first
  matchOrder: 'depth', // insertion, depth
  // default timeout for pattern execution in ms
  timeout: 500,
  // append debbugin information into response
  debug: false,
  // emit warning on slow execution in ms
  slowPatternTimeout: null,
  // handle only user errors by default and fall down on others
  // example: ReferenceError, RangeError, SyntaxError, TypeError, Error, ...
  // own sync function can be passed
  terminateOn: ['ReferenceError', 'RangeError', 'SyntaxError', 'TypeError'],
  // logger options for 'pino' logger: https://www.npmjs.com/package/pino#pinoopts-stream
  // own logger instance can be passed here, should support at lease: 'debug, info, warn, error'
  log: {
    name: 'bishop'
  },
  defaultLogger: 'pino'
}

const Bishop = (_config = {}) => {
  const config = ld.assign({}, defaultConfig, _config)

  // set passed logger instance, or create 'pino' logger with passed options
  const logger = (() => {
    if (!ld.isPlainObject(config.log)) { // logger instance passed
      return config.log
    }
    try {
      return require(config.defaultLogger)(ld.clone(config.log))
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND') {
        err.message = `Logger not found, please install it: npm install --save ${config.defaultLogger}`
      }
      throw err
    }
  })()

  // create two pattern matchers: matcher with all patterns (local + network), and local only
  const pm = bloomrun({ indexing: config.matchOrder })
  const pmLocal = bloomrun({ indexing: config.matchOrder })

  // check if error should be passed to caller instead of throwing
  const errorHandler = isFunction(config.terminateOn) ? config.terminateOn : err => {
    if (config.terminateOn.includes(err.name)) {
      logger.fatal(err)
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

    // append handler for route (local or remote)
    // .add(route, function) // execute local payload
    // .add(route, 'transportname') // execute payload using transport
    add(_pattern, handler) {

      const type = isFunction(handler) ? 'local' : handler
      const pattern = objectify(_pattern)
      const payload = { type, handler }

      if (config.forbidSameRouteNames && pm.lookup(pattern, { patterns: true })) { // ensure same route not yet exists
        throw new Error(`.forbidSameRouteNames option is enabled, and pattern already exists: ${JSON.stringify(pattern)}`)
      }

      pm.add(pattern, payload)
      if (type === 'local') {
        pmLocal.add(pattern, payload)
      }
    },

    remove(_pattern) {
      pm.remove(objectify(_pattern))
      pmLocal.remove(objectify(_pattern))
    },

    // $timeout - redefine global request timeout for network requests
    // $local - search only in local patterns, skip remote transporting
    // $nowait - resolve immediately (in case of local patters), or then message is sent (in case of transports)
    async act() {
      const [ _pattern, ...payloads ] = arguments
      if (!_pattern) { throw new Error('pattern not specified') }
      const pattern = ld.assign({}, objectify(_pattern), ...payloads)

      const matchResult = (pattern.$local ? pmLocal : pm).lookup(pattern)
      if (!matchResult) {
        throw new Error(`pattern not found: ${JSON.stringify(pattern)}`)
      }

      const { type, handler } = matchResult
      const isLocalPattern = type === 'local'
      let method
      if (isLocalPattern) {
        method = handler
      } else {
        // wrap with network call
        if (!this.transport[type] || !this.transport[type].send) {
          throw new Error(`transport "${type}" not exists`)
        }
        method = this.transport[type].send
      }

      const slowPatternTimer = (() => {
        const slowTimeout = config.slowPatternTimeout || pattern.$slowTimeout
        if (slowTimeout) {
          return setTimeout(this.log.warn.bind(this.log), slowTimeout, `pattern executing more than ${slowTimeout}ms: ${JSON.stringify(pattern)}`)
        }
      })()
      const clearSlowPatternTimer = () => {
        if (slowPatternTimer) { clearTimeout(slowPatternTimer) }
      }
      const executor = isLocalPattern && pattern.$nowait ? (...input) => {
        Promise.resolve(method(...input)).catch(err => {
          // in case of local pattern - resolve immediately and emit error on fail
          // in case of transports - they should respect $nowait flag and emit errors manually
          const muteError = errorHandler(err)
          if (!muteError) { this.log.error(err) }
        })
        clearSlowPatternTimer()
        return Promise.resolve()
      }: async (...input) => {
        let result
        try {
          input.push('$wtf') // 2do: wtf - test 'emit pattern' from local.js is failing without it
          result = await method(...input)
        } catch (err) {
          const muteError = errorHandler(err)
          if (!muteError) { throw err }
        }
        clearSlowPatternTimer()
        return result
      }

      const timeout = pattern.$timeout || this.timeout

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
      const plugin = ld.isString(path) ? require(path) : path
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
