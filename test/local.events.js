const { test } = require('ava')
const Bishop = require(process.env.PWD)

test('listen local event', async t => {
  // t.plan(5)
  const bishop = new Bishop()

  bishop.add('some: pattern, with: arguments, $notify: true', () => {
    t.pass()
    return { logic: 'completed' }
  })

  bishop.follow('some: pattern, with: arguments', message => {
    t.is(message.logic, 'completed')
    message.login = 'should-not-rewrite'
  })

  const result = await bishop.act('some: pattern, with: arguments', {
    any: 'additional',
    // $notify: true
  })
  t.is(result.logic, 'completed')
})
