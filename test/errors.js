/**
 * check core functional
 */
const { test } = require('ava')
const plugin = require('./fixtures/plugin')

test('default behaviour', async t => {
  const bishop = require(process.env.PWD)()
  await bishop.use(plugin)

  t.throws(bishop.act(bishop.routes.test.userError), /user error/)
  t.throws(bishop.act(bishop.routes.test.customError), err => {
    t.true(err instanceof Error)
    t.is(err.name, 'CustomError')
    return true
  })
})

test('catch TypeError errors', async t => {
  const bishop = require(process.env.PWD)({
    terminateOn: []
  })
  await bishop.use(plugin)
  t.throws(bishop.act(bishop.routes.test.typeError), TypeError)
})

test('custom error handler', async t => {
  const bishop = require(process.env.PWD)({
    terminateOn: err => {
      return err.name === 'CustomError'
    }
  })
  await bishop.use(plugin)
  t.throws(bishop.act(bishop.routes.test.userError), /user error/)
  await bishop.act(bishop.routes.test.customError) // should be muted
})
