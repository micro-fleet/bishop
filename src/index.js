const patrun = require('patrun')
const ld = require('lodash')
const { objectify } = require('./utils')

const defaultConfig = {
  timeout: 500
}

module.exports = (_config = {}) => {
  const pm = patrun({ gex:true })
  const config = ld.assign({}, defaultConfig, _config)

  return {

    log: console,

    routes: {},

    // loaded remote connectors
    remote: {},

    // append handler for route (local or remote)
    // .add(route, function) // execute local payload
    // .add(route, 'transportname') // execute payload using transport
    add(_pattern, handler) {
      const $type = ld.isFunction(handler) ? 'local' : handler
      const pattern = ld.assign({} , objectify(_pattern), { $type })
      pm.add(pattern, {
        type: $type,
        handler: handler
      })
    },

    // expect options as last parameter
    // $timeout - redefine global request timeout
    // $type - search only in specified transports (default: 'local')
    // $nowait - resolve then message is sent, dont wait for answer {not implemented}
    async act(_pattern, payload = {}) {

      if (!_pattern) { throw new Error('pattern not specified') }
      const pattern = ld.assign({}, objectify(_pattern), payload)
      const matchResult = pm.find(pattern)
      if (!matchResult) {
        throw new Error(`pattern not found: ${JSON.stringify(pattern)}`)
      }

      const { type, handler } = matchResult
      const executor = type === 'local' ? handler : this.remote[type].act

      // setup ttl and execute payload
      const timeout = pattern.$timeout || config.timeout
      const timer = setTimeout(() => {
        throw new Error(`pattern timeout after ${timeout}ms: ${JSON.stringify(pattern)}`)
      }, timeout)
      const result = await executor(pattern)
      clearTimeout(timer)
      return result
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
