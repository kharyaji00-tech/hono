import type { Params, Result, Router } from '../../router'
import { runTest } from '../common.case.test'
import { LinearRouter } from '../linear-router'
import { RegExpRouter } from '../reg-exp-router'
import { TrieRouter } from '../trie-router'
import { SmartRouter } from './router'

describe('SmartRouter', () => {
  runTest({
    newRouter: () =>
      new SmartRouter({
        routers: [new RegExpRouter(), new TrieRouter()],
      }),
  })

  describe('Fallback is order-independent (hono/quick preset configuration)', () => {
    const newQuickRouter = () =>
      new SmartRouter<string>({
        routers: [new LinearRouter(), new TrieRouter()],
      })

    it('Falls back to TrieRouter when the first request does not exercise the unsupported route', () => {
      const router = newQuickRouter()
      router.add('GET', '/health', 'health')
      router.add('POST', '/files/:id/*', 'files')

      // A first request that does NOT exercise the unsupported label+star
      // route. LinearRouter succeeds here, but must not be pinned because it
      // cannot represent the whole route set.
      const res1 = router.match('GET', '/health')
      expect(res1[0]).toHaveLength(1)
      expect(res1[0][0][0]).toBe('health')

      expect(router.name).toBe('SmartRouter + TrieRouter')

      // A later request that hits the previously-unrepresentable route must
      // be served by the pinned TrieRouter instead of throwing.
      const res2 = router.match('POST', '/files/1/a')
      expect(res2[0]).toHaveLength(1)
      expect(res2[0][0][0]).toBe('files')
      expect((res2[0][0][1] as Record<string, string>)['id']).toBe('1')
    })

    it('Pins LinearRouter when the full route set is representable', () => {
      const router = newQuickRouter()
      router.add('GET', '/health', 'health')
      router.add('POST', '/items/:id', 'item')

      const res1 = router.match('GET', '/health')
      expect(res1[0][0][0]).toBe('health')
      expect(router.name).toBe('SmartRouter + LinearRouter')

      const res2 = router.match('POST', '/items/42')
      expect(res2[0][0][0]).toBe('item')
      expect((res2[0][0][1] as Record<string, string>)['id']).toBe('42')
    })

    it('Does not swallow non-UnsupportedPathError thrown while probing', () => {
      const fakeRouter: Router<string> = {
        name: 'FakeRouter',
        add: () => {},
        match(_method: string, path: string): Result<string> {
          if (path === '/probe-throw') {
            throw new TypeError('boom')
          }
          const handler: [string, Params] = ['ok', Object.create(null)]
          return [[handler]]
        },
      }
      const router = new SmartRouter<string>({
        routers: [fakeRouter, new TrieRouter()],
      })
      router.add('GET', '/health', 'health')
      router.add('POST', '/probe-throw', 'thrower')

      // The real request matches, but probing the second route throws a
      // non-UnsupportedPathError, which must propagate rather than fall back.
      expect(() => router.match('GET', '/health')).toThrow(TypeError)
    })
  })
})
