const humbler = require('./src')()

humbler.add({ qwe: 'asd' }, data => {
  data.test = 'response'
  return data
})

const route = { qwe: 'asd'}
humbler.act(route, { qswe: 'sd'}).then(data => {
  console.log('result is returned:')
  console.log(data)
})
