const patrun = require('patrun')
const ld = require('lodash')
const { objectify } = require('./utils')

const defaultConfig = {
  timeout: 500
}

module.exports = (_config = {}) => {
  const pmAll = patrun({ gex:true })
  const pmLocal = patrun({ gex:true })

  const config = ld.assign({}, defaultConfig, _config)

  return {

    log: console,

    routes: {},

    // loaded remote connectors
    remote: {},

    // append handler for route (local or remote)
    // .add(route, function)
    // .add(route, 'transportname')
    add(_route, handler) {
      const route = objectify(_route)
      const transport = ld.isFunction(handler) ? 'local' : handler

      const options = { transport }
      if (transport === 'local') {
        options.handler = handler
        pmLocal.add(route, options)
      }
      pmAll.add(route, options)
    },

    // expect options as last parameter
    // $timeout - redefine global request timeout
    // $local - search only in local patterns, dont request remote connections
    // $nowait - resolve then message is sent, dont wait for answer {not implemented}
    async act(route, payload = {}) {

      if (!route) { throw new Error('route not specified') }
      const pattern = ld.assign({}, objectify(route), payload)
      const matchResult = (pattern.$local ? pmLocal : pmAll).find(pattern)
      if (!matchResult) {
        throw new Error(`route ${JSON.stringify(route)}: not found`)
      }

      const { transport, handler } = matchResult
      const executor = transport === 'local' ? handler : this.remote[transport].act

      // setup ttl and execute payload
      const timeout = pattern.$timeout || config.timeout
      const timer = setTimeout(() => {
        throw new Error(`route ${JSON.stringify(route)}: timeout after ${timeout}ms`)
      }, timeout)
      const result = await executor(pattern)
      clearTimeout(timer)
      return result
    },

    // load plugin, module etc
    async use(input, options) {
      const plugin = typeof input === 'string' ? require(input) : input
      if (!ld.isFunction(plugin)) { throw new Error('.use: function expected') }

      const data = await plugin(this, options)

      if (!data) { return } // no data returned
      const { name, routes } = data

      switch (data.type) {

        case 'remote': // transport connection
          if (!name) { throw new Error('.use: remote plugins should contain names') }
          this.remote[name] = data
          break

        default: // plugin with business logic
          if (name && routes) {
            this.routes[name] = this.routes[name] || {}
            ld.assign(this.routes[name], routes)
          }
      }
    },

    // listen(name, options) {
    //   //
    // }

  }
}
