const Bishop = require('./src')
const bishop = new Bishop()

bishop.add('role:test, cmd:something', () => {
  return 'hello'
})
bishop.follow('role:test, cmd:something, other:value', console.log)

const result = bishop.act('role:test, cmd:something, other:value')
console.log(result)
