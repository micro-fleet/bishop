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

  // add debug information into message
  debug(_config, message = {}) {
    const config = ld.defaults(_config, {
      field: '$debug',
      enabled: false
    })
    const storage = (() => {
      if (!config.enabled) { return [] }
      if (!config.field) {
        if (!ld.isArray(message)) {
          throw new Error('if .field is falsy, then array expected as second parameter')
        }
        return message
      }
      if (!ld.isPlainObject(message)) {
        throw new Error('if .field is set, then object expected as second parameter')
      }
      return message[config.field] = []
    })()

    const tracks = {}
    return {
      push(payload) {
        const created = new Date().getTime()
        storage.push({ created, payload })
      },
      track(name, payload) {
        if (tracks[name]) {
          throw new Error(`[debug] ${name}: already tracking`)
        }
        const created = new Date().getTime()
        tracks[name] = { name, created }
        if (payload) { tracks[name].payload = payload }
      },
      stopTrack(name) {
        if (!tracks[name]) {
          throw new Error(`[debug] ${name}: not yet tracking`)
        }
        tracks[name].time = tracks[name].created - new Date().getTime()
        storage.push(tracks[name])
        delete tracks[name]
      }
    }
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
