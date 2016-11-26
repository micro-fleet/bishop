// node --harmony_async_await benchmarks/act.js

const Benchmark = require('benchmark')
const suite = new Benchmark.Suite

const seneca = require('seneca')()
const humber = require('..')()

const route = {test: 'route'}
seneca.add(route, (msg, done) => {
  return done(null, {test: 'reply'})
})
humber.add(route, () => {
  return {test: 'reply'}
})

suite.add('seneca#act', {
  defer: true,
  fn: deferred => {
    seneca.act(route, () => deferred.resolve())
  }
})

suite.add('bishop#act', {
  defer: true,
  fn: deferred => {
    humber.act(route).then(() => deferred.resolve())
  }
})


suite.on('cycle', event => console.log(String(event.target)))
.on('complete', () => {
  console.log('Fastest is ' + suite.filter('fastest').map('name'))
})
.run()
