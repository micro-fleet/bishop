// create bishop instance with default configuration options
const bishop = require('../')()

// add some logic binded to pattern 'role:test, method:simple'
bishop.add('role:test, method:simple', message => {
  console.log('got message:', message)
  // "got message: { role: 'test', method: 'simple', payload: 'somedata' }"
  return 'success'
})

// pass parameters into pattern matcher
bishop.act('role:test, method:simple, payload: somedata').then(response => {
  // a match is found, logic executed and result is returned
  console.log('got response:', response)
  // "got response: success"
})
