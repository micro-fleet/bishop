const Bishop = require('./src')
const bishop = new Bishop({
  version: '1'
})

bishop.add('role:test, cmd:something', () => {
  return 'hello'
})
// bishop.remove('role:test, cmd:something')
// bishop.follow('role:test, cmd:something, other:value', console.log)
//
bishop.act('role:test, cmd:something, other:value, $notify:true, $timeout:1000').then(console.log)
