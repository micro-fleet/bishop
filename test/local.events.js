const { test } = require('ava')
const Bishop = require(process.env.PWD)
const Promise = require('bluebird')

test('listen local event', async t => {
  t.plan(3)
  const bishop = new Bishop()
  const testPattern = 'some: pattern, with: arguments'

  bishop.add(testPattern, () => {
    t.pass()
    return { logic: 'completed' }
  })

  bishop.follow(testPattern, message => {
    t.is(message.logic, 'completed')
    message.login = 'should-not-rewrite'
  })

  const result = await bishop.act(testPattern, { any: 'additional' })
  t.is(result.logic, 'completed')
})


test('stop listening local event', async t => {
  // t.plan(3)
  // const bishop = new Bishop()
  // const testPattern = 'some: pattern, with: arguments'
  //
  // bishop.add(testPattern, () => {
  //   t.pass()
  //   return { logic: 'completed' }
  // })
  //
  // bishop.listen(testPattern, message => {
  //   t.is(message.logic, 'completed')
  //   message.login = 'should-not-rewrite'
  // })
  //
  // const result = await bishop.act(testPattern, { any: 'additional' })
  // t.is(result.logic, 'completed')
})
