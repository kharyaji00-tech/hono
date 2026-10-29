import { vi } from 'vitest'
import { cache } from '.'
import { Hono } from '../../hono'
import { etag } from '../etag'

// A spec-faithful mock of the Cache API: a fresh Map-backed store per setup,
// cloning on `match`/`put` so the stored Response body is not consumed by an
// earlier hit (mirrors the real Cache API returning a fresh Response each
// time). This is the same mock infrastructure used in `index.test.ts`.
const stubStoreBackedCache = () => {
  const store = new Map<string | Request, Response>()
  const mockCache = {
    match: vi.fn((key: string | Request) => Promise.resolve(store.get(key)?.clone())),
    put: vi.fn((key: string | Request, response: Response) => {
      store.set(key, response.clone())
      return Promise.resolve()
    }),
    keys: vi.fn(() => Promise.resolve(Array.from(store.keys()))),
  }
  vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(mockCache) })
  return { mockCache }
}

describe('Cache Middleware Conditional Revalidation (GET)', () => {
  beforeEach(() => {
    stubStoreBackedCache()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const buildApp = () => {
    const app = new Hono()
    let count = 0
    app.use(
      '*',
      cache({
        cacheName: 'conditional-test',
        wait: true,
        cacheControl: 'max-age=3600',
        vary: 'Accept',
      })
    )
    app.get('/resource', (c) => {
      count++
      c.header('X-Count', `${count}`)
      return c.text('cached body', 200, {
        ETag: '"v1"',
        'Last-Modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
      })
    })
    return { app, getCount: () => count }
  }

  const prime = async (app: Hono) => {
    const first = await app.request('http://localhost/resource')
    expect(first.status).toBe(200)
    expect(await first.text()).toBe('cached body')
  }

  it('returns 304 with an empty body when If-None-Match matches the cached ETag', async () => {
    const { app, getCount } = buildApp()
    await prime(app)
    expect(getCount()).toBe(1)

    const res = await app.request('http://localhost/resource', {
      headers: { 'If-None-Match': '"v1"' },
    })

    expect(res.status).toBe(304)
    expect(await res.text()).toBe('')
    // The handler must not run on a revalidation hit.
    expect(getCount()).toBe(1)
  })

  it('returns 200 with the full body when If-None-Match does not match', async () => {
    const { app, getCount } = buildApp()
    await prime(app)

    const res = await app.request('http://localhost/resource', {
      headers: { 'If-None-Match': '"different"' },
    })

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('cached body')
    expect(res.headers.get('etag')).toBe('"v1"')
    expect(getCount()).toBe(1)
  })

  it('returns 304 for If-None-Match: *', async () => {
    const { app } = buildApp()
    await prime(app)

    const res = await app.request('http://localhost/resource', {
      headers: { 'If-None-Match': '*' },
    })

    expect(res.status).toBe(304)
    expect(await res.text()).toBe('')
  })

  it('returns 304 when a matching ETag is present in a comma-separated If-None-Match list', async () => {
    const { app } = buildApp()
    await prime(app)

    const res = await app.request('http://localhost/resource', {
      headers: { 'If-None-Match': `"miss-1", "v1", "miss-2"` },
    })

    expect(res.status).toBe(304)
  })

  it('returns 304 when a matching ETag appears with OWS before the comma (RFC 9110)', async () => {
    const { app } = buildApp()
    await prime(app)

    const res = await app.request('http://localhost/resource', {
      headers: { 'If-None-Match': `"miss-1" , "v1" , "miss-2"` },
    })

    expect(res.status).toBe(304)
  })

  it('performs weak ETag comparison: W/"v1" in the request matches the stored strong "v1"', async () => {
    const { app } = buildApp()
    await prime(app)

    const res = await app.request('http://localhost/resource', {
      headers: { 'If-None-Match': 'W/"v1"' },
    })

    expect(res.status).toBe(304)
  })

  it('retains the ETag, Cache-Control, and Vary headers on 304 and drops body-related headers', async () => {
    const { app } = buildApp()
    await prime(app)

    const res = await app.request('http://localhost/resource', {
      headers: { 'If-None-Match': '"v1"' },
    })

    expect(res.status).toBe(304)
    expect(res.headers.get('etag')).toBe('"v1"')
    expect(res.headers.get('cache-control')).toBe('max-age=3600')
    expect(res.headers.get('vary')).toBe('accept')
    expect(res.headers.get('last-modified')).toBe('Wed, 21 Oct 2015 07:28:00 GMT')
    // Body-related headers must be stripped from a 304.
    expect(res.headers.get('content-type')).toBeNull()
    expect(res.headers.get('content-length')).toBeNull()
    // Custom handler headers must not leak into the 304.
    expect(res.headers.get('x-count')).toBeNull()
  })

  it('returns 200 with the full body when no conditional headers are present (regression guard)', async () => {
    const { app, getCount } = buildApp()
    await prime(app)

    const res = await app.request('http://localhost/resource')

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('cached body')
    expect(res.headers.get('etag')).toBe('"v1"')
    expect(getCount()).toBe(1)
  })
})

describe('Cache Middleware Conditional Revalidation (If-Modified-Since)', () => {
  beforeEach(() => {
    stubStoreBackedCache()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const buildApp = (lastModified: string | null = 'Wed, 21 Oct 2015 07:28:00 GMT') => {
    const app = new Hono()
    let count = 0
    app.use('*', cache({ cacheName: 'ims-test', wait: true, cacheControl: 'max-age=3600' }))
    app.get('/resource', (c) => {
      count++
      c.header('X-Count', `${count}`)
      if (lastModified) {
        c.header('Last-Modified', lastModified)
      }
      return c.text('cached body', 200, { ETag: '"v1"' })
    })
    return { app, getCount: () => count }
  }

  const prime = async (app: Hono) => {
    const first = await app.request('http://localhost/resource')
    expect(first.status).toBe(200)
  }

  it('returns 304 when If-Modified-Since is equal to the cached Last-Modified', async () => {
    const { app } = buildApp()
    await prime(app)

    const res = await app.request('http://localhost/resource', {
      headers: { 'If-Modified-Since': 'Wed, 21 Oct 2015 07:28:00 GMT' },
    })

    expect(res.status).toBe(304)
    expect(await res.text()).toBe('')
  })

  it('returns 304 when If-Modified-Since is after the cached Last-Modified', async () => {
    const { app } = buildApp()
    await prime(app)

    const res = await app.request('http://localhost/resource', {
      headers: { 'If-Modified-Since': 'Thu, 22 Oct 2015 07:28:00 GMT' },
    })

    expect(res.status).toBe(304)
  })

  it('returns 200 when If-Modified-Since is before the cached Last-Modified', async () => {
    const { app } = buildApp()
    await prime(app)

    const res = await app.request('http://localhost/resource', {
      headers: { 'If-Modified-Since': 'Tue, 20 Oct 2015 07:28:00 GMT' },
    })

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('cached body')
  })

  it('returns 200 when If-Modified-Since is present but the cached response has no Last-Modified', async () => {
    const { app } = buildApp(null)
    await prime(app)

    const res = await app.request('http://localhost/resource', {
      headers: { 'If-Modified-Since': 'Thu, 22 Oct 2015 07:28:00 GMT' },
    })

    expect(res.status).toBe(200)
  })

  it('returns 200 (treats as not modified=false) when If-Modified-Since is an invalid date', async () => {
    const { app } = buildApp()
    await prime(app)

    const res = await app.request('http://localhost/resource', {
      headers: { 'If-Modified-Since': 'not-a-date' },
    })

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('cached body')
  })
})

describe('Cache Middleware Conditional Revalidation (precedence & missing validators)', () => {
  beforeEach(() => {
    stubStoreBackedCache()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const buildApp = () => {
    const app = new Hono()
    let count = 0
    app.use('*', cache({ cacheName: 'precedence-test', wait: true, cacheControl: 'max-age=3600' }))
    app.get('/resource', (c) => {
      count++
      c.header('X-Count', `${count}`)
      return c.text('cached body', 200, {
        ETag: '"v1"',
        'Last-Modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
      })
    })
    return { app, getCount: () => count }
  }

  const prime = async (app: Hono) => {
    expect((await app.request('http://localhost/resource')).status).toBe(200)
  }

  it('ignores If-Modified-Since when If-None-Match is present and matches (returns 304)', async () => {
    const { app } = buildApp()
    await prime(app)

    // If-None-Match matches, but If-Modified-Since predates Last-Modified.
    // If-None-Match takes precedence (RFC 9110 §13.1.3).
    const res = await app.request('http://localhost/resource', {
      headers: {
        'If-None-Match': '"v1"',
        'If-Modified-Since': 'Tue, 20 Oct 2015 07:28:00 GMT',
      },
    })

    expect(res.status).toBe(304)
  })

  it('ignores If-Modified-Since when If-None-Match is present and does not match (returns 200)', async () => {
    const { app } = buildApp()
    await prime(app)

    // If-None-Match does not match, but If-Modified-Since would match on its own.
    // Because If-None-Match is present, If-Modified-Since MUST be ignored.
    const res = await app.request('http://localhost/resource', {
      headers: {
        'If-None-Match': '"different"',
        'If-Modified-Since': 'Thu, 22 Oct 2015 07:28:00 GMT',
      },
    })

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('cached body')
  })

  it('returns 200 when the cached response has no validators and If-None-Match is not "*"', async () => {
    const app = new Hono()
    app.use(
      '*',
      cache({ cacheName: 'no-validator-test', wait: true, cacheControl: 'max-age=3600' })
    )
    app.get('/resource', (c) => c.text('cached body'))
    expect((await app.request('http://localhost/resource')).status).toBe(200)

    const res = await app.request('http://localhost/resource', {
      headers: { 'If-None-Match': '"anything"' },
    })

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('cached body')
  })

  it('returns 304 for If-None-Match: * even when the cached response has no validators', async () => {
    const app = new Hono()
    app.use('*', cache({ cacheName: 'wildcard-no-validator-test', wait: true }))
    app.get('/resource', (c) => c.text('cached body'))
    expect((await app.request('http://localhost/resource')).status).toBe(200)

    const res = await app.request('http://localhost/resource', {
      headers: { 'If-None-Match': '*' },
    })

    expect(res.status).toBe(304)
    expect(await res.text()).toBe('')
  })
})

describe('Cache Middleware Conditional Revalidation (QUERY)', () => {
  beforeEach(() => {
    stubStoreBackedCache()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns 304 for a cached QUERY response when If-None-Match matches', async () => {
    const app = new Hono()
    let count = 0
    app.use(
      '*',
      cache({ cacheName: 'query-conditional-test', wait: true, cacheControl: 'max-age=3600' })
    )
    app.on('QUERY', '/resource', async (c) => {
      count++
      c.header('X-Count', `${count}`)
      return c.text(await c.req.raw.text(), 200, { ETag: '"q1"' })
    })

    const request = () =>
      app.request('/resource', {
        method: 'QUERY',
        headers: { 'Content-Type': 'application/json' },
        body: '{"query":"hono"}',
      })

    expect((await request()).status).toBe(200)
    expect(count).toBe(1)

    const res = await app.request('/resource', {
      method: 'QUERY',
      headers: { 'Content-Type': 'application/json', 'If-None-Match': '"q1"' },
      body: '{"query":"hono"}',
    })

    expect(res.status).toBe(304)
    expect(await res.text()).toBe('')
    // The handler must not re-run on a revalidation hit.
    expect(count).toBe(1)
  })
})

describe('Cache Middleware Conditional Revalidation (miss behavior & integration)', () => {
  beforeEach(() => {
    stubStoreBackedCache()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('serves the first request as 200 and caches it even when If-None-Match is sent on the miss', async () => {
    const app = new Hono()
    app.use('*', cache({ cacheName: 'miss-conditional-test', wait: true }))
    app.get('/resource', (c) => c.text('cached body', 200, { ETag: '"v1"' }))

    // No cached entry exists yet: the conditional must be ignored and the
    // handler run, producing a 200 that is then cached.
    const res = await app.request('http://localhost/resource', {
      headers: { 'If-None-Match': '"v1"' },
    })

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('cached body')

    // A subsequent revalidation now hits the cache and yields 304.
    const revalidation = await app.request('http://localhost/resource', {
      headers: { 'If-None-Match': '"v1"' },
    })
    expect(revalidation.status).toBe(304)
  })

  it('returns 304 on a cache hit when cache() is registered before etag() (regression)', async () => {
    // Before the fix, registering `cache()` before `etag()` could never yield
    // a 304 on a cache hit because `cache()` short-circuited with the stored
    // 200 and `etag()` never ran. The cache middleware now handles the
    // conditional itself.
    const app = new Hono()
    app.use(
      '*',
      cache({ cacheName: 'cache-before-etag-test', wait: true, cacheControl: 'max-age=3600' })
    )
    app.use('*', etag())
    app.get('/resource', (c) => c.text('static body', 200, { ETag: '"v1"' }))

    expect((await app.request('http://localhost/resource')).status).toBe(200)

    const res = await app.request('http://localhost/resource', {
      headers: { 'If-None-Match': '"v1"' },
    })

    expect(res.status).toBe(304)
    expect(await res.text()).toBe('')
    expect(res.headers.get('etag')).toBe('"v1"')
  })

  it('does not call cache.put for a revalidation hit (does not rewrite the entry)', async () => {
    const { mockCache } = stubStoreBackedCache()
    const app = new Hono()
    app.use(
      '*',
      cache({
        cacheName: 'no-rewrite-on-revalidate-test',
        wait: true,
        cacheControl: 'max-age=3600',
      })
    )
    app.get('/resource', (c) => c.text('cached body', 200, { ETag: '"v1"' }))

    await app.request('http://localhost/resource')
    expect(mockCache.put).toHaveBeenCalledOnce()

    await app.request('http://localhost/resource', {
      headers: { 'If-None-Match': '"v1"' },
    })

    expect(mockCache.put).toHaveBeenCalledOnce()
  })
})
