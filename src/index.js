/**
2do: interact over events (to support versioning)
2do: versioning support // $match

2do: send name/version in headers
2do: method to proxy headers
2do: generate unique request id if not exists
2do: cache .act requests
2do: tests
2do: readme

2do: think about optional eventemitters: amqp?
*/
const bloomrun = require('bloomrun')
const errors = require('common-errors')
const ld = require('lodash')
const { EventEmitter2 } = require('eventemitter2')
const LRU = require('lru-cache')
const Promise = require('bluebird')

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
    this.on('slow', console.log)
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
 async act(...args) {
   const { pattern, options: actOptions } = normalizePattern(...args)
   const found = this.patternMatcher.lookup(pattern)
   if (!found) {
     throw new Error(`pattern "${beautify(pattern)}" not found`)
   }

   const { payload, options: addOptions } = found

   const flags = getOption(addOptions, actOptions, this.options)
   const start = flags.slow && new Date().getTime()

   const wrapAction = (...args) => { // https://github.com/petkaantonov/bluebird/issues/1200
     if (flags.timeout) {
       return Promise.resolve(payload(...args)).timeout(flags.timeout)
     }
     return Promise.resolve(payload(...args))
   }

   return wrapAction(pattern, actOptions).catch(Promise.TimeoutError, err => {
     throw new errors.TimeoutError(`${beautify(pattern)} - ${err.message}`)
   }).tap(result => {
     if (start) {
       const executionTime = new Date().getTime() - start
       if (executionTime > flags.slow) {
         this.emit('slow', pattern)
       }
     }
     if (flags.notify) {
       const eventName = routingKeyFromPattern(pattern).join('.')
       this.emit(eventName, result, pattern, actOptions)
     }
   })
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
