import { getRouterName } from '../helper/dev'
import { Hono } from './quick'

describe('hono/quick preset', () => {
  it('Should have SmartRouter + LinearRouter', async () => {
    const app = new Hono()
    expect(getRouterName(app)).toBe('SmartRouter + LinearRouter')
  })

  describe('Non-word label name parity', () => {
    it('reports the full param key for /:a-b (GET /health)', async () => {
      const app = new Hono()
      app.get('/:a-b', (c) => c.text(c.req.param('a-b')))

      const res = await app.request('http://localhost/health')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('health')
    })

    it('reports the full param key for /:a-b (GET /xy)', async () => {
      const app = new Hono()
      app.get('/:a-b', (c) => c.text(c.req.param('a-b')))

      const res = await app.request('http://localhost/xy')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('xy')
    })

    it('does not overmatch multi-segment paths for /:a-b', async () => {
      const app = new Hono()
      app.get('/:a-b', (c) => c.text(c.req.param('a-b')))

      const res = await app.request('http://localhost/x/y')
      expect(res.status).toBe(404)
    })

    it('reports the full param key for /:year-:month', async () => {
      const app = new Hono()
      app.get('/:year-:month', (c) => c.text(c.req.param('year-:month')))

      const res = await app.request('http://localhost/2024')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('2024')
    })

    it('does not overmatch for /:file{.+}.json on a path without the suffix', async () => {
      const app = new Hono()
      app.get('/:file{.+}.json', (c) => c.text(c.req.param('file')))

      const res = await app.request('http://localhost/xy')
      expect(res.status).toBe(404)
    })
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
