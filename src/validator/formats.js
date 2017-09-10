const semver = require('semver')

module.exports = {
  name: '^[a-z0-9-_]+$',
  semver: version => semver.valid(version)
}
