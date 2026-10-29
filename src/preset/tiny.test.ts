import { getRouterName } from '../helper/dev'
import { Hono } from './tiny'

describe('hono/tiny preset', () => {
  it('Should have PatternRouter', async () => {
    const app = new Hono()
    expect(getRouterName(app)).toBe('PatternRouter')
  })

  it('`/files/:filepath*` captures the full remaining path (no truncated param)', async () => {
    const app = new Hono()
    app.get('/files/:filepath*', (c) => c.text(`files:${c.req.param('filepath')}`))
    expect(await (await app.request('/files/a')).text()).toBe('files:a')
    expect(await (await app.request('/files/a/b')).text()).toBe('files:a/b')
    expect(await (await app.request('/files/a/b/c')).text()).toBe('files:a/b/c')
  })

  it('a specific route registered before a `:filepath*` wildcard is not shadowed by it', async () => {
    const app = new Hono()
    app.get('/files/admin/panel', (c) => c.text('PANEL'))
    app.get('/files/:filepath*', (c) => c.text(`files:${c.req.param('filepath')}`))
    expect(await (await app.request('/files/admin/panel')).text()).toBe('PANEL')
  })
})

describe('Generics for Bindings and Variables', () => {
  interface CloudflareBindings {
    MY_VARIABLE: string
  }

  it('Should not throw type errors', () => {
    // @ts-expect-error Bindings should extend object
    new Hono<{
      Bindings: number
    }>()

    const appWithInterface = new Hono<{
      Bindings: CloudflareBindings
    }>()

    appWithInterface.get('/', (c) => {
      expectTypeOf(c.env.MY_VARIABLE).toMatchTypeOf<string>()
      return c.text('/')
    })

    const appWithType = new Hono<{
      Bindings: {
        foo: string
      }
    }>()

    appWithType.get('/', (c) => {
      expectTypeOf(c.env.foo).toMatchTypeOf<string>()
      return c.text('Hello Hono!')
    })
  })
})
