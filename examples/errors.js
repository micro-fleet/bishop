const bishopDefault = require('../')()
const bishopFalling = require('../')({
  terminateOn: ['Error']
})
const bishopCustom = require('../')({
  terminateOn: err => {
    console.log('parsing error:', err.message)
    // falsy - handle error (return to sender, emit message etc)
    // truthy - mute error (ex: error already logged)
    return false
  }
})

const throwCustomError = message => () => {
  throw new Error(message)
}

bishopDefault.add('role: test, error: user', throwCustomError('error returned to user'))
bishopFalling.add('role: test, error: user', throwCustomError('error will fall'))
bishopCustom.add('role: test, error: user', throwCustomError('error will parsed by custom function'))

bishopDefault.act('role:test, error: user').catch(err => {
  console.log('error handled:', err.message)
})

bishopCustom.act('role:test, error: user').catch(err => {
  console.log('error handled:', err.message)
})

bishopFalling.act('role:test, error: user').catch(() => {
  console.log('never get here: app will fall on error, and logger will send output to stderr')
})
