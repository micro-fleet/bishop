const ld = require('lodash')

module.exports = {

  // model:comments,target:resource,action:create => { model: 'comments', target: 'resource', action: 'create' }
  objectify(input, extend = {}) {
    if (!ld.isString(input)) { return ld.extend({}, input, extend) }

    const obj = input.split(',').reduce((prev, cur) => {
      const [ key, value ] = cur.trim().split(':')
      prev[key.trim()] = value.trim()
      return prev
    }, {})
    return ld.extend(obj, extend)
  }
  //
  // defaults(input) {
  //   const { data, method, defaults } = input
  //   if (typeof data === 'function') {
  //     return {
  //       config: Object.assign({}, defaults),
  //       method: config
  //     }
  //   }
  //   return {
  //     config: Object.assign(config, defaults),
  //     method: method
  //   }
  // }
}
