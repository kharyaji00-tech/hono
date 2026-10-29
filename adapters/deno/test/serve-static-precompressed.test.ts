import { Hono } from 'hono'
import { serveStatic as baseServeStatic } from 'hono/serve-static'
import { serveStatic } from '../src/index.ts'
import { assertEquals } from './assert.ts'

const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i])

Deno.test('Serve Static precompressed serves the .gz variant body', async () => {
  const app = new Hono()
  app.get(
    '/static/*',
    serveStatic({
      root: './test',
      precompressed: true,
    })
  )

  const expected = await Deno.readFile('./test/static/plain.txt.gz')

  const res = await app.request('http://localhost/static/plain.txt', {
    headers: { 'Accept-Encoding': 'gzip' },
  })

  assertEquals(res.status, 200)
  assertEquals(res.headers.get('Content-Encoding'), 'gzip')
  assertEquals(res.headers.get('Vary'), 'Accept-Encoding')
  const body = new Uint8Array(await res.arrayBuffer())
  if (!bytesEqual(body, expected)) {
    throw new Error('served precompressed body does not match the .gz fixture')
  }
})

// `/proc/self/fd` is only available on Linux; this test self-skips elsewhere
// (the in-memory vitest cancellation tests cover every runtime deterministically).
const countFds = (): number | null => {
  try {
    return Array.from(Deno.readDirSync('/proc/self/fd')).length
  } catch {
    return null
  }
}

Deno.test('Serve Static precompressed does not leak file descriptors', async () => {
  if (countFds() === null) {
    return
  }

  const held: ReadableStream<Uint8Array>[] = []
  const getContent = async (path: string): Promise<ReadableStream<Uint8Array> | null> => {
    let stat
    try {
      stat = Deno.lstatSync(path)
    } catch {
      return null
    }
    if (stat.isDirectory) {
      return null
    }
    const file = await Deno.open(path)
    held.push(file.readable)
    return file.readable
  }

  const app = new Hono()
  app.get(
    '/static/*',
    baseServeStatic({
      root: './test',
      precompressed: true,
      getContent,
      join: (...paths: string[]) => paths.join('/'),
    })
  )

  const requestOnce = async () => {
    const res = await app.request('http://localhost/static/plain.txt', {
      headers: { 'Accept-Encoding': 'gzip' },
    })
    assertEquals(res.status, 200)
    assertEquals(res.headers.get('Content-Encoding'), 'gzip')
    await res.arrayBuffer()
  }

  for (let i = 0; i < 20; i++) {
    await requestOnce()
  }

  const before = countFds()

  for (let i = 0; i < 200; i++) {
    await requestOnce()
  }

  const after = countFds()

  if (after !== before) {
    throw new Error(`file descriptor leak: fd count went from ${before} to ${after}`)
  }
})
