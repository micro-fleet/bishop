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

  bishop.add('role: test, text: plain', (message, headers) => {
    t.deepEqual(message, { role: 'test', text: 'plain', other: 'payload' })
    t.is(headers.timeout, 1000)
    t.deepEqual(headers.pattern, { role: 'test', text: 'plain' })
    return 'test1'
  })
  bishop.add({ role: 'test', text: 'object' }, () => 'test2')

  t.is(await bishop.act('role: test, $timeout: 1000', { text: 'plain', other: 'payload' }), 'test1')
  t.is(await bishop.act('role: test, text: object, $timeout: 1000'), 'test2')
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
  await t.throws(bishop.act('role: test, remove: true'), /not found/)
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
  const timeout = 200
  const bishop = new Bishop({ timeout })
  bishop.add('role:test, act:timeout', async ({ delay }) => {
    if (delay) {
      await Promise.delay(delay)
    }
    return 'success'
  })
  t.is(await bishop.act('role:test ,act:timeout'), 'success')
  await t.throws(
    bishop.act('role:test, act:timeout', { delay: timeout + 100 }),
    /pattern timeout after/
  )
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
  bishop.register('before', 'role:test', message => {
    message.chain.push('step1')
    return message
  })
  bishop.register('before', 'role:test, act:register', message => {
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
  t.deepEqual(result, ['step1', 'step2', 'step3'])
})

test('.register and break execution', async t => {
  const bishop = new Bishop()
  bishop.register('before', 'role:test', (message, headers) => {
    t.pass()
    headers.break = true
    return message
  })
  bishop.add('role:test, act:final-handler', () => {
    t.fail('final handler should be skipped with $break flag')
  })
  const result = await bishop.act('role:test, act:final-handler')
  t.deepEqual(result, { role: 'test', act: 'final-handler' })
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

test('complete execution chain using .register', async t => {
  t.plan(2)
  const bishop = new Bishop()
  const add2message = item => message => {
    message.item.push(item)
    return message
  }
  bishop.add('role:test, act:chain, subitem: true', add2message('normal action'))
  bishop.register('before', add2message('step #1'))
  bishop.register('before', add2message('step #2'))
  bishop.register('after', 'role:test, act:chain', add2message('step #5'))
  bishop.register('after', 'role:test', add2message('step #6'))
  bishop.register('after', add2message('step #7'))
  bishop.register('after', (message, headers) => {
    t.is(headers.source.otherpayload, 'somedata')
    return message
  })
  bishop.register('before', 'role:test', add2message('step #3'))
  bishop.register('before', 'role:test, act:chain', add2message('step #4'))
  const { item } = await bishop.act('role:test, act:chain, subitem: true', {
    item: [],
    otherpayload: 'somedata'
  })
  t.deepEqual(item, [
    'step #1',
    'step #2',
    'step #3',
    'step #4',
    'normal action',
    'step #5',
    'step #6',
    'step #7'
  ])
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

test('test bug #55', async t => {
  // https://github.com/mcollina/bloomrun/issues/55

  const bishop = new Bishop()

  bishop.add('role:tag, cmd:find', () => 'tag,find')
  bishop.add('role:location, cmd:find', () => 'location,find')
  bishop.add('role:tag, cmd:find, count', () => 'tag,find,count')
  bishop.add('role:location, cmd:find, count', () => 'location,find,count')

  const test = {}
  test['tag,find,count'] = await bishop.act('role:tag, cmd:find, count:true')
  test['tag,find'] = await bishop.act('role:tag, cmd:find')
  test['location,find,count'] = await bishop.act('role:location, cmd:find, count:true')
  test['location,find'] = await bishop.act('role:location, cmd:find')

  for (let name in test) {
    t.is(name, test[name], `"${test[name]}" shoud be equal "${name}"`)
  }
})
