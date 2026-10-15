import type { ServerWebSocket } from 'bun'
import { Relay, type Peer } from './session'

const relay = new Relay()
const origins = new Set(
  (
    process.env.ALLOWED_ORIGINS ??
    'http://localhost:1420,tauri://localhost,http://tauri.localhost,https://tauri.localhost'
  ).split(','),
)
interface Data {
  peer: Peer
  lastSeen: number
}
const peers = new Set<ServerWebSocket<Data>>()
const server = Bun.serve<Data>({
  hostname: process.env.HOST ?? '127.0.0.1',
  port: Number(process.env.PORT ?? 8787),
  fetch(request, server) {
    const url = new URL(request.url)
    if (url.pathname === '/health') return new Response('ok')
    if (url.pathname !== '/relay' || !origins.has(request.headers.get('origin') ?? ''))
      return new Response('Forbidden', { status: 403 })
    // Only trust this header when bound behind our loopback reverse proxy.
    const ip =
      process.env.TRUST_PROXY === '1'
        ? (request.headers.get('x-real-ip') ?? 'unknown')
        : (server.requestIP(request)?.address ?? 'unknown')
    // Installed when Bun opens the upgraded socket; admission needs no transport yet.
    const peer: Peer = { send() {}, close() {} }
    if (!relay.connect(peer, ip)) return new Response('Too many connections', { status: 429 })
    if (server.upgrade(request, { data: { peer, lastSeen: Date.now() } })) return
    relay.disconnect(peer)
    return new Response('WebSocket required', { status: 426 })
  },
  websocket: {
    maxPayloadLength: 524_288,
    idleTimeout: 60,
    open(ws) {
      // Bind the transport after upgrade without placing credentials in a URL/header/log.
      ws.data.peer.send = (message) => {
        if (ws.readyState !== 1) return
        if (ws.getBufferedAmount() > 1_048_576) {
          ws.close(1013, 'Slow connection')
          return
        }
        ws.send(JSON.stringify(message))
      }
      ws.data.peer.close = () => ws.close(1000)
      peers.add(ws)
    },
    message(ws, raw) {
      ws.data.lastSeen = Date.now()
      try {
        relay.receive(ws.data.peer, JSON.parse(typeof raw === 'string' ? raw : raw.toString()))
      } catch {
        ws.close(1007, 'Invalid message')
      }
    },
    close(ws) {
      peers.delete(ws)
      relay.disconnect(ws.data.peer)
    },
  },
})
setInterval(() => {
  relay.sweep()
  for (const ws of peers)
    if (Date.now() - ws.data.lastSeen > 35_000) ws.close(1001, 'Heartbeat expired')
}, 5000)
console.info(`Sanctuary relay listening on ${server.hostname}:${server.port}`)
