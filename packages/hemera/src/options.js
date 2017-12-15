const Joi = require('joi')

const schema = {
  forbidSameRoutes: Joi.boolean()
    .default(true)
    .description('Disallow adding of the same route'),
  matchOrder: Joi.string()
    .valid('depth', 'insertion')
    .default('depth')
    .description('Order to match entries'),
  actTimeout: Joi.number()
    .positive()
    .default(1000)
    .description('Default .act timeout')
    .unit('milliseconds'),
  defaultState: Joi.object()
    .default({})
    .description('Default state, passed between acts')
}

module.exports = (options = {}) => {
  const { error, value } = Joi.validate(options, schema)
  if (error) {
    throw error
  }
  return value
}
