const patrun = require('patrun')
const ld = require('lodash')
const { objectify } = require('./utils')

module.exports = () => {
  const pmAll = patrun({ gex:true })
  const pmLocal = patrun({ gex:true })

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
    // .local - search only in local patterns
    // .nowait - resolve on message success send, dont wait for answer
    async actCustom(...input) {
      const [ route, payload = {}, options = {} ] = input

      const pattern = (() => {
        if (input.length <= 2) { // expect second parameter as 'options'
          return objectify(route)
        }
        // expect second parameter as 'payload'
        return Object.assign({}, objectify(route), payload)
      })()

      const { local } = options
      const matchResult = (local ? pmLocal : pmAll).find(pattern)
      if (!matchResult) {
        // console.log('>>>>> pattern:')
        // console.log(pattern)
        // console.log('>>>>> all patterns:')
        // console.log(pmAll.list({}))
        throw new Error(`route ${JSON.stringify(route)} not found`)
      }

      const { transport, handler } = matchResult
      if (transport === 'local') {
        return await handler(pattern)
      }
      const remoteHandler = this.remote[transport].act
      return await remoteHandler(...input)
    },

    // same as .act, but without options
    async act(route, data) {
      return this.actCustom(route, data, {})
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
            Object.assign(this.routes[name], routes)
          }
      }
    },

    // listen(name, options) {
    //   //
    // }

  }
}
