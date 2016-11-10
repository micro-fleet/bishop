const patrun = require('patrun')
const ld = require('lodash')

module.exports = () => {
  const pm = patrun({ gex:true })

  return {

    add(route, handler) {
      pm.add(route, { handler })
    },

    async act(route, data) {
      const pattern = (() => {
        if (ld.isFunction(data)) {
          return route
        }
        return Object.assign({}, route, data)
      })()
      const matchResult = pm.find(pattern)
      if (!matchResult) {
        throw new Error(`route ${JSON.stringify(route)} not found`)
      }
      return await matchResult.handler(pattern)
    },

    async use(input, options) {
      const plugin = typeof input === 'string' ? require(input) : input
      if (!ld.isFunction(plugin)) {
        throw new Error('.use: invalid plugin')
      }
      await plugin(this, options)
    }
  }
}
