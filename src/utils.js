const ld = require('lodash')

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

// 'model:comments, target, action:create' => { model: 'comments', target: /.*/, action: 'create' }
const text2obj = input => {
  return input.split(',').reduce((prev, cur) => {
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
}

module.exports = {

  calcDelay,

  throwError(err) {
    throw err
  },

  objectify(obj) {
    return ld.isString(obj) ? text2obj(obj) : obj
  },

  // split all patterns into one, extract payload and meta info from it
  split(...args) {
    const meta = {}
    const message = {}
    const raw = {}
    args.forEach(item => {
      const partialPattern = ld.isString(item) ? text2obj(item) : ld.cloneDeep(item)
      for (let field in partialPattern) {
        if (field[0] === '$') { // meta info like $timeout, $debug etc
          meta[field.substring(1)] = partialPattern[field]
        } else {
          message[field] = partialPattern[field]
        }
        raw[field] = partialPattern[field]
      }
    })
    return [ message, meta, raw ]
  },

  beautify(obj) {
    return ld.keys(obj).map(key => {
      const value = obj[key]
      if (ld.isPlainObject(value)) {
        return `${key}:{${ld.keys(value).join(',')}}`
      }
      return value ? `${key}:${value.toString()}` : key
    }).join(', ')
  },

  ensureIsFuction(func, message = 'function expected') {
    if (!func || !ld.isFunction(func)) {
      throw new Error(message)
    }
    return func
  },

  // convert object { qwe: 'aaa', asd: 'bbb'} to string 'qwe.aaa.asd.bbb' with sorted keys
  routingKeyFromPattern(pattern) {
    return Object.keys(pattern).sort().map(key => {
      const keyType = typeof pattern[key]
      const value = keyType === 'string' ? pattern[key] : '*'
      return `${key}.${value}`
    }).join('.')
  }
}
