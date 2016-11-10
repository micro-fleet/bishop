const patrun = require('patrun')

module.exports = () => {
  const pm = patrun({ gex:true })

  return {

    add(route, handler) {
      pm.add(route, { handler })
    },

    async act(route, data) {
      const pattern = (() => {
        if (typeof data === 'function') {
          return route
        }
        return Object.assign({}, route, data)
      })()
      const matchResult = pm.find(pattern)
      if (!matchResult) {
        throw new Error(`route ${JSON.stringify(route)} not found`)
      }
      return await matchResult.handler(pattern)
    }
  }
}
