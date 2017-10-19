const ld = require('lodash')
const shortid = require('shortid')
const DEFAULT_PATTERN_VALUE = '/.*/'

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
 * converts text into object
 */
// 'model:comments, target, action:create' => { model: 'comments', target: /.*/, action: 'create' }
function text2pattern(input) {
  return input.split(',').reduce((prev, cur) => {
    let [ key, value ] = cur.trim().split(':')
    if (typeof value === 'undefined') {
      value = DEFAULT_PATTERN_VALUE
    }

    const trimmedValue = value.trim()
    prev[key.trim()] = trimmedValue[0] === '/' ?
      new RegExp(trimmedValue.slice(1, -1)) :
      trimmedValue
    return prev
  }, {})
}

/**
 * converts object into array suitable for events with sorting by keys
 */
// { qwe: 'aaa', asd: 'bbb'} => [ 'asd.bbb', 'qwe.aaa' ]
function routingKeyFromPattern(pattern, replaceWild = '*') {
  return Object.keys(pattern).sort().map(key => {
    const keyType = typeof pattern[key]
    const value = keyType === 'string' ? pattern[key] : replaceWild
    return `${key}.${value}`
  })
}

/**
 * returns copy of object created from string or another object
 */
function objectify(obj) {
  return ld.isString(obj) ? text2pattern(obj) : ld.cloneDeep(obj)
}

/**
 * returns human-readable object
 */
function beautify(obj) {
 return ld.keys(obj).map(key => {
   const value = obj[key]
   if (ld.isPlainObject(value)) {
     return `${key}:{${ld.keys(value).join(',')}}`
   }
   return value ? `${key}:${value.toString()}` : key
 }).join(', ')
}


/**
 * split all patterns into one, extract payload and meta info
 * adds 'id' into meta if does not exist
 */
function normalizePattern(...args) {
  const options = {}
  const pattern = {}
  const raw = {}
  args.forEach(item => {
    if (ld.isEmpty(item)) {
      throw new Error('you are trying to add an empty pattern, they are forbidden')
    }
    const partialPattern = objectify(item)
    for (let field in partialPattern) {
      if (field[0] === '$') { // meta info like $timeout, $debug etc
        options[field.substring(1)] = partialPattern[field]
      } else {
        pattern[field] = partialPattern[field]
      }
      raw[field] = partialPattern[field]
    }
  })
  if (!options.id) {
    options.id = shortid.generate()
  }
  return { pattern, options, raw }
}

/**
 * resolves valid options from specified configs
 */
function getOption(...spreadedOptions) {
  const options = ld.defaults({}, ...spreadedOptions)
  validateOrThrow(options, 'flags')
  return options
}
