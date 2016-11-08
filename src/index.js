const { createRouteHash } = require('./utils')

class Humber {
  constructor() {
    //
  }

  add(route, options, handler) {
    console.log(createRouteHash(route))
    return this
  }

  use(plugin, options) {
    return this
  }

  ready() {}

  connect() {
    return this
  }

  listen() {
    return this
  }
}
module.exports = Humber
