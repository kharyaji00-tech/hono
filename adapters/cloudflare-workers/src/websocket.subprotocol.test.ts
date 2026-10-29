import { Context } from 'hono'
import { upgradeWebSocket } from './websocket'

// The Cloudflare adapter returns a 101 response that carries the client socket
// through a non-standard `webSocket` init field. Workerd's `Response` permits
// status 101 and that field, but Node's undici `Response` rejects status 101
// (it must be in the range 200-599). For unit tests we substitute a capturing
// `Response` so the handler can run outside workerd.
type CapturedResponse = { status: number; headers: Headers; webSocket: unknown }

const globalScope = globalThis as typeof globalThis & { WebSocketPair?: unknown }

function MockResponse(_body: BodyInit | null, init: ResponseInit = {}): CapturedResponse {
  const headers =
    init.headers instanceof Headers ? init.headers : new Headers(init.headers ?? undefined)
  return {
    status: init.status ?? 200,
    headers,
    webSocket: (init as { webSocket?: unknown }).webSocket,
  }
}

// A stand-in for either side of a Cloudflare `WebSocketPair`, which only exists
// inside workerd. It is just an `EventTarget` with the few props the adapter
// touches, so the handler can wire events without the real runtime.
const createFakeSocket = (): WebSocket => {
  const socket = Object.assign(new EventTarget(), {
    accept: vi.fn(),
    protocol: '',
    readyState: 1,
    url: null,
    close: vi.fn(),
    send: vi.fn(),
  })
  return socket as unknown as WebSocket
}

const installWebSocketPair = (server: WebSocket): WebSocket => {
  const client = createFakeSocket()
  globalScope.WebSocketPair = function WebSocketPair() {
    return [client, server]
  }
  return client
}

describe('upgradeWebSocket subprotocol negotiation', () => {
  let originalResponse: typeof Response
  let originalWebSocketPair: unknown

  beforeEach(() => {
    originalResponse = globalScope.Response as typeof Response
    originalWebSocketPair = globalScope.WebSocketPair
    globalScope.Response = MockResponse as unknown as typeof Response
  })

  afterEach(() => {
    globalScope.Response = originalResponse
    globalScope.WebSocketPair = originalWebSocketPair
  })

  it('Should echo the first requested subprotocol on the 101 response', async () => {
    const server = createFakeSocket()
    const client = installWebSocketPair(server)
    const c = new Context(
      new Request('http://localhost/ws', {
        headers: {
          upgrade: 'websocket',
          'sec-websocket-protocol': 'myproto, otherproto',
        },
      })
    )
    const response = (await upgradeWebSocket(c, {})) as unknown as CapturedResponse
    expect(response.status).toBe(101)
    expect(response.headers.get('sec-websocket-protocol')).toBe('myproto')
    expect(response.webSocket).toBe(client)
  })

  it('Should trim whitespace around the selected subprotocol', async () => {
    const server = createFakeSocket()
    installWebSocketPair(server)
    const c = new Context(
      new Request('http://localhost/ws', {
        headers: {
          upgrade: 'websocket',
          'sec-websocket-protocol': '  spaced  , other',
        },
      })
    )
    const response = (await upgradeWebSocket(c, {})) as unknown as CapturedResponse
    expect(response.headers.get('sec-websocket-protocol')).toBe('spaced')
  })

  it('Should not set Sec-WebSocket-Protocol when the request omits it', async () => {
    const server = createFakeSocket()
    installWebSocketPair(server)
    const c = new Context(
      new Request('http://localhost/ws', {
        headers: { upgrade: 'websocket' },
      })
    )
    const response = (await upgradeWebSocket(c, {})) as unknown as CapturedResponse
    expect(response.status).toBe(101)
    expect(response.headers.get('sec-websocket-protocol')).toBeNull()
  })

  it('Should expose the negotiated subprotocol on WSContext.protocol', async () => {
    const server = createFakeSocket()
    installWebSocketPair(server)
    let captured: { protocol: string | null } | undefined
    const c = new Context(
      new Request('http://localhost/ws', {
        headers: {
          upgrade: 'websocket',
          'sec-websocket-protocol': 'chat, superchat',
        },
      })
    )
    await upgradeWebSocket(c, {
      onMessage: (_evt, ws) => {
        captured = ws
      },
    })
    server.dispatchEvent(new MessageEvent('message', { data: 'ping' }))
    expect(captured?.protocol).toBe('chat')
  })

  it('Should report an empty protocol when no subprotocol is requested', async () => {
    const server = createFakeSocket()
    installWebSocketPair(server)
    let captured: { protocol: string | null } | undefined
    const c = new Context(
      new Request('http://localhost/ws', {
        headers: { upgrade: 'websocket' },
      })
    )
    await upgradeWebSocket(c, {
      onMessage: (_evt, ws) => {
        captured = ws
      },
    })
    server.dispatchEvent(new MessageEvent('message', { data: 'ping' }))
    expect(captured?.protocol).toBe('')
  })
})
