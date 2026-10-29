import { runTest } from '../common.case.test'
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

  describe('Fallback to TrieRouter for mid-path suffix wildcards', () => {
    it('still matches the suffix route after RegExpRouter gives up', () => {
      const router = new SmartRouter<string>({
        routers: [new RegExpRouter(), new TrieRouter()],
      })
      router.add('GET', '/x*/y', 'x-star-y')
      // Adding this param route makes RegExpRouter throw UnsupportedPathError, so
      // SmartRouter falls back to TrieRouter.
      router.add('GET', '/x/:id', 'param')

      const [res] = router.match('GET', '/xz/y')
      expect(res.map((r) => r[0])).toEqual(['x-star-y'])

      const [res2] = router.match('GET', '/x/foo')
      expect(res2.map((r) => r[0])).toEqual(['param'])

      // The fall-back to TrieRouter was actually exercised.
      expect(router.activeRouter.name).toBe('TrieRouter')
    })
  })
})
