module.exports = {
  type: 'object',
  properties: {
    // transport: {
    //   description: 'Selected transport for messages',
    //   type: 'string',
    //   default: 'local'
    // },
    forbidSameRouteNames: {
      description: 'Disallow the creation of the same patterns',
      type: 'boolean',
      default: true
    },
    matchOrder: {
      description: 'Try to match entries: with the most properies first, in insertion order',
      type: 'string',
      enum: ['depth', 'insertion'],
      default: 'depth'
    },
    timeout: {
      description: 'Default timeout for pattern execution in ms',
      type: 'number',
      default: 60000
    },
    slow: {
      description: 'Warn if pattern not executed during selected time period in ms',
      type: 'number',
      default: 10000
    },
    maxExecutionChain: {
      description: 'Warn about large execution chains',
      type: 'number',
      default: 10
    }
  },
  additionalProperties: false
}
