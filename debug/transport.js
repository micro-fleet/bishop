const humblerServer = require('../src')()
const humblerClient = require('../src')()

humblerServer.add({ role: 'test', command: 'echo' }, data => data)
humblerServer.add({ role: 'test', command: 'remote' }, 'dummy')
//
// humblerServer.listen('dummy', {
//   some: 'options'
// })

;(async () => {
  try {
    await humblerServer.use('../dummy-transport', {
      name: 'dummy',
      init: 'options'
    })
    const result = await humblerServer.act({ role: 'test', command: 'remote' })
    console.log('answer:')
    console.log(result)
  } catch (err) {
    console.log(err)
  }

  // const echoResult = await humbler.act({ role: 'test', command: 'echo' }, { echo: 'meow' })
  // const stringResult = await humbler.act({ role: 'test', command: 'string' })
  // const bufferResult = await humbler.act({ role: 'test', command: 'buffer' })
  //
  // console.log('echo:', echoResult)
  // console.log('string:', stringResult)
  // console.log('buffer:', bufferResult.toString())
})()
