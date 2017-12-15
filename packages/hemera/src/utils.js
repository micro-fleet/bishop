const tinysonic = require('tinysonic')
const ld = require('lodash')

module.exports = { beautify, normalizePattern, ensureIsFuction }

/**
 * throws error if passed payload is not a function
 */
function ensureIsFuction(func, message = 'function expected') {
  if (!func || !ld.isFunction(func)) {
    throw new Error(message)
  }
  return func
}

/**
 * returns human-readable object
 */
function beautify(obj) {
  return ld
    .keys(obj)
    .map(key => {
      const value = obj[key]
      if (ld.isPlainObject(value)) {
        return `${key}:{${ld.keys(value).join(',')}}`
      }
      return value ? `${key}:${value.toString()}` : key
    })
    .join(', ')
}

/**
 * split all patterns into one, extract payload and meta info
 */
function normalizePattern(...args) {
  const meta = {}
  const pattern = {}
  const raw = {}
  args.forEach(item => {
    if (ld.isEmpty(item)) {
      throw new Error('you are trying to add an empty pattern, they are forbidden')
    }
    const partialPattern = typeof item === 'string' ? tinysonic(item) : item
    for (let field in partialPattern) {
      if (field[0] === '$') {
        // meta info like $timeout, $debug etc
        meta[field.substring(1)] = partialPattern[field]
      } else {
        pattern[field] = partialPattern[field]
      }
      raw[field] = partialPattern[field]
    }
  })
  return { pattern, meta, raw }
}
