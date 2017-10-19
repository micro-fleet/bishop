const ld = require('lodash')
const Ajv = require('ajv')
const schemaTemplate = require('./schema')

function validateOrThrow(data, schemaName) {
  if (!ajv.validate(schemaName, data)) {
    throw new Error(`${schemaName} - ${ajv.errorsText()}`)
  }
}
// default validator with remove additional items and defaults included
const ajv = new Ajv({ removeAdditional: true, useDefaults: true, coerceTypes: true })

const formats = {
  name: '^[a-z0-9-_]+$'
}

const schemas = {
  options: schemaTemplate,
  flags: (() => {
    const schema = ld.cloneDeep(schemaTemplate)
    schema.properties = ld.reduce(schema.properties, (result, item, key) => {
      if (item.transparent) { result[key] = item }
      return result
    }, {})
    return schema
  })()
}

ld.each(formats, (format, name) => ajv.addFormat(name, format))
ld.each(schemas, (schema, name) => ajv.addSchema(schema, name))

module.exports = { schemas, formats, validateOrThrow }
