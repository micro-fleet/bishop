const bloomrun = require('bloomrun')
const errors = require('common-errors')
const ld = require('lodash')
const compose = require('koa-compose')
const Promise = require('bluebird')

const validateOptions = require('./options')
const { beautify, normalizePattern, ensureIsFuction } = require('./utils')

class Bishop {
  constructor(options) {
    this.options = validateOptions(options)

    this.patternMatcher = bloomrun({ indexing: this.options.matchOrder })
    this.middlewares = []
    this.hooks = {
      'pre-add': [],
      'post-add': []
    }
  }

  hook() {}

  /**
   *
   */
  add(...args) {
    const payload = args.pop()
    ensureIsFuction(payload, 'pass the function in the last argument')
    const { pattern, meta } = normalizePattern(...args)

    if (this.options.forbidSameRoutes) {
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
    context.state = ld.cloneDeep(this.options.defaultState) // this state should be passed among all services
    context.request = request // .act parameters
    context.body = undefined // .add response
    return context
  }
}

module.exports = Bishop
