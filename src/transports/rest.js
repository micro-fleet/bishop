const request = require('request-promise')
const bloomrun = require('bloomrun')
const ld = require('lodash')
const koaRouter = require('koa-router')
const parseBody = require('koa-bodyparser')
const Koa = require('koa')
const json = require('koa-json')

const defaultOptions = {
  name: 'rest',
  type: 'http',                     // http, https
  host: '127.0.0.1',
  port: 9000,
  timeout: null,
  defaultRoute: '/bishop',
  routes: {
    // '/:role/:get': 'get',
    // '/:role/:cmd': 'post',
    // '/:role/:unset': 'delete',
    // '/:role/:set': 'put'
  },
  routeInterpolatePattern: /:([a-z0-9]+)/g // extract only alphanumeric
}

module.exports = (bishop, options = {}) => {

  const config = ld.defaultsDeep({}, options, defaultOptions)
  const defaultTimeout = config.timeout || bishop.timeout // use own default timeout, or take from seneca

  // parse routes into local pattern matcher
  const routesMatcher = bloomrun()
  for (const route in config.routes) {
    const pattern = route.split('/').reduce((prev, cur) => {
      if (cur && cur[0] === ':') {
        prev[cur.substring(1)] = /.*/
      }
      return prev
    }, {})
    routesMatcher.add(pattern, {
      urlTemplate: ld.template(route, { interpolate: config.routeInterpolatePattern }),
      urlFields: route.match(config.routeInterpolatePattern).map(item => item.substring(1)),
      method: config.routes[route].toUpperCase()
    })
  }

  // setup http client
  let server
  const client = request.defaults({
    baseUrl: `${config.type}://${config.host}:${config.port}`,
    json: true
  })

  return {
    name: config.name,
    type: 'transport',
    // connect: () => {}, // no need to connect: lazy connection will be performed on each request
    // disconnect: () => {},

    // request remote system and return result as promise
    send: message => {
      const timeout = (message.$timeout || defaultTimeout) + 10
      const rest = routesMatcher.lookup(message)
      // no route matches found for rest api - will send to default route
      if (!rest) {
        return client({
          uri: config.defaultRoute,
          method: 'POST',
          body: message,
          timeout
        })
      }

      // we have route and method - will send 'like a rest'
      const options = {
        uri: rest.urlTemplate(message),
        method: rest.method,
        timeout
      }

      switch (rest.method) {
        case 'GET':
        case 'DELETE':
          options.qs = ld.omit(message, rest.urlFields)
          break
        default:
          options.body = ld.omit(message, rest.urlFields)
      }
      return client(options)
    },

    // start listen incoming requests
    listen: () => {
      const router = koaRouter()

      // index route, can be used for healthchecks
      router.get('/', ctx => {
        ctx.body = {
          name: config.name
        }
      })

      // default transport route
      router.post(config.defaultRoute, async ctx => {
        // 2do: if message.$nowait - dont send answer
        const message = ctx.request.body
        ctx.body = await bishop.act(message, {
          $local: true,                       // always serach in local patterns only
          $timeout: message.$timeout || defaultTimeout  // emit messages with custom timeout
        })
      })

      // rest routes
      for (const route in config.routes) {
        const method = config.routes[route].toLowerCase()
        router[method](route, async ctx => {
          const message = ld.assign({},
            ctx.request.body || {},
            ctx.query || {},
            ctx.params || {}
          )
          ctx.body = await bishop.act(message, {
            $local: true,
            $timeout: message.$timeout || defaultTimeout
          })
        })
      }


      const app = new Koa()
      app
        .use(json({ pretty: false, param: 'pretty' })) // beautify json on '?pretty' parameter
        .use(parseBody()) // extract body variables into req.body
        .use(router.routes())
        .use(router.allowedMethods())


      server = app.listen(config.port)
    },

    // stop listen incoming requests
    close: () => {
      server.close()
    }
  }
}
