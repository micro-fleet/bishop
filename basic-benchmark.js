const Benchmark = require('benchmark')
const suite = new Benchmark.Suite()
const Bishop = require('./src')

const bishop = new Bishop({
  opentracing: {
    sampler: {
      type: 'const',
      param: 0
    }
  }
})

const bishopTrace = new Bishop({
  opentracing: {
    config: {
      sampler: {
        type: 'const',
        param: 1
      }
    }
  }
})
const route = 'role:benchmark, route:test'
bishop.add(route, () => 'reply')
bishopTrace.add(route, () => 'reply')

suite.add('bishop#act', {
  defer: true,
  fn: deferred => {
    bishop.act(route).then(() => deferred.resolve())
  }
})
suite.add('bishop-trace#act', {
  defer: true,
  fn: deferred => {
    bishopTrace.act(route).then(() => deferred.resolve())
  }
})

suite
  .on('cycle', event => console.log(String(event.target)))
  .on('complete', () => {
    console.log('Fastest is ' + suite.filter('fastest').map('name'))
  })
  .run()
