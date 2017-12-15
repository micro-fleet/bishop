const tinysonic = require('tinysonic')
const ld = require('lodash')

const { validateOrThrow } = require('./validator')

module.exports = { beautify, normalizePattern, routingKeyFromPattern, ensureIsFuction, getOption }

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
 * converts object into array suitable for events with sorting by keys
 */
// { qwe: 'aaa', asd: 'bbb'} => [ 'asd.bbb', 'qwe.aaa' ]
function routingKeyFromPattern(pattern, replaceWild = '*') {
  return Object.keys(pattern)
    .sort()
    .map(key => {
      const keyType = typeof pattern[key]
      const value = keyType === 'string' ? pattern[key] : replaceWild
      return `${key}.${value}`
    })
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

/**
 * resolves valid options from specified configs
 */
function getOption(...spreadedOptions) {
  const options = ld.defaults({}, ...spreadedOptions)
  validateOrThrow(options, 'flags')
  return options
}
