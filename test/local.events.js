const { test } = require('ava')
const Bishop = require(process.env.PWD)

test('event is not emitted by default', async t => {
  t.plan(2)
  const bishop = new Bishop()

  bishop.add('some: pattern, with: arguments', () => {
    t.pass()
    return { logic: 'completed'}
  })

  bishop.follow('some: pattern, with: arguments', () => {
    t.fail()
  })

  const result = await bishop.act('some: pattern, with: arguments')
  t.is(result.logic, 'completed')
})



test('event emitting configured from bishop.add', async t => {
  t.plan(5)
  const bishop = new Bishop()

  bishop.add('some: pattern, with: arguments, $notify: true', () => {
    t.pass()
    return { logic: 'completed' }
  })

  bishop.follow('some: pattern, with: arguments', (message, headers) => {
    t.pass()
    t.is(headers.notify, true)
    t.is(message.logic, 'completed')
  })

  const result = await bishop.act('some: pattern, with: arguments')
  t.is(result.logic, 'completed')
})



test('event emitting configured from bishop.act', async t => {
  t.plan(5)
  const bishop = new Bishop()

  bishop.add('some: pattern, with: arguments', () => {
    t.pass()
    return { logic: 'completed' }
  })

  bishop.follow('some: pattern, with: arguments', (message, headers) => {
    t.pass()
    t.is(headers.notify, true)
    t.is(message.logic, 'completed')
  })

  const result = await bishop.act('some: pattern, with: arguments', { $notify: true })
  t.is(result.logic, 'completed')
})
