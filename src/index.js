const patrun = require('patrun')
const ld = require('lodash')

module.exports = () => {
  const pmAll = patrun({ gex:true })
  const pmLocal = patrun({ gex:true })

  return {

    log: console,

    // loaded remote connectors
    remote: {},

    // append handler for route (local or remote)
    // .add(route, function)
    // .add(route, 'transportname')
    add(route, handler) {
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
    async actCustom(...input) {
      const [ route, data = {}, options = {} ] = input

      const pattern = (() => {
        if (input.length <= 2) {
          return route
        }
        return Object.assign({}, route, data)
      })()

      const { local } = options
      const matchResult = (local ? pmLocal : pmAll).find(pattern)
      if (!matchResult) {
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
      return this.actCustom(route, data)
    },

    // load plugin, module etc
    async use(input, options) {
      const plugin = typeof input === 'string' ? require(input) : input
      if (!ld.isFunction(plugin)) { throw new Error('.use: function expected') }

      const data = await plugin(this, options)

      if (!data) { return } // no data returned
      const { name } = data

      switch (data.type) {
        case 'remote':
          if (!name) { throw new Error('.use: remote plugins should contain names') }
          this.remote[name] = data
          break
      }
    },

    listen(name, options) {
      //
    }

  }
}
