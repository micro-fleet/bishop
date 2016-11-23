const Promise = require('bluebird')
const http = require('http')
const request = require('request-promise')

const defaultOptions = {
  type: 'http',       // client + server, http only supported
  host: '127.0.0.1',  // client
  path: '/bishop',    // client + server
  method: 'POST',     // client + server
  port: 9000          // client + server
}

module.exports = (bishop, options = {}) => {

  const config = Object.assign({}, defaultOptions, options)
  const timeout = config.timeout || bishop.timeout // use own default timeout, or take from seneca
  let server

  const client = request.defaults({
    baseUrl: `${config.type}://${config.host}:${config.port}`,
    method: config.method
  })
  return {
    name: options.name || 'http',
    type: 'transport',

    connect: () => {
      // no need to connect: lazy connection will be performed on each request ?
    },

    disconnect: () => {
      //
    },

    send: message => { // request remote system and return result
      return client({
        uri: '/bishop',
        body: JSON.stringify(message),
        timeout: (message.$timeout || timeout) + 10
      })
    },

    listen: () => {
      server = http.createServer((req, res) => {
        const { method, url } = req

        // main page will be health check monitor
        if (method === 'GET' && url === '/') {
          res.writeHead(200, {'Content-Type': 'text/plain'})
          return res.end('alive')
        }

        // handle http requests
        if (method === config.method && url === config.path) {
          const buffers = []
          req.on('data', data => buffers.push(data))
          req.on('end', async () => {
            const message = JSON.parse(Buffer.concat(buffers))
            // 2do if message.$nowait - dont send answer
            const result = await bishop.act(message, {
              $local: true,                       // always serach in local patterns only
              $timeout: message.$timeout || timeout  // emit messages with custom timeout
            })
            res.end(JSON.stringify(result))
          })
          return res.writeHead(200, {'Content-Type': 'text/plain'});
        }

        // emit 'not found' in other cases
        res.writeHead(404, {'Content-Type': 'text/plain'})
        res.end('Page not exists')
      })
      return Promise.fromCallback(callback => server.listen(config.port, callback))
    },

    close: () => {
      return Promise.fromCallback(callback => server.close(callback))
    }
  }
}
