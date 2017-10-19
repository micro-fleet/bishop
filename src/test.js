const tinysonic = require('tinysonic')

const HEADER_FIELD_STARTS = '$'

/**
 * Extracts message object and headers from array of arguments
 *
 */
function parseMessages(...args) {
  return args.reduce((acc, item) => {
    const data = typeof item !== 'string' ? item : tinysonic(item)
    for (let name in data) {
      if (name[0] === HEADER_FIELD_STARTS) {
        acc.headers[name.slice(1)] = data[name]
      } else {
        acc.message[name] = data[name]
      }
      acc.raw[name] = data[name]
    }
    return acc
  }, { message: {}, headers: {}, raw: {} })
}

class BishopMessage {

  constructor(message) {
    this.message(message)
  }

  message(...args) {
    const { message } = parseMessages(...args)
    this._message = message
    return this
  }

  async publish() {
    console.log('sent:', this._message)
  }

  toString() {
    return 'string'
  }

  toJSON() {
    return 'json'
  }

}

class Bishop {

  constructor(config) {

  }

  message(message) {
    return new BishopMessage(message)
  }

  add(pattern) {

  }

  listen(pattern) {

  }

}

module.exports = Bishop
