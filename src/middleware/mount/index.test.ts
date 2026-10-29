import { mount } from '.'
/* eslint-disable @typescript-eslint/ban-ts-comment */
import type { ExecutionContext } from '../../context'
import { Hono } from '../../hono'
import { getPath } from '../../utils/url'

describe('mount()', () => {
  describe('Basic', () => {
    const anotherApp = (req: Request, ...params: unknown[]) => {
      const path = getPath(req)
      if (path === '/') {
        return new Response('AnotherApp')
      }
      if (path === '/hello') {
        return new Response('Hello from AnotherApp')
      }
      if (path === '/header') {
        const message = req.headers.get('x-message')
        return new Response(message)
      }
      if (path === '/with-query') {
        const queryStrings = new URL(req.url).searchParams.toString()
        return new Response(queryStrings)
      }
      if (path == '/with-params') {
        return new Response(
          JSON.stringify({
            params,
          }),
          {
            headers: {
              'Content-Type': 'application.json',
            },
          }
        )
      }
      if (path === '/undefined') {
        return undefined as unknown as Response
      }
      return new Response('Not Found from AnotherApp', {
        status: 404,
      })
    }

    const app = new Hono()
    app.use('*', async (c, next) => {
      await next()
      c.header('x-message', 'Foo')
    })
    app.get('/', (c) => c.text('Hono'))
    app.notFound((c) => {
      return c.text('Not Found from App', 404)
    })

    app.all(
      '/another-app/*',
      mount(anotherApp, () => {
        return 'params'
      })
    )
    app.all(
      '/another-app-with-array-option/*',
      mount(anotherApp, () => {
        return ['param1', 'param2']
      })
    )
    app.all('/another-app2/sub-slash/*', mount(anotherApp))

    const api = new Hono().basePath('/api')
    api.all('/another-app/*', mount(anotherApp))

    it('Should return responses from Hono app', async () => {
      const res = await app.request('/')
      expect(res.status).toBe(200)
      expect(res.headers.get('x-message')).toBe('Foo')
      expect(await res.text()).toBe('Hono')
    })

    it('Should return responses from AnotherApp', async () => {
      let res = await app.request('/another-app')
      expect(res.status).toBe(200)
      expect(res.headers.get('x-message')).toBe('Foo')
      expect(await res.text()).toBe('AnotherApp')

      res = await app.request('/another-app/hello')
      expect(res.status).toBe(200)
      expect(res.headers.get('x-message')).toBe('Foo')
      expect(await res.text()).toBe('Hello from AnotherApp')

      const req = new Request('http://localhost/another-app/header', {
        headers: {
          'x-message': 'Message Foo!',
        },
      })
      res = await app.request(req)
      expect(res.status).toBe(200)
      expect(res.headers.get('x-message')).toBe('Foo')
      expect(await res.text()).toBe('Message Foo!')

      res = await app.request('/another-app/not-found')
      expect(res.status).toBe(404)
      expect(res.headers.get('x-message')).toBe('Foo')
      expect(await res.text()).toBe('Not Found from AnotherApp')

      res = await app.request('/another-app/with-query?foo=bar&baz=qux')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('foo=bar&baz=qux')

      res = await app.request('/another-app/with-params')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        params: ['params'],
      })

      res = await app.request('/another-app/undefined')
      expect(res.status).toBe(404)
      expect(await res.text()).toBe('Not Found from App')
    })

    it('Should return response from Another app with an array option', async () => {
      const res = await app.request('/another-app-with-array-option/with-params')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        params: ['param1', 'param2'],
      })
    })

    it('Should return responses from AnotherApp - sub + slash', async () => {
      const res = await app.request('/another-app2/sub-slash')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('AnotherApp')
    })

    it('Should return responses from AnotherApp - with `basePath()`', async () => {
      const res = await api.request('/api/another-app')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('AnotherApp')
    })
  })

  describe('With encoded paths', () => {
    const anotherApp = (req: Request) => new Response(getPath(req))

    it('Should strip a decoded non-ASCII mount prefix', async () => {
      const app = new Hono()
      app.all('/api/é/*', mount(anotherApp))

      const res = await app.request('/api/%C3%A9/hello')

      expect(res.status).toBe(200)
      expect(await res.text()).toBe('/hello')
    })

    it('Should preserve an encoded slash as a literal path segment after stripping the prefix', async () => {
      const app = new Hono()
      app.all('/api/v1/*', mount(anotherApp))

      const res = await app.request('/api/v1/admin%2Fsecret')

      expect(res.status).toBe(200)
      expect(await res.text()).toBe('/admin%2Fsecret')
    })

    it('Should preserve encoded percent characters after stripping the prefix', async () => {
      const app = new Hono()
      app.all('/api/*', mount(anotherApp))

      const res = await app.request('/api/foo%252Fbar')

      expect(res.status).toBe(200)
      expect(await res.text()).toBe('/foo%252Fbar')
    })
  })

  describe('With fetch', () => {
    const anotherApp = async (req: Request, env: {}, executionContext: ExecutionContext) => {
      const path = getPath(req)
      if (path === '/') {
        return new Response(
          JSON.stringify({
            env,
            executionContext,
          }),
          {
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      }
      return new Response('Not Found from AnotherApp', {
        status: 404,
      })
    }

    const app = new Hono()
    app.all('/another-app/*', mount(anotherApp))

    it('Should handle Env and ExecuteContext', async () => {
      const request = new Request('http://localhost/another-app')
      const res = await app.fetch(
        request,
        {
          TOKEN: 'foo',
        },
        {
          // Force mocking!

          // @ts-ignore
          waitUntil: 'waitUntil',

          // @ts-ignore
          passThroughOnException: 'passThroughOnException',
        }
      )
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        env: {
          TOKEN: 'foo',
        },
        executionContext: {
          waitUntil: 'waitUntil',
          passThroughOnException: 'passThroughOnException',
        },
      })
    })
  })

  describe('Mount on `/`', () => {
    const anotherApp = (req: Request, _params: unknown) => {
      const path = getPath(req)
      if (path === '/') {
        return new Response('AnotherApp')
      }
      if (path === '/hello') {
        return new Response('Hello from AnotherApp')
      }
      if (path === '/good/night') {
        return new Response('Good Night from AnotherApp')
      }
      return new Response('Not Found from AnotherApp', {
        status: 404,
      })
    }

    const app = new Hono()
    app.all('/*', mount(anotherApp))

    it('Should return responses from AnotherApp - mount on `/`', async () => {
      let res = await app.request('/')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('AnotherApp')
      res = await app.request('/hello')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('Hello from AnotherApp')
      res = await app.request('/good/night')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('Good Night from AnotherApp')
      res = await app.request('/not-found')
      expect(res.status).toBe(404)
      expect(await res.text()).toBe('Not Found from AnotherApp')
    })
  })

  describe('With replaceRequest option', () => {
    const anotherApp = (req: Request) => {
      const path = getPath(req)
      if (path === '/app') {
        return new Response(getPath(req))
      }
      return new Response(null, { status: 404 })
    }

    const app = new Hono()
    app.all(
      '/app/*',
      mount(anotherApp, {
        replaceRequest: (req) => req,
      })
    )

    it('Should return 200 response with the correct path', async () => {
      const res = await app.request('/app')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('/app')
    })
  })

  describe('With replaceRequest: false', () => {
    const anotherApp = (req: Request) => {
      const path = getPath(req)
      if (path === '/app') {
        return new Response(getPath(req))
      }
      return new Response(null, { status: 404 })
    }

    const app = new Hono()
    app.all('/app/*', mount(anotherApp, { replaceRequest: false }))

    it('Should return 200 response with the correct path', async () => {
      const res = await app.request('/app')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('/app')
    })
  })

  describe('Used as `app.use()` middleware', () => {
    const anotherApp = (req: Request) => {
      const path = getPath(req)
      if (path === '/hello') {
        return new Response('Hello from AnotherApp')
      }
      // Fall through to the Hono app
      return undefined as unknown as Response
    }

    const app = new Hono()
    app.use('/another-app/*', mount(anotherApp))
    app.get('/another-app/fallback', (c) => c.text('Fallback from App'))

    it('Should return responses from AnotherApp', async () => {
      const res = await app.request('/another-app/hello')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('Hello from AnotherApp')
    })

    it('Should fall through to the Hono app if AnotherApp returns nothing', async () => {
      const res = await app.request('/another-app/fallback')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('Fallback from App')
    })
  })

  describe('Mount on parameterized routes', () => {
    // A handler that reports the path it sees, so we can assert the prefix
    // is re-expanded to the concrete matched value rather than the pattern.
    const reportingApp = (req: Request) => new Response('path=' + getPath(req))

    const createSubHono = () => {
      const sub = new Hono()
      sub.get('/', (c) => c.text('root:' + c.req.path))
      sub.get('/hello', (c) => c.text('hello:' + c.req.path))
      sub.get('/deep/path', (c) => c.text('deep:' + c.req.path))
      return sub
    }

    it('Should re-expand a `:version` parameter mount', async () => {
      const app = new Hono()
      app.all('/api/:version/*', mount(reportingApp))

      let res = await app.request('/api/v1/hello')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('path=/hello')

      res = await app.request('/api/v2/deep/path')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('path=/deep/path')
    })

    it('Should make the mounted sub-Hono see `/` when the request is the mount root', async () => {
      const app = new Hono()
      app.all(
        '/api/:version/*',
        mount((req: Request) => createSubHono().fetch(req))
      )

      const res = await app.request('/api/v1')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('root:/')
    })

    it('Should end-to-end route a mounted sub-Hono under a parameter mount', async () => {
      const sub = createSubHono()
      const app = new Hono()
      app.all(
        '/api/:version/*',
        mount((req: Request) => sub.fetch(req))
      )

      let res = await app.request('/api/v1/hello')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('hello:/hello')

      res = await app.request('/api/v1/deep/path')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('deep:/deep/path')

      res = await app.request('/api/v2/not-found')
      expect(res.status).toBe(404)
    })

    it('Should re-expand a regex parameter mount (`:id{[0-9]+}`)', async () => {
      const app = new Hono()
      app.all('/files/:id{[0-9]+}/*', mount(reportingApp))

      let res = await app.request('/files/123/hello')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('path=/hello')

      res = await app.request('/files/9999/deep/path')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('path=/deep/path')
    })

    it('Should re-expand multiple leading parameters (`/:org/:repo/*`)', async () => {
      const app = new Hono()
      app.all('/:org/:repo/*', mount(reportingApp))

      let res = await app.request('/hono/hono/issues/1')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('path=/issues/1')

      res = await app.request('/a/b/c/d/e')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('path=/c/d/e')
    })

    it('Should re-expand an intermediate wildcard mount (`/api/*/sub/*`)', async () => {
      const app = new Hono()
      app.all('/api/*/sub/*', mount(reportingApp))

      let res = await app.request('/api/foo/sub/hello')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('path=/hello')

      res = await app.request('/api/foo-bar/sub/deep/path')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('path=/deep/path')
    })

    it('Should mount correctly under a parameterized `app.basePath()`', async () => {
      const api = new Hono().basePath('/api/:version')
      api.all('/sub/*', mount(reportingApp))

      // The basePath is merged into the registered route pattern, so the
      // concrete prefix `/api/v1/sub` must be re-expanded from `c.req.path`.
      const app = new Hono()
      app.route('/', api)

      const res = await app.request('/api/v1/sub/hello')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('path=/hello')
    })
  })
})
