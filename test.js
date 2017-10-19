const Bishop = require('./src/test')
const bishop = new Bishop()

// plugins:
// -
;(async () => {

  bishop.listen('some: pattern', ctx => {
    //
  })

  bishop.add('some: pattern', ctx => {
    return 'some answer'
  })

  const result = await bishop.message('some: pattern').publish()
  console.log(result)
})()
