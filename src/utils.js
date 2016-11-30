const ld = require('lodash')
const Promise = require('bluebird')

module.exports = {

  // model:comments,target:resource,action:create => { model: 'comments', target: 'resource', action: 'create' }
  objectify(input, extend = {}) {
    if (!ld.isString(input)) { return ld.extend({}, input, extend) }

    const obj = input.split(',').reduce((prev, cur) => {
      const [ key, value ] = cur.trim().split(':')
      if (!value) { throw new Error(`route "${input}" is not valid`)}
      const trimmedValue = value.trim()
      prev[key.trim()] = trimmedValue[0] === '/' ?
        new RegExp(trimmedValue.slice(1, -1)) :
        trimmedValue
      return prev
    }, {})
    return ld.extend(obj, extend)
  },

  isFunction(func) {
    return typeof func === 'function'
  },

  async runMethodsParallel(object, methodName) {
    await Promise.map(ld.keys(object), name => {
      const method = object[name][methodName]
      return method && method()
    })
  },
}
