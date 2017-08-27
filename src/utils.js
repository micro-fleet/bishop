const ld = require('lodash')
const shortid = require('shortid')
const DEFAULT_PATTERN_VALUE = '/.*/'

module.exports = { beautify, normalizePattern, routingKeyFromPattern }

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

// convert object { qwe: 'aaa', asd: 'bbb'} to array [ 'asd.bbb', 'qwe.aaa' ] sorted by keys
function routingKeyFromPattern(pattern, replaceWild = '*') {
  return Object.keys(pattern).sort().map(key => {
    const keyType = typeof pattern[key]
    const value = keyType === 'string' ? pattern[key] : replaceWild
    return `${key}.${value}`
  })
}


/**
 *
 */
function objectify(obj) {
  return ld.isString(obj) ? text2pattern(obj) : ld.cloneDeep(obj)
}

/**
 *
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
 * Split all patterns into one, extract payload and meta info
 */
function normalizePattern(...args) {
  const options = {}
  const pattern = {}
  const raw = {}
  args.forEach(item => {
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
