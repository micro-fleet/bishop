const ld = require('lodash')
const Ajv = require('ajv')
const formats = require('./formats')
const schemas = require('./schemas')

// default validator with remove additional items and defaults included
const ajv = new Ajv({ removeAdditional: true, useDefaults: true })
ld.each(formats, (format, name) => ajv.addFormat(name, format))
ld.each(schemas, (schema, name) => ajv.addSchema(schema, name))



module.exports = {
  schemas, formats,
  validateOrThrow: (data, schemaName) => {
    if (!ajv.validate(schemaName, data)) {
      throw new Error(`${schemaName} - ${ajv.errorsText()}`)
    }
  }
}
