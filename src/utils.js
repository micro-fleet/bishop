const ld = require('lodash')
const Promise = require('bluebird')

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
  },

  async runMethodsParallel(object, methodName) {
    await Promise.map(ld.keys(object), name => {
      const method = object[name][methodName]
      return method && method()
    })
  },
}
