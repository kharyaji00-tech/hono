import { UnsupportedPathError } from '../../router'
import { runTest } from '../common.case.test'
import { SmartRouter } from '../smart-router/router'
import { TrieRouter } from '../trie-router/router'
import { LinearRouter } from './router'

describe('LinearRouter', () => {
  runTest({
    skip: [
      {
        reason: 'UnsupportedPath',
        tests: [
          'Multi match > `params` per a handler > GET /entry/123/show',
          'Capture regex pattern has trailing wildcard > GET /foo/bar/file.html',
          'Capture regex param with trailing wildcard on empty remainder > GET /123',
          'Capture regex param with trailing wildcard and sibling route > GET /regex-abc/123/ghi',
          'Trailing wildcard after a label > GET /abc',
          'Trailing wildcard after a label > GET /abc/sub',
          'Trailing wildcard after a pattern label > GET /abc',
          'Trailing wildcard after a pattern label > GET /reverse/abc in reverse registration order',
          'Trailing wildcard after a pattern label > POST /all/abc with ALL middleware',
          'Trailing wildcard after a pattern label > GET /posts/2024/comments with nested braces',
          'Trailing wildcard after a pattern label > GET /files/foo/detail with regexp meta characters',
          'Trailing wildcard after a pattern label > GET /user/123/profile with the default pattern',
          'Trailing wildcard after a pattern label > GET /user/123/profile with the default pattern in reverse registration order',
          'Complex > Parameter with {.*} regexp',
        ],
      },
      {
        reason: 'LinearRouter allows trailing slashes',
        tests: ['Trailing slash > GET /book/'],
      },
    ],
    newRouter: () => new LinearRouter(),
  })

  describe('Multi match', () => {
    describe('`params` per a handler', () => {
      const router = new LinearRouter<string>()

      beforeEach(() => {
        router.add('ALL', '*', 'middleware a')
        router.add('GET', '/entry/:id/*', 'middleware b')
        router.add('GET', '/entry/:id/:action', 'action')
      })

      it('GET /entry/123/show', () => {
        expect(() => {
          router.match('GET', '/entry/123/show')
        }).toThrowError(UnsupportedPathError)
      })
    })
  })

  describe('Trailing slash', () => {
    const router = new LinearRouter<string>()

    beforeEach(() => {
      router.add('GET', '/book', 'GET /book')
      router.add('GET', '/book/:id', 'GET /book/:id')
    })

    it('GET /book/', () => {
      const [res] = router.match('GET', '/book/')
      expect(res.length).toBe(1)
      expect(res[0][0]).toBe('GET /book')
    })
  })

  describe('Skip part', () => {
    const router = new LinearRouter<string>()

    beforeEach(() => {
      router.add('GET', '/products/:id{d+}', 'GET /products/:id{d+}')
    })

    it('GET /products/list', () => {
      const [res] = router.match('GET', '/products/list')
      expect(res.length).toBe(0)
    })
  })

  describe('Literal suffix after a `{pattern}` label', () => {
    it('throws UnsupportedPathError so SmartRouter can fall back', () => {
      const router = new LinearRouter<string>()
      router.add('GET', '/:file{.+}.json', 'file')
      expect(() => {
        router.match('GET', '/xy')
      }).toThrowError(UnsupportedPathError)
    })

    it('SmartRouter (LinearRouter + TrieRouter) falls back and does not overmatch', () => {
      const router = new SmartRouter<string>({
        routers: [new LinearRouter(), new TrieRouter()],
      })
      router.add('GET', '/:file{.+}.json', 'file')

      let res = router.match('GET', '/xy')[0]
      expect(res.length).toBe(0)

      res = router.match('GET', '/foo.json')[0]
      expect(res.length).toBe(0)

      expect(router.activeRouter.name).toBe('TrieRouter')
    })
  })

  describe('hono/quick preset parity (LinearRouter + TrieRouter)', () => {
    const newRouter = () =>
      new SmartRouter<string>({ routers: [new LinearRouter(), new TrieRouter()] })

    it('reports the full param key for /:a-b', () => {
      const router = newRouter()
      router.add('GET', '/:a-b', 'h')
      const [res] = router.match('GET', '/health')
      expect(res.length).toBe(1)
      expect(res[0][0]).toBe('h')
      expect((res[0][1] as Record<string, string>)['a-b']).toBe('health')
    })

    it('does not overmatch single-segment paths for /:a-b', () => {
      const router = newRouter()
      router.add('GET', '/:a-b', 'h')
      const [res] = router.match('GET', '/x/y')
      expect(res.length).toBe(0)
    })

    it('keeps LinearRouter as the active router for a supported label name', () => {
      const router = newRouter()
      router.add('GET', '/:a-b', 'h')
      router.match('GET', '/health')
      expect(router.activeRouter.name).toBe('LinearRouter')
    })
  })
})
