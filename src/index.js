const bloomrun = require('bloomrun')
const ld = require('lodash')
const { EventEmitter2 } = require('eventemitter2')
const LRU = require('lru-cache')

const { validateOrThrow } = require('./validator')
const { beautify, normalizePattern, routingKeyFromPattern, getOption, ensureIsFuction } = require('./utils')

const uniqueIds = LRU({
  maxAge: 60 * 1000
})

class Bishop extends EventEmitter2 {

  constructor(_options) {
    super({ wildcard: true })
    const options = this.options = ld.cloneDeep(_options || {})
    validateOrThrow(this.options, 'options')

    this.patternMatcher = bloomrun({ indexing: options.matchOrder })
    this.on('warning', console.log)
  }

/**
 *
 */
  add(...args) {
    const payload = args.pop()
    ensureIsFuction(payload, 'pass the function in the last argument')
    const { pattern, options } = normalizePattern(...args)

    if (this.options.forbidSameRouteNames) {
      const foundPattern = this.patternMatcher.lookup(pattern, { patterns: true })
      if (ld.isEqual(foundPattern, pattern)) {
        throw new Error(`same pattern already exists: ${beautify(pattern)}`)
      }
    }

    this.patternMatcher.add(pattern, { payload, options })
  }

/**
 *
 */
  remove(...args) {
    const { pattern } = normalizePattern(...args)
    this.patternMatcher.remove(pattern)
  }

/**
 *
 */
  async use(plugin, ...options) {
    ensureIsFuction(plugin, 'function expected, but not found')
    return plugin(this, ...options)
  }

/**
 *
 */
 act(...args) {
   const { pattern, options: actOptions } = normalizePattern(...args)
   const found = this.patternMatcher.lookup(pattern)
   if (!found) {
     throw new Error(`pattern "${beautify(pattern)}" not found`)
   }

   const { payload, options: addOptions } = found
   const result = payload(pattern, actOptions)

   const flags = getOption(['notify', 'timeout', 'slow', 'local', 'nowait'], actOptions, addOptions, this.options)

   if (flags.notify) {
     const eventName = routingKeyFromPattern(pattern).join('.')
     this.emit(eventName, result, pattern, actOptions)
   }
   return result
 }

/**
 *
 */
 follow(...args) {
   const listener = args.pop()
   ensureIsFuction(listener, 'pass the function in the last argument')
   const { pattern } = normalizePattern(...args)
   const eventName = `**.${routingKeyFromPattern(pattern).join('.**.')}.**`

   function handler(output, inputPattern, inputOptions) {
     const { id } = inputOptions

     if (uniqueIds.has(id)) {
       return this.emit('warning', `message with #${id} was handled before`)// do not emit same message twice
     }
     uniqueIds.set(id, true)

     try {
       const result = listener(output, inputPattern, inputOptions)
       this.emit(`notify.${id}.success`, result, inputPattern, inputOptions)
     } catch (err) {
       this.emit(`notify.${id}.fail`, err, inputPattern, inputOptions)
     }

   }
   this.on(eventName, handler)
 }

}

module.exports = Bishop
