const ld = require('lodash')
const Promise = require('bluebird')

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
//
// const requireCatchError = path => {
//   try {
//     return require(path)
//   } catch(err) {
//     if (err.code === 'MODULE_NOT_FOUND' && err.message.includes(path)) {
//       err.message = ''
//     }
//   }
// }

module.exports = {

  calcDelay,

  requirePlugin(input) {
    if (!ld.isString(input)) { return input }
    return require(input)
  },

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
  createDebugger(_config, message = {}) {

    const config = ld.defaults(_config, {
      field: '$debug',
      enabled: false,
      logger: null
    })
    const start = calcDelay()
    const isDebugDisabled = !config.enabled
    const log = config.logger.debug ? config.logger.debug.bind(config.logger) : console.log
    const storage = (() => {
      if (isDebugDisabled) { return [] }
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
      push: isDebugDisabled ? ld.noop : (name, payload = null) => {
        const offset = calcDelay(start)
        const data = { name, payload, offset }
        storage.push(data)
        log(data)
      },
      track: isDebugDisabled ? ld.noop : (name, payload = null) => {
        if (tracks[name]) {
          throw new Error(`[debug] ${name}: already tracking`)
        }
        const internalOffset = calcDelay()
        tracks[name] = { name, payload, internalOffset }
      },
      trackEnd: isDebugDisabled ? ld.noop : (name, result = null) => {
        if (!tracks[name]) {
          throw new Error(`[debug] ${name}: not yet tracking`)
        }
        tracks[name].offset = calcDelay(start)
        tracks[name].internalOffset = calcDelay(tracks[name].internalOffset)
        if (result) {
          tracks[name].result = result
        }
        storage.push(tracks[name])
        log(tracks[name])
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
