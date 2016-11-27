/**
 * transport example
 */
const Promise = require('bluebird')

module.exports = (bishop, options) => {
  return {
    name: 'dummy',
    type: 'transport',
    connect: () => {
      return Promise.resolve()
    },
    disconnect: () => {
      return Promise.resolve()
    },
    send: () => {
      return Promise.resolve()
    },
    listen: () => {
      return Promise.resolve()
    },
    close: () => {
      return Promise.resolve()
    }
  }
}
