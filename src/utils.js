const ld = require('lodash')

module.exports = {

  // model:comments,target:resource,action:create => { model: 'comments', target: 'resource', action: 'create' }
  objectify(input) {
    if (!ld.isString(input)) { return input }

    const obj = input.split(',').reduce((prev, cur) => {
      const [ key, value ] = cur.trim().split(':')
      prev[key.trim()] = value.trim()
      return prev
    }, {})
    return obj
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
