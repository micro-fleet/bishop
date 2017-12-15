const bloomrun = require('bloomrun')
const errors = require('common-errors')
const ld = require('lodash')
const compose = require('koa-compose')
const Promise = require('bluebird')

const { beautify, normalizePattern, ensureIsFuction } = require('./utils')

/**
forbidSameRouteNames
matchOrder
actTimeout
2do: default state
*/

class Bishop {
  constructor(_options) {
    this.options = _options || {}
    // 2do: validate default options

    this.patternMatcher = bloomrun({ indexing: this.options.matchOrder })
    this.middlewares = []
  }

  /**
   *
   */
  add(...args) {
    const payload = args.pop()
    ensureIsFuction(payload, 'pass the function in the last argument')
    const { pattern, meta } = normalizePattern(...args)

    if (this.options.forbidSameRouteNames) {
      const foundPattern = this.patternMatcher.lookup(pattern, { patterns: true })
      if (ld.isEqual(foundPattern, pattern)) {
        throw new errors.AlreadyInUseError('same pattern already exists', pattern)
      }
    }
    this.patternMatcher.add(pattern, { payload, meta })
    return this
  }

  /**
   *
   */
  decorate(key, value) {
    if (typeof this[key] !== 'undefined') {
      throw new errors.AlreadyInUseError(key, '.decorate')
    }
    this[key] = value
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
  use(...args) {
    switch (args.length) {
      case 1:
        this.middlewares.push(args[0])
        break
    }
    return this
  }

  /**
   *
   */
  async act(...args) {
    const request = normalizePattern(...args)
    const { pattern, meta: actMeta } = request

    const found = this.patternMatcher.lookup(pattern)
    if (!found) {
      throw new errors.NotFoundError(beautify(pattern))
    }

    const { payload } = found
    const actTimeout = actMeta.timeout || this.options.actTimeout

    const middlewareChain = compose([...this.middlewares, payload])
    const context = this.createContext({ request })

    const createBluebirdPromise = context => {
      // https://github.com/petkaantonov/bluebird/issues/1200
      if (actTimeout) {
        return Promise.resolve(middlewareChain(context)).timeout(actTimeout)
      }
      return Promise.resolve(middlewareChain(context))
    }

    return createBluebirdPromise(context)
      .then(() => context)
      .catch(Promise.TimeoutError, err => {
        throw new errors.TimeoutError(`${beautify(pattern)} - ${err.message}`)
      })
  }

  createContext({ request }) {
    const context = {}
    context.state = {} // this state should be passed among all services
    context.request = request // .act parameters
    context.body = undefined // .add response
    return context
  }

  /**
   *
   */
  //  follow(...args) {
  //    const listener = args.pop()
  //    ensureIsFuction(listener, 'pass the function in the last argument')
  //    const { pattern } = normalizePattern(...args)
  //    const eventName = `**.${routingKeyFromPattern(pattern).join('.**.')}.**`

  //    function handler(output, inputPattern, inputOptions) {
  //      const { id } = inputOptions

  //      if (uniqueIds.has(id)) {
  //        return this.emit('warning', `message with #${id} was handled before`)// do not emit same message twice
  //      }
  //      uniqueIds.set(id, true)

  //      try {
  //        const result = listener(output, inputPattern, inputOptions)
  //        this.emit(`notify.${id}.success`, result, inputPattern, inputOptions)
  //      } catch (err) {
  //        this.emit(`notify.${id}.fail`, err, inputPattern, inputOptions)
  //      }

  //    }
  //    this.on(eventName, handler)
  //  }
}

module.exports = Bishop
