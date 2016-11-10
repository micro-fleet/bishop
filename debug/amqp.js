// node --harmony_async_await debug/amqp
const amqp = require('../src/transports/amqp')()

;(async () => {
  await amqp.connect()
})()
