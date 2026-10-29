import { UnsupportedPathError } from '../../router'
import { runTest } from '../common.case.test'
import { PatternRouter } from './router'

describe('Pattern', () => {
  runTest({
    skip: [
      {
        reason: 'UnsupportedPath',
        tests: [
          'Duplicate param name > self',
          'Duplicate param name > self with trailing static',
          'Duplicate param name > self three times',
        ],
      },
      {
        reason: 'PatternRouter allows trailing slashes',
        tests: ['Trailing slash > GET /book/'],
      },
    ],
    newRouter: () => new PatternRouter(),
  })

  describe('Duplicate param name', () => {
    it('self', () => {
      const router = new PatternRouter<string>()
      expect(() => {
        router.add('GET', '/:id/:id', 'foo')
      }).toThrowError(UnsupportedPathError)
    })
  })
  describe('Trailing slash', () => {
    const router = new PatternRouter<string>()

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

  describe('Trailing rest-of-path param (`:label*`)', () => {
    // A param label glued to a trailing `*` (e.g. `/files/:filepath*` or
    // `/:id*`) is the path-to-regexp "rest of path" idiom. It must capture the
    // complete remaining path and must never prefix-overmatch deeper paths
    // with a truncated single-segment value (which would silently shadow more
    // specific routes registered later).
    it('captures the full remaining path across multiple segments', () => {
      const router = new PatternRouter<string>()
      router.add('GET', '/files/:filepath*', 'files')

      const [res1] = router.match('GET', '/files/a')
      expect(res1).toEqual([['files', { filepath: 'a' }]])

      const [res2] = router.match('GET', '/files/a/b')
      expect(res2).toEqual([['files', { filepath: 'a/b' }]])

      const [res3] = router.match('GET', '/files/a/b/c')
      expect(res3).toEqual([['files', { filepath: 'a/b/c' }]])
    })

    it('matches the bare prefix for the zero-segment form and tolerates trailing slashes', () => {
      const router = new PatternRouter<string>()
      router.add('GET', '/files/:filepath*', 'files')

      const [resNoParam] = router.match('GET', '/files')
      expect(resNoParam).toEqual([['files', {}]])

      const [resTrailingSlash] = router.match('GET', '/files/')
      expect(resTrailingSlash).toEqual([['files', {}]])
    })

    it('does not prefix-overmatch unrelated static prefixes', () => {
      const router = new PatternRouter<string>()
      router.add('GET', '/files/:filepath*', 'files')

      const [res] = router.match('GET', '/filesXYZ')
      expect(res).toEqual([])
    })

    it('root-level `/:id*` captures the full path instead of acting as a truncating catch-all', () => {
      const router = new PatternRouter<string>()
      router.add('GET', '/:id*', 'rest')

      const [res1] = router.match('GET', '/other/x')
      expect(res1).toEqual([['rest', { id: 'other/x' }]])

      const [res2] = router.match('GET', '/files/a/b')
      expect(res2).toEqual([['rest', { id: 'files/a/b' }]])

      const [res3] = router.match('GET', '/single')
      expect(res3).toEqual([['rest', { id: 'single' }]])

      const [resRoot] = router.match('GET', '/')
      expect(resRoot).toEqual([['rest', {}]])
    })

    it('does not shadow a more specific route with a truncated param value', () => {
      const router = new PatternRouter<string>()
      router.add('GET', '/files/:filepath*', 'wild')
      router.add('GET', '/files/admin/panel', 'panel')

      const [res] = router.match('GET', '/files/admin/panel')
      // Both routes match (multi-match). The wildcard must capture the FULL
      // remaining path (`admin/panel`), never the truncated first segment.
      expect(res).toEqual([
        ['wild', { filepath: 'admin/panel' }],
        ['panel', {}],
      ])
    })

    it('coexists with a normal single-segment param route', () => {
      const router = new PatternRouter<string>()
      router.add('GET', '/files/:filepath', 'single')

      const [res1] = router.match('GET', '/files/a')
      expect(res1).toEqual([['single', { filepath: 'a' }]])

      const [res2] = router.match('GET', '/files/a/b')
      expect(res2).toEqual([])
    })
  })
})
