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
          'Non-word label name > GET /:a-b captures the whole label name as the param key',
          'Non-word label name > GET /:a.json captures the dotted label name as the param key',
          'Non-word label name > GET /:year-:month captures a label name containing a colon',
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

  describe('Non-identifier label name', () => {
    it.each(['/:a-b', '/:a.json', '/:year-:month', '/:foo:bar'])(
      'throws UnsupportedPathError for %s (cannot form a named capture group)',
      (path) => {
        const router = new PatternRouter<string>()
        expect(() => {
          router.add('GET', path, 'foo')
        }).toThrowError(UnsupportedPathError)
      }
    )

    it('still supports a plain identifier label name', () => {
      const router = new PatternRouter<string>()
      router.add('GET', '/:id', 'foo')
      const [res] = router.match('GET', '/123')
      expect(res.length).toBe(1)
      expect(res[0][0]).toBe('foo')
      expect((res[0][1] as Record<string, string>)['id']).toBe('123')
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
})
