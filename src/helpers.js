const { ArgumentError } = require('common-errors')
const { isEqual } = require('lodash')
const { split, beautify } = require('./utils')
/**
 * Returns validated arguments
 */
function validateAddArguments(bishop, message, handler) {
  if (!message) {
    throw new ArgumentError('.add: looks like you are trying to add an empty pattern')
  }
  if (!handler) {
    throw new ArgumentError('.add: please pass pattern handler as last parameter')
  }
  const [pattern, options] = split(message)

  if (bishop.config.forbidSameRouteNames) {
    const foundPattern = bishop.globalPatternMatcher.lookup(pattern, { patterns: true })
    if (isEqual(foundPattern, pattern)) {
      throw new ArgumentError(
        `.add: .forbidSameRouteNames option is enabled, and pattern already exists: ${beautify(
          pattern
        )}`
      )
    }
  }

  return { pattern, options, handler }
}

module.exports = { validateAddArguments }
