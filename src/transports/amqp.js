// https://github.com/makeomatic/ms-amqp-transport/blob/master/src/amqp.js
const Promise = require('bluebird')

;['Exchange', 'Queue', 'Connection', 'Consumer', 'Publisher'].forEach(name => {
  Promise.promisifyAll(require(`amqp-coffee/bin/src/lib/${name}`).prototype)
})
const AMQP = require('amqp-coffee')


module.exports = (humbler, options = {}) => {

  // const { log } = humbler
  const log = console

  return {

    name: options.name || 'dummy',

    type: 'remote',

    connect: () => { // connect to remote service
      return new Promise((resolve, reject) => {
        const amqp = this.amqpClient = new AMQP({
          host: 'localhost'
        })
        amqp.on('ready', () => {
          const { serverProperties } = amqp
          const { cluster_name, version } = serverProperties
          log.info(cluster_name, version)

          // https://github.com/dropbox/amqp-coffee#reconnect-flow
          // recreate unnamed private queue
          // if (this._replyTo || this._config.private) {
          //   this.createPrivateQueue();
          // }

        })
        amqp.on('close', () => {
          log.info('disconnected')
        })
      })
    },

    disconnect: () => { // disconnect from remote service
      //
    },

    act: message => { // request remote system and return result
      return 'hello'
    },

    listen: () => { // start listen incoming request (should emit them as local and return result)
      //
    },

    close: () => { // stop listen remote requests
      //
    }
  }
}
