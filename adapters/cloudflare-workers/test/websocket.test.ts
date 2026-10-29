import { unstable_dev } from 'wrangler'
import { WebSocket } from 'ws'

describe('upgradeWebSocket on workerd', () => {
  // worker.fetch does not support WebSocket:
  // https://github.com/cloudflare/workers-sdk/issues/4573#issuecomment-1850420973
  it('Should echo a message over the WebSocket connection', async () => {
    const worker = await unstable_dev('./test/worker.ts', {
      compatibilityDate: '2026-07-01',
      experimental: { disableExperimentalWarning: true },
    })
    const ws = new WebSocket(`ws://${worker.address}:${worker.port}/ws`)

    const openHandler = vi.fn()
    const messageHandler = vi.fn()
    const closeHandler = vi.fn()

    await new Promise<void>((resolve) => {
      ws.addEventListener('open', () => {
        openHandler()
        ws.send('Hello')
      })
      ws.addEventListener('message', (event) => {
        messageHandler(event.data)
        ws.close()
      })
      ws.addEventListener('close', () => {
        closeHandler()
        resolve()
      })
    })
    await worker.stop()

    expect(openHandler).toHaveBeenCalled()
    expect(messageHandler).toHaveBeenCalledWith('Hello')
    expect(closeHandler).toHaveBeenCalled()
  })

  it('Should negotiate the first requested subprotocol', async () => {
    const worker = await unstable_dev('./test/worker.ts', {
      compatibilityDate: '2026-07-01',
      experimental: { disableExperimentalWarning: true },
    })
    // The `ws` client rejects the handshake ("Server sent no subprotocol")
    // unless the 101 response echoes a requested subprotocol (RFC 6455).
    const ws = new WebSocket(`ws://${worker.address}:${worker.port}/ws-protocol`, [
      'myproto',
      'otherproto',
    ])

    const openHandler = vi.fn()
    let clientProtocol: string | undefined
    let echoedProtocol: string | undefined

    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('error', (err) => reject(err))
      ws.addEventListener('open', () => {
        openHandler()
        clientProtocol = ws.protocol
        ws.send('ping')
      })
      ws.addEventListener('message', (event) => {
        echoedProtocol = event.data as string
        ws.close()
      })
      ws.addEventListener('close', () => resolve())
    })
    await worker.stop()

    expect(openHandler).toHaveBeenCalled()
    // Client-side: the echoed Sec-WebSocket-Protocol header.
    expect(clientProtocol).toBe('myproto')
    // Server-side: WSContext.protocol inside the worker.
    expect(echoedProtocol).toBe('myproto')
  })

  it('Should echo a message over a subprotocol connection', async () => {
    const worker = await unstable_dev('./test/worker.ts', {
      compatibilityDate: '2026-07-01',
      experimental: { disableExperimentalWarning: true },
    })
    const ws = new WebSocket(`ws://${worker.address}:${worker.port}/ws`, ['myproto'])

    const openHandler = vi.fn()
    const messageHandler = vi.fn()
    const closeHandler = vi.fn()

    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('error', (err) => reject(err))
      ws.addEventListener('open', () => {
        openHandler()
        ws.send('Hello')
      })
      ws.addEventListener('message', (event) => {
        messageHandler(event.data)
        ws.close()
      })
      ws.addEventListener('close', () => {
        closeHandler()
        resolve()
      })
    })
    await worker.stop()

    expect(openHandler).toHaveBeenCalled()
    expect(ws.protocol).toBe('myproto')
    expect(messageHandler).toHaveBeenCalledWith('Hello')
    expect(closeHandler).toHaveBeenCalled()
  })
})
