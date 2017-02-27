const { test } = require('ava')
const Promise = require('bluebird')
const Bishop = require(process.env.PWD)

test('create bishop instance', async t => {
  const bishop = new Bishop()
  t.is(bishop.config.timeout, 500)
  t.is(bishop.config.forbidSameRouteNames, false)
  t.is(bishop.config.matchOrder, 'depth')
})

test('match against basic patterns', async t => {
  const bishop = new Bishop()

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

test('remove pattern', async t => {

  const bishop = new Bishop()

  bishop.add('role: test, remove: true', () => 'remove')
  t.is(await bishop.act('role: test, remove: true'), 'remove')
  bishop.remove('role: test, remove: true')
  t.throws(bishop.act('role: test, remove: true'), /not found/)
})
