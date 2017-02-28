const { test } = require('ava')
const Bishop = require(process.env.PWD)
const Promise = require('bluebird')

test('create bishop instance', async t => {
  const bishop = new Bishop()
  t.is(bishop.config.timeout, 500)
  t.is(bishop.config.forbidSameRouteNames, false)
  t.is(bishop.config.matchOrder, 'depth')
})

test('match against basic patterns', async t => {
  const bishop = new Bishop({
    timeout: null
  })

  bishop.add('role: test, text: plain', () => 'test1')
  bishop.add({ role: 'test', text: 'object' }, () => 'test2')

  t.is(await bishop.act('role: test', { text: 'plain', other: 'payload' }), 'test1')
  t.is(await bishop.act('role: test, text: object'), 'test2')
})

test('check .forbidSameRouteNames option', async t => {
  const bishop = new Bishop({
    forbidSameRouteNames: true
  })
  bishop.add('role: test, text: plain', console.log)
  t.throws(() => {
    bishop.add('role: test, text: plain', console.log)
  }, /pattern already exist/)
})

test('remove pattern operation', async t => {
  const bishop = new Bishop()
  bishop.add('role: test, remove: true', () => 'remove')
  t.is(await bishop.act('role: test, remove: true'), 'remove')
  bishop.remove('role: test, remove: true')
  t.throws(bishop.act('role: test, remove: true'), /not found/)
})

test('invalid parameters', async t => {
  const bishop = new Bishop()
  t.throws(bishop.act(), /at least one search pattern/)
  t.throws(bishop.act('role: test, act: nosuch'), /pattern not found/)
  t.throws(() => {
    bishop.add('role: test, act: not-registered')
  }, /pass pattern handler/)
})

test('check $timeout', async t => {
  const timeout = 100
  const bishop = new Bishop({ timeout })
  bishop.add('role:test, act:timeout', async ({ delay }) => {
    if (delay) {
      await Promise.delay(delay)
    }
    return 'success'
  })

  t.is(await bishop.act('role:test ,act:timeout'), 'success' )
  t.throws(bishop.act('role:test, act:timeout', { delay: timeout + 100 }), /pattern timeout after/)
})

test('check $nowait', async t => {
  const bishop = new Bishop()
  let isExecutedFurther = false
  bishop.add('role:test, act:nowait', async () => {
    await Promise.delay(10)
    isExecutedFurther = true
    return 'success'
  })

  t.is(await bishop.act('role:test, act:nowait, $nowait: true'), undefined)
  await Promise.delay(15)
  t.is(isExecutedFurther, true)
  t.is(await bishop.act('role:test, act:nowait'), 'success')
})

test('check $slow', async t => {
  let loggedMessage
  const bishop = new Bishop({
    logger: {
      warn: message => {
        loggedMessage = message
      }
    }
  })
  bishop.add('role:test, act:slow', async () => {
    await Promise.delay(15)
    return 'slow success'
  })
  t.is(await bishop.act('role:test, act:slow'), 'slow success')
  t.is(loggedMessage, undefined)
  t.is(await bishop.act('role:test, act:slow, $slow: 10'), 'slow success')
  t.regex(loggedMessage, /pattern executed in/)
})

test('.register', async t => {
  const bishop = new Bishop()
  bishop.register('role:test', message => {
    message.chain.push('step1')
    return message
  })
  bishop.register('role:test, act:register', message => {
    message.chain.push('step2')
    return message
  })
  bishop.add('role:test, act:register', message => {
    message.chain.push('step3')
    return message.chain
  })
  const result = await bishop.act('role:test, act:register, other:option', {
    chain: []
  })
  t.deepEqual(result, [ 'step1', 'step2', 'step3' ])
})

test('remote wrappers', async t => {
  const bishop = new Bishop()
  const transportName = 'remote-test'
  let incomingMessage
  bishop.addTransport(transportName, async message => {
    incomingMessage = message
    return 'success'
  }, {
    timeout: 100
  })
  bishop.add('role:test, act:remote', transportName)

  const result = await bishop.act('role:test, act:remote')
  t.deepEqual(incomingMessage, { role: 'test', act: 'remote', '$timeout': 100 })
  t.is(result, 'success')
})

test('use plugin', async t => {
  const bishop = new Bishop()
  const pluginOptions = {
    some: 'options'
  }
  const plugin = async (service, options) => {
    t.deepEqual(options, pluginOptions)
    service.add('role:test, act:plugin', () => 'success')
    return 'plugin'
  }
  t.is(await bishop.use(plugin, pluginOptions), 'plugin')
  t.is(await bishop.act('role:test, act:plugin'), 'success')
})

test('error handlers', async t => {
  const defaultBishop = new Bishop()
  defaultBishop.add('role:test, act:error', async () => {
    throw new Error('test error')
  })
  t.throws(defaultBishop.act('role:test, act:error'), /test error/)

  let customError
  const customBishop = new Bishop({
    onError: err => {
      customError = err
    }
  })
  customBishop.add('role:test, act:error', async () => {
    throw new Error('custom error')
  })
  await customBishop.act('role:test, act:error')
  t.is(customError.message, 'custom error')
})
