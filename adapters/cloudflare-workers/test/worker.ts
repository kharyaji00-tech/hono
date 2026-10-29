import { Hono } from 'hono'
import { upgradeWebSocket } from '../src/index'

const app = new Hono()

app.get(
  '/ws',
  upgradeWebSocket(() => ({
    onMessage(event, ws) {
      ws.send(event.data as string)
    },
  }))
)

// Echoes the negotiated subprotocol so tests can assert WSContext.protocol
// inside workerd (it always reports '' for the server socket, so the adapter
// surfaces the negotiated value from the request header instead).
app.get(
  '/ws-protocol',
  upgradeWebSocket(() => ({
    onMessage(_event, ws) {
      ws.send(ws.protocol ?? '')
    },
  }))
)

export default app
