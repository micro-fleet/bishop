module.exports = {
  description: 'Default bishop options',
  type: 'object',
  properties: {
    // name: {
    //   description: 'Service name',
    //   type: 'string',
    //   format: 'name',
    //   default: 'bishop',
    // },
    version: {
      description: 'Service version',
      type: 'number',
      default: 1,
    },
    forbidSameRouteNames: {
      description: 'Disallow the creation of the same patterns',
      type: 'boolean',
      default: true,
    },
    matchOrder: {
      description: 'Try to match entries: with the most properies first, in insertion order',
      type: 'string',
      enum: ['depth', 'insertion'],
      default: 'depth',
    },
    notify: {
      description: 'Emit event on success/failed action',
      type: 'boolean',
      default: false,
      transparent: true
    },
    timeout: {
      description: 'Default timeout for pattern execution in ms',
      type: 'number',
      default: 60000,
      transparent: true
    },
    slow: {
      description: 'Warn if pattern not executed during selected time period in ms',
      type: 'number',
      default: 0,
      transparent: true
    }
  },
  additionalProperties: false
}
