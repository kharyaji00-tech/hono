import { generateDigest } from './digest'

const sha1 = (body: Uint8Array<ArrayBuffer>) => crypto.subtle.digest('SHA-1', body)

const createPatternedBody = (length: number) => {
  const body = new Uint8Array(length)
  for (let i = 0; i < body.byteLength; i++) {
    body[i] = i % 256
  }
  return body
}

const reusableBufferStream = (body: Uint8Array, sizes: number[]) => {
  const scratch = new Uint8Array(Math.max(...sizes))
  let i = 0
  let offset = 0
  return new ReadableStream<Uint8Array<ArrayBuffer>>({
    pull(controller) {
      if (i >= sizes.length) {
        controller.close()
        return
      }
      const size = sizes[i++]
      for (let k = 0; k < size; k++) {
        scratch[k] = body[offset + k]
      }
      offset += size
      controller.enqueue(scratch.subarray(0, size))
    },
  })
}

const freshBufferStream = (body: Uint8Array, sizes: number[]) => {
  let offset = 0
  return new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      for (const size of sizes) {
        controller.enqueue(body.slice(offset, offset + size))
        offset += size
      }
      controller.close()
    },
  })
}

describe('generateDigest', () => {
  it('Should copy pending bytes from a stream that reuses its buffer', async () => {
    const scratch = new Uint8Array(4)
    let pullCount = 0
    const stream = new ReadableStream({
      pull(controller) {
        scratch.fill(pullCount === 0 ? 0x41 : 0x42)
        controller.enqueue(scratch)
        if (++pullCount === 2) {
          controller.close()
        }
      },
    })

    const digest = await generateDigest(stream, (body) => crypto.subtle.digest('SHA-1', body))

    expect(digest).toBe('7cd188ef3a9ea7fa0ee9c62c168709695460f5c0')
  })

  it('Should ignore buffer reuse across the 256 KiB block boundary (fast path)', async () => {
    const body = createPatternedBody(300000 + 314407)
    const sizes = [300000, 314407]
    const expected = '98f145de05f7008c800d110ea734ddca11d9cd76'

    const fresh = await generateDigest(freshBufferStream(body, sizes), sha1)
    const reused = await generateDigest(reusableBufferStream(body, sizes), sha1)

    expect(fresh).toBe(expected)
    expect(reused).toBe(expected)
  })

  it('Should ignore buffer reuse when a pending chunk is completed mid-stream (fill path)', async () => {
    const body = createPatternedBody(200000 + 200000 + 214407)
    const sizes = [200000, 200000, 214407]
    const expected = '98f145de05f7008c800d110ea734ddca11d9cd76'

    const fresh = await generateDigest(freshBufferStream(body, sizes), sha1)
    const reused = await generateDigest(reusableBufferStream(body, sizes), sha1)

    expect(fresh).toBe(expected)
    expect(reused).toBe(expected)
  })
})
