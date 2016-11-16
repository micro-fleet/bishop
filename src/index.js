const patrun = require('patrun')
const ld = require('lodash')
const { EventEmitter } = require('events')
const { objectify } = require('./utils')
const Promise = require('bluebird')


const defaultConfig = {
  timeout: 500
}

const Bishop = (_config = {}) => {

  const pm = patrun({ gex:true })
  const pmLocal = patrun({ gex:true })
  const config = ld.assign({}, defaultConfig, _config)

  return {

    events: new EventEmitter(),

    routes: {},

    // loaded remote connectors
    remote: {},

    // append handler for route (local or remote)
    // .add(route, function) // execute local payload
    // .add(route, 'transportname') // execute payload using transport
    add(_pattern, handler) {
      const type = ld.isFunction(handler) ? 'local' : handler
      const pattern = objectify(_pattern)
      const payload = { type, handler }

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
    async act(_pattern, payload = {}) {

      if (!_pattern) { throw new Error('pattern not specified') }
      const pattern = ld.assign({}, objectify(_pattern), payload)
      const matchResult = (pattern.$local ? pmLocal : pm).find(pattern)
      if (!matchResult) {
        throw new Error(`pattern not found: ${JSON.stringify(pattern)}`)
      }

      const { type, handler } = matchResult
      const isLocalPattern = type === 'local'

      const method = isLocalPattern ? handler : this.remote[type].act // wrap with network call

      // in case of local pattern - resolve immediately and emit error on fail
      // in case of transports - they should respect $nowait flag and emit errors manually
      // all errors durning execution progress should be emitted as async using `this.events` eventemitter
      const executor = isLocalPattern && pattern.$nowait ? (...input) => {
        method(...input).catch(err => this.events.emit('error', err))
        return Promise.resolve()
      }: method

      // setup ttl and execute payload
      const timeout = pattern.$timeout || config.timeout

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
      if (!ld.isFunction(plugin)) { throw new Error(`unable to load plugin: function expected, but ${plugin} found`) }

      const data = await plugin(this, ...params)
      if (!data) { return } // this plugin dont return any suitable data

      const { name, routes } = data

      switch (data.type) {

        case 'remote': // transport connection
          if (!name) { throw new Error('remote plugins should contain names') }
          this.remote[name] = data
          break

        default: // plugin with business logic
          if (name && routes) {
            this.routes[name] = this.routes[name] || {}
            ld.assign(this.routes[name], routes)
          }
      }
    }

  }
}

module.exports = Bishop
