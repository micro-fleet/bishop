const NodeMajorVersion = Number(process.version.match(/^v(\d+\.\d+)/)[1])
if (NodeMajorVersion >= 8 || (NodeMajorVersion === 7 && process.execArgv.join(',').indexOf('--harmony') !== -1)) {
  // async/await is supported (node v8+ or nove v7 with harmony flags)
  module.exports = require('./src')
} else {
  // async/await is not supported by default, load babel-converted version
  module.exports = require('./legacy')
}
// node --harmony_async_await node_modules/.bin/ava test/core.js
