module.exports = {
  createRouteHash(routeObj) {
    const hash = []
    for (let name in routeObj) {
      hash.push(`${name}:${routeObj[name]}`)
    }
    return hash
  }
}
