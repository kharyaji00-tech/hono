import type { UpgradeWebSocket, WSEvents, WSMessageReceive } from '../../helper/websocket'
import { createWSMessageEvent, defineWebSocketHelper, WSContext } from '../../helper/websocket'
import { getBunServer } from './server'

/**
 * @internal
 * @deprecated `hono/bun` will be removed in v5. Install `@hono/bun` and import from there instead.
 */
export interface BunServerWebSocket<T> {
  send(data: string | ArrayBuffer | Uint8Array, compress?: boolean): void
  close(code?: number, reason?: string): void
  data: T
  readyState: 0 | 1 | 2 | 3
}

/**
 * @deprecated `hono/bun` will be removed in v5. Install `@hono/bun` and import from there instead.
 */
export interface BunWebSocketHandler<T> {
  open(ws: BunServerWebSocket<T>): void
  close(ws: BunServerWebSocket<T>, code?: number, reason?: string): void
  message(ws: BunServerWebSocket<T>, message: string | { buffer: ArrayBufferLike }): void
  error(error: Error, ws: BunServerWebSocket<T>): void
}
interface CreateWebSocket<T> {
  upgradeWebSocket: UpgradeWebSocket<T>
  websocket: BunWebSocketHandler<BunWebSocketData>
}
/**
 * @deprecated `hono/bun` will be removed in v5. Install `@hono/bun` and import from there instead.
 */
export interface BunWebSocketData {
  events: WSEvents
  url: URL
  protocol: string
}

/**
 * @internal
 * @deprecated `hono/bun` will be removed in v5. Install `@hono/bun` and import from there instead.
 */
export const createWSContext = (ws: BunServerWebSocket<BunWebSocketData>): WSContext => {
  return new WSContext({
    send: (source, options) => {
      ws.send(source, options?.compress)
    },
    raw: ws,
    readyState: ws.readyState,
    url: ws.data.url,
    protocol: ws.data.protocol,
    close(code, reason) {
      ws.close(code, reason)
    },
  })
}

/**
 * @deprecated `hono/bun` will be removed in v5. Install `@hono/bun` and import from there instead.
 */
export const upgradeWebSocket: UpgradeWebSocket<any> = defineWebSocketHelper((c, events) => {
  const server = getBunServer<{
    upgrade<T>(
      req: Request,
      options?: {
        data: T
      }
    ): boolean
  }>(c)

  if (!server) {
    throw new TypeError('env has to include the 2nd argument of fetch.')
  }
  const upgradeResult = server.upgrade<BunWebSocketData>(c.req.raw, {
    data: {
      events,
      url: new URL(c.req.url),
      // The first requested subprotocol, exposed via WSContext.protocol to
      // match the deno and cloudflare adapters.
      protocol: c.req.header('sec-websocket-protocol')?.split(',')[0]?.trim() ?? '',
    },
  })
  if (upgradeResult) {
    return new Response(null)
  }
  return // failed
})

/**
 * @deprecated `hono/bun` will be removed in v5. Install `@hono/bun` and import from there instead.
 */
export const websocket: BunWebSocketHandler<BunWebSocketData> = {
  open(ws) {
    const websocketListeners = ws.data.events
    if (websocketListeners.onOpen) {
      websocketListeners.onOpen(new Event('open'), createWSContext(ws))
    }
  },
  close(ws, code, reason) {
    const websocketListeners = ws.data.events
    if (websocketListeners.onClose) {
      websocketListeners.onClose(
        new CloseEvent('close', {
          code,
          reason,
        }),
        createWSContext(ws)
      )
    }
  },
  message(ws, message) {
    const websocketListeners = ws.data.events
    if (websocketListeners.onMessage) {
      const normalizedReceiveData: WSMessageReceive =
        typeof message === 'string' ? message : message.buffer

      websocketListeners.onMessage(createWSMessageEvent(normalizedReceiveData), createWSContext(ws))
    }
  },
  error(error: unknown, ws: unknown) {
    // Bun only catches socket-handler exceptions when an `error` member is
    // present on the `websocket` object passed to `Bun.serve()`. Without it,
    // any throw inside `open`/`message`/`close` becomes an uncaught exception
    // that terminates the whole `Bun.serve` process. Defining this hook opts
    // Bun into catching those errors so the server survives.
    //
    // Bun >= 1.4 invokes the hook as `error(error, ws)`; older Bun versions
    // invoked it as `error(ws, error)`. The websocket argument carries
    // `data`, so when the first argument is a plain object with `data` (and
    // not an `Error` instance) treat it as the websocket and swap the order
    // before forwarding to the user's `onError` callback (matching the deno
    // and cloudflare adapters).
    let webSocket: BunServerWebSocket<BunWebSocketData>
    let thrownError: unknown
    if (
      error !== null &&
      typeof error === 'object' &&
      'data' in error &&
      !(error instanceof Error)
    ) {
      webSocket = error as BunServerWebSocket<BunWebSocketData>
      thrownError = ws
    } else {
      webSocket = ws as BunServerWebSocket<BunWebSocketData>
      thrownError = error
    }
    const evt = new Event('error')
    ;(evt as Event & { error: unknown }).error = thrownError
    webSocket.data.events.onError?.(evt, createWSContext(webSocket))
  },
}

/**
 * @deprecated Import `upgradeWebSocket` and `websocket` directly from `hono/bun` instead.
 * @returns A function to create a Bun WebSocket handler.
 */
export const createBunWebSocket = <T>(): CreateWebSocket<T> => ({
  upgradeWebSocket,
  websocket,
})
