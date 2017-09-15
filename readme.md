'notify', 'timeout', 'slow' (order: .add, .act, constuctor)

.add(...args, payload)
.act(...args)
.remove(...args)
async .use(plugin, ...options)


`notify.${id}.success`
`notify.${id}.fail`
`slow` (pattern) // default consolelog
`warning` // default consolelog
`routingKeyFromPattern(pattern).join('.')`
