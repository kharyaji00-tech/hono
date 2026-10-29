import { getRouterName } from '../helper/dev'
import { Hono } from './quick'

describe('hono/quick preset', () => {
  it('Should have SmartRouter + LinearRouter', async () => {
    const app = new Hono()
    expect(getRouterName(app)).toBe('SmartRouter + LinearRouter')
  })

  it('Serves a label+star route regardless of which route is requested first', async () => {
    const app = new Hono()
    app.get('/health', (c) => c.text('ok'))
    app.post('/files/:id/*', (c) => c.text('file'))

    // A benign first request must not pin LinearRouter and break the later
    // unrepresentable request (it previously threw an uncaught
    // UnsupportedPathError that bypassed `app.onError`).
    const r1 = await app.request('/health', { method: 'GET' })
    expect(r1.status).toBe(200)
    expect(await r1.text()).toBe('ok')

    const r2 = await app.request('/files/1/a', { method: 'POST' })
    expect(r2.status).toBe(200)
    expect(await r2.text()).toBe('file')

    expect(getRouterName(app)).toBe('SmartRouter + TrieRouter')
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
