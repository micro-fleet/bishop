> Microservices toolkit for Node.js

# bishop

This project is under active development, no time for the comprehensive description - sorry.

NOTE: it is not possible to use default nodejs mode from v4.0.0 (`node --harmony-async-await` flag
required)

Inspired by [Seneca](http://senecajs.org/).

# Usage

## Installing bishop

https://www.npmjs.com/package/bishop-js

`npm install bishop`
`yarn add bishop`

## Importing bishop

```
const Bishop = require('bishop/src')

const bishop = new Bishop({
  matchOrder: 'depth',
  timeout: 60000,           // will fail on code logic bugs
  slowPatternTimeout: 1000, // emit warning if patterns executing too slow
  forbidSameRouteNames: true // forbid same route names to avoid logic bugs
})
```

## Adding routes
```
bishop.add('role:example-role,cmd:exampleCommand,exampleVariable', async message => {
  console.log(message.variable)
})
```

## Using routes
```
await bishop.act('role:example-role,cmd:exampleCommand', {
  exampleVariable: 'Hello World!'
})
```
