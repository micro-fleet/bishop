/**
 * check core functional
 */
const { test } = require('ava')

test('remove patterns', async t => {
  const bishop = require(process.env.PWD)()
  const pattern = 'role:test,act:remove'
  bishop.add(pattern, () => { return { result: 'ok' }})
  t.deepEqual(await bishop.act(pattern), { result: 'ok' })
  bishop.remove(pattern)
  t.throws(bishop.act(pattern), /pattern not found/)
})

test('use plugin with patterns', async t => {
  const bishop = require(process.env.PWD)()

  const testroute = 'role:test,act:plugin'
  const plugin = (instance, options) => {
    t.is(instance, bishop)
    t.is(options, 'arg1')

    instance.add(testroute, () => { return { result: 'plugin' }})
    return {
      name: 'testplugin',
      routes: { testroute }
    }
  }

  const config = await bishop.use(plugin, 'arg1')
  t.is(config.name, 'testplugin')
  t.is(bishop.routes.testplugin.testroute, testroute)
  t.deepEqual(await bishop.act(bishop.routes.testplugin.testroute), { result: 'plugin' })
})

// 2do: implement
test.skip('$local behaviour', async t => {
  const bishop = require(process.env.PWD)()
  bishop.add('role:test,act:local-local', () => 'rer')
  bishop.add('role:test,act:local-remote', 'remoteplugin')

  t.is(await bishop.act('role:test,act:local-local'), 'rer')
  t.throws(bishop.act('role:test,act:local-remote'), /pattern not found/)
})
