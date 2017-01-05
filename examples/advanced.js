const config = {
  // enable ability to add exact same routes (debuging purposes, test mocks etc)
  forbidSameRouteNames: true,
  // disable default timeout (patterns will run infinitely)
  timeout: 0,
  // emit warning if pattern executing more than 10 seconds (debug purposes)
  slowPatternTimeout: 10000,
  // terminate application on 'DatabaseError' (we have microservice which should fall down on error)
  terminateOn: ['DatabaseError']
}

const bishop = require('../')(config)

// we can pass routes like strings ("role: test") and like plain objects ("{role: 'test'}")
// also, we can use regular expression matching
bishop.add({ role: 'test', method: /.*/ }, message => {
  console.log('got message:', message)
  // "got message: { role: 'test', method: 'any-valid', some: { other: 'payload' } }"
  // we can return promises as well
  return Promise.resolve({ result: 'success' })
})

// any amount of arguments will be valid
bishop.act('role:test', { method: 'any-valid' }, {
  some: { other: 'payload' }
}).then(response => {
  console.log('got response:', response)
  // "got response: { result: 'success' }"
})
