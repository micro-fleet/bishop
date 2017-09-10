const Bishop = require('./src')
const bishop = new Bishop({
  // notify: true
})

bishop.add('role:test, cmd:something', () => {
  return 'hello'
})
// bishop.remove('role:test, cmd:something')
// bishop.follow('role:test, cmd:something, other:value', console.log)
//
// const result = bishop.act('role:test, cmd:something, other:value, $notify:true')
// console.log(result)
