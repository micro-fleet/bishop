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

  bishop.chainPatternMatcher.add({ role: 'test' }, 'not-registered')
  bishop.add('role: test, act: not-registered', () => {})
  t.throws(bishop.act('role: test, act: not-registered'), /handler is not registered/)
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
  t.throws(bishop.act('role:test, act:timeout', { delay: timeout + 50 }), /pattern timeout after/)
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
