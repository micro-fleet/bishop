const ld = require('lodash')
// const Promise = require('bluebird')

const calcDelay = (offset, inNanoSeconds = true) => {
  const now = (() => {
    if (inNanoSeconds) {
      const [ seconds, nanoseconds ] = process.hrtime()
      return seconds * 1e9 + nanoseconds
    }
    return new Date().getTime()
  })()
  return offset ? now - offset : now
}

module.exports = {

  calcDelay,

  throwError(err) {
    throw err
  },

  // model:comments,target:resource,action:create => { model: 'comments', target: 'resource', action: 'create' }
  objectify(input, extend = {}) {
    if (!ld.isString(input)) { return ld.extend({}, input, extend) }

    const obj = input.split(',').reduce((prev, cur) => {
      let [ key, value ] = cur.trim().split(':')
      if (typeof value === 'undefined') {
        value = '/.*/'
      }
      const trimmedValue = value.trim()
      prev[key.trim()] = trimmedValue[0] === '/' ?
        new RegExp(trimmedValue.slice(1, -1)) :
        trimmedValue
      return prev
    }, {})
    return ld.extend(obj, extend)
  },

  stringify(obj) {
    return JSON.stringify(obj)
  },
  //
  // async runMethodsParallel(object, methodName) {
  //   await Promise.map(ld.keys(object), name => {
  //     const method = object[name][methodName]
  //     return method && method()
  //   })
  // },
}
