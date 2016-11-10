const humbler = require('./src')()

// add basic route
humbler.add({ role: 'test', command: 'echo' }, data => data)

// load module with routes
const plugin = humbler => {

  humbler.add({ role: 'test', command: 'string' }, () => {
    return 'string response'
  })

  humbler.add({ role: 'test', command: 'buffer' }, () => {
    return Buffer.from('buffer response')
  })

}

humbler.use(plugin)

;(async () => {
  const echoResult = await humbler.act({ role: 'test', command: 'echo' }, { echo: 'meow' })
  const stringResult = await humbler.act({ role: 'test', command: 'string' })
  const bufferResult = await humbler.act({ role: 'test', command: 'buffer' })

  console.log('echo:', echoResult)
  console.log('string:', stringResult)
  console.log('buffer:', bufferResult.toString())
})()
