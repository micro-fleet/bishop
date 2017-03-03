/**
 * check local pattern matching
 */
const { test } = require('ava')
const Promise = require('bluebird')

test('emit pattern', async t => {

  const bishop = require(process.env.PWD)()
  bishop.add('role:test,act:echo', message => message)
  const result = await bishop.act('role: test, act: echo', { some: 'payload' })
  t.is(result.some, 'payload')
})

test('not existing pattern', async t => {

  const bishop = require(process.env.PWD)()
  t.throws(bishop.act('role:test,act:nosuch'), /pattern not found/)
})

test('handle user error', async t => {

  const bishop = require(process.env.PWD)()
  bishop.add('role:test,act:error', () => {
    throw new Error('user error')
  })
  t.throws(bishop.act('role:test,act:error'), /user error/)
})

test('$timeout behaviour', async t => {
  const timeout = 100
  const bishop = require(process.env.PWD)({ timeout })
  bishop.add('role:test,act:timeout', async ({ delay }) => {
    if (delay) {
      await Promise.delay(delay)
    }
    return 'success'
  })

  t.deepEqual(await bishop.act('role:test,act:timeout'), 'success' )
  t.throws(bishop.act('role:test,act:timeout', { delay: timeout + 50 }), /pattern timeout after/)
})

test('$nowait behaviour', async t => {

  const timeout = 10
  const firedError = { message: '' }
  const bishop = require(process.env.PWD)({
    terminateOn: err => {
      firedError.message = err.message
      return true
    }
  })

  // should return undefined instead of real result
  bishop.add('role:test,act:nowait-success', () => { return 'finished' } )
  const result = await bishop.act('role:test,act:nowait-success,$nowait:true')
  t.falsy(result)

  // should return undefined in answer, and emit error later
  bishop.add('role:test,act:nowait-fail', async () => Promise.delay(timeout).then(() => {
    throw new Error('delayed fail')
  }))
  const result2 = await bishop.act('role:test,act:nowait-fail,$nowait:true')
  t.falsy(result2)
  await Promise.delay(timeout + 100)
  t.is(firedError.message, 'delayed fail')
})


test('test regexp patterns', async t => {
  const bishop = require(process.env.PWD)()
  let result

  bishop.add('role:test,regexp:/.+/', () => { return 'done' })
  result = await bishop.act('role:test,regexp:hello')
  t.is(result, 'done')

  bishop.add('role:test,regexp2:/.*/', () => { return 'done2' })
  result = await bishop.act('role:test', { regexp2: '' })
  t.is(result, 'done2')

  // same with object
  bishop.add({ role: 'test', regexp3: /.*/ }, () => { return 'done3' })
  result = await bishop.act('role:test', { regexp3: null })
  t.is(result, 'done3')

})