const { expect } = require('chai')
const ld = require('lodash')

const Bishop = require('..')

describe('local behaviour', () => {
  it('test base methods', async () => {
    const payload = 'basic-echo'
    const pattern = { role: 'test', cmd: 'basic' }
    const bishop = new Bishop()

    // adds pattern
    bishop.add(pattern, ctx => {
      ctx.body = payload
    })

    // emits pattern
    const { body } = await bishop.act(pattern)
    expect(body).to.equal(payload)

    // remove pattern
    bishop.remove(pattern)

    // tries to act non-existing pattern
    try {
      await bishop.act(pattern)
      throw new Error('error expected')
    } catch (err) {
      expect(err.name).to.equal('NotFoundError')
    }
  })

  it('tests .act timeout')

  it('tests global middleware', async () => {
    const bishop = new Bishop()
    bishop.use(async (ctx, next) => {
      ctx.state.value = 'pre-value'
      await next()
      ctx.state.value = 'post-value'
    })

    const pattern = { role: 'test', cmd: 'test-use' }
    bishop.add(pattern, async ctx => {
      ctx.body = 'current state is ' + ctx.state.value
    })
    const ctx = await bishop.act(pattern)
    expect(ctx.body).to.equal('current state is pre-value')
    expect(ctx.state.value).to.equal('post-value')
  })

  it.skip('ensures hocks work', async () => {
    const bishop = new Bishop()
    bishop.hook('pre-add', async () => {
      console.log('pre-add called')
    })
    bishop.add({ role: 'test', cmd: 'test-pre-add' }, ld.noop)
  })
})
