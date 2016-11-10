module.exports = async (humbler, options) => {

  // can do something async here

  return {

    name: options.name || 'dummy',

    type: 'remote',

    connect: () => { // connect to remote service
      //
    },

    disconnect: () => { // disconnect from remote service
      //
    },

    act: message => { // request remote system and return result
      return 'hello'
    },

    listen: () => { // start listen incoming request (should emit them as local and return result)
      //
    },

    close: () => { // stop listen remote requests
      //
    }
  }
}
