const Promise = require('bluebird')

const threadsCount = 10
const messagesInThread = 300

let sendTotal = messagesInThread * threadsCount

;(async () => {
  const server = require('../src')()
  const client = require('../src')()
  server.add({ role: 'test', command: 'echo' }, data => data)
  client.add({ role: 'test' }, 'http')

  await server.use('../src/transports/http')
  await client.use('../src/transports/http')
  await server.listen()

  console.time('send')
  try {
    await Promise.map(new Array(sendTotal), async () => {
      await client.act({ role: 'test', command: 'echo' })
      sendTotal--
    }, { concurrency: threadsCount })
  } catch (err) {
    console.log(err.message)
    process.exit()
  }
  console.timeEnd('send')
  console.log(`messages sent: ${messagesInThread * threadsCount}, treads count: ${threadsCount}`)
  await server.close()
  if (sendTotal) { console.log(`amount of not sent messages: ${sendTotal}`)}
})()

// ;(async () => {
//   const server = require('seneca')()
//   const client = require('seneca')()
//   server.add({ role: 'test', command: 'echo' }, (message, done) => done(null, message))
//   server.listen(9001)
//   client.client({ port: 9001, pin: 'role:test'})
//
//   console.time('seneca-send')
//   try {
//     await Promise.map(new Array(sendTotal), async () => {
//       await Promise.fromCallback(callback => {
//         client.act({ role: 'test', command: 'echo' }, callback)
//       })
//       sendTotal--
//     }, { concurrency: threadsCount })
//   } catch (err) {
//     console.log(err.message)
//     process.exit()
//   }
//   console.timeEnd('seneca-send')
//   console.log(`messages sent: ${messagesInThread * threadsCount}, treads count: ${threadsCount}`)
//   if (sendTotal) { console.log(`amount of not sent messages: ${sendTotal}`)}
// })()
