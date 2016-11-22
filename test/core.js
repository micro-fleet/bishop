const { test } = require('ava')
const Promise = require('bluebird')

test('emit local patterns', async t => {
  const bishop = require(`${process.env.PWD}/src`)()
  bishop.add({ role: 'test', act: 'local1' }, () => { return 'local1' })
  t.is(await bishop.act('role: test, act: nosuch', { act: 'local1'}), 'local1')

  bishop.add('role:test,act:local2', () => { return 'local2' })
  t.is(await bishop.act('role: test, act: local2'), 'local2')

  t.throws(bishop.act('role: test, act: nosuch'), /pattern not found/)
})

test('remove patterns', async t => {
  const bishop = require(`${process.env.PWD}/src`)()
  const pattern = 'role:test,act:remove'
  bishop.add(pattern, () => { return 'ok' })
  t.is(await bishop.act(pattern), 'ok')

  bishop.remove(pattern)
  t.throws(bishop.act(pattern), /pattern not found/)
})


test('use plugin with patterns', async t => {
  const bishop = require(`${process.env.PWD}/src`)()
  const plugin = (instance, arg1, arg2) => {
    t.is(instance, bishop)
    t.is(arg1, 'arg1')
    t.is(arg2, 'arg2')

    instance.add('role:test,act:plugin', () => { return 'local1' })
    return {
      name: 'testplugin',
      routes: {
        testroute: 'somedata'
      }
    }
  }

  const config = await bishop.use(plugin, 'arg1', 'arg2')
  t.is(config.name, 'testplugin')
  t.is(bishop.routes.testplugin.testroute, 'somedata')
})

test('$timeout behaviour', async t => {
  const timeout = 100
  const bishop = require(`${process.env.PWD}/src`)({ timeout })
  bishop.add('role:test,act:timeout', async message => {
    await Promise.delay(message.delay)
    return 'success'
  })

  t.is(await bishop.act('role:test,act:timeout', { delay: timeout - 50 }), 'success')
  t.throws(bishop.act('role:test,act:timeout', { delay: timeout + 50 }), /pattern timeout after/)
})

test('$nowait behaviour', async t => {
  const timeout = 10
  let firedError
  const bishop = require(`${process.env.PWD}/src`)({
    terminateOn: err => {
      firedError = err
      return true
    }
  })
  bishop.add('role:test,act:nowait-success', () => { return 'finished' } )
  const res = await bishop.act('role:test,act:nowait-success,$nowait:true')
  t.falsy(res)

  bishop.add('role:test,act:nowait-fail', async () => Promise.delay(timeout).then(() => {
    throw new Error('delayed fail')
  }))

  const res2 = await bishop.act('role:test,act:nowait-fail,$nowait:true')
  t.falsy(res2)
  await Promise.delay(timeout + 10)
  t.is(firedError.message, 'delayed fail')
})

// 2do: implement after network implementation
test.skip('$local behaviour', async t => {
  const bishop = require(`${process.env.PWD}/src`)()
  bishop.add('role:test,act:local-local', () => 'rer')
  bishop.add('role:test,act:local-remote', 'somepluginname')

  t.is(await bishop.act('role:test,act:local-local'), 'rer')
  t.throws(bishop.act('role:test,act:local-remote'), /pattern not found/)
})
