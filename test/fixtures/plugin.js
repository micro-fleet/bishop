/**
 * plugin example
 */
const Promise = require('bluebird')

module.exports = (bishop, options = {}) => {
  const name = 'test'
  const routes = {
    notFound: 'role:plugin',
    echo: 'role:plugin,cmd:echo',
    userError: 'role:plugin,cmd:user-error',
    customError: 'role:plugin,cmd:custom-error',
    typeError: 'role:plugin,cmd:type-error',
    delayed: 'role:plugin,cmd:delay,delay:/[0-9]+/'
  }

  bishop.add(routes.echo, message => Object.assign({}, message, options))

  bishop.add(routes.userError, message => {
    throw new Error(message.text || 'user error')
  })

  bishop.add(routes.customError, message => {
    const err = new Error(message.text || 'custom error')
    err.name = 'CustomError'
    throw err
  })

  bishop.add(routes.typeError, () => {
    null.f()
  })

  bishop.add(routes.notFound, () => {
    throw new Error('such route does not exist')
  })

  bishop.add(routes.delayed, message => {
    return Promise.delay(Number(message.delay) || 10)
  })

  return { name, routes }
}
