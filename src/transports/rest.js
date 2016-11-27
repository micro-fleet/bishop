const request = require('request-promise')
const bloomrun = require('bloomrun')
const ld = require('lodash')
const koaRouter = require('koa-router')
const parseBody = require('koa-bodyparser')
const Koa = require('koa')
const json = require('koa-json')

const defaultOptions = {
  name: 'rest',                         // client/server: transport name/alias
  address: 'http://127.0.0.1:9000',     // client: transport endpoint
  listenPort: 9000,                     // server: listen incoming requests on port
  timeout: null,                        // client/server: will take from default seneca if not specified
  defaultRoute: '/bishop',              // client/server: default route if routes not set
  routes: {                             // client/server: human-friendly url pattern translation
    // '/:role/:get': 'get',
    // '/:role/:cmd': 'post',
    // '/:role/:unset': 'delete',
    // '/:role/:set': 'put'
  },
  request: {},                          // client: request-specific additional options: https://github.com/request/request#requestoptions-callback
  defaultRouteMethod: 'POST',           // client/server: preferred communication method, please dont change
  routeInterpolatePattern: /:([a-z0-9]+)/g // client/server: rule to extract tokens from urls, please dont change
}

module.exports = (bishop, options = {}) => {

  const config = ld.defaultsDeep({}, options, defaultOptions)
  const defaultTimeout = config.timeout || bishop.timeout // use own default timeout, or take from seneca

  const localPatternFinder = message => {
    const wrappedMessage = ld.assign({}, message, {
      $local: true,                                       // always serach in local patterns only
      $timeout: message.$timeout || defaultTimeout        // emit messages with custom timeout
    })
    if (message.$nowait) {
      bishop.act(wrappedMessage)
      return { success: true }
    }
    return bishop.act(wrappedMessage)
  }

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
  const client = request.defaults(ld.defaults({}, {
    baseUrl: config.address,
    json: true
  }, config.request))

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
          method: config.defaultRouteMethod,
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
        const message = ctx.request.body
        ctx.body = await localPatternFinder(message)
      })

      // rest routes
      for (const route in config.routes) {
        const method = config.routes[route].toLowerCase()
        router[method](route, async ctx => {
          const message = ld.assign({}, ctx.request.body || {}, ctx.query || {}, ctx.params || {})
          ctx.body = await localPatternFinder(message)
        })
      }

      const app = new Koa()
      app
        .use(json({ pretty: false, param: 'pretty' })) // beautify json on '?pretty' parameter
        .use(parseBody()) // extract body variables into req.body
        .use(router.routes())
        .use(router.allowedMethods())

      server = app.listen(config.listenPort)
    },

    // stop listen incoming requests
    close: () => {
      server && server.close()
    }
  }
}
