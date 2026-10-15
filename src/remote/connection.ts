import { RESUME_WINDOW, type ClientMessage, type ServerMessage } from './protocol'

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

export function relayUrl(): string {
  const url = new URL(import.meta.env.VITE_RELAY_URL || '/relay', window.location.href)
  if (url.protocol === 'https:') url.protocol = 'wss:'
  if (url.protocol === 'http:') url.protocol = 'ws:'
  if (
    url.protocol !== 'wss:' &&
    !(
      import.meta.env.DEV &&
      url.protocol === 'ws:' &&
      ['localhost', '127.0.0.1'].includes(url.hostname)
    )
  ) {
    throw new Error('Remote control requires a secure WSS relay. Configure VITE_RELAY_URL.')
  }
  return url.href
}

export class RelayConnection {
  private socket?: WebSocket
  private retry?: ReturnType<typeof setTimeout>
  private heartbeat?: ReturnType<typeof setInterval>
  private stopped = false
  private lostAt?: number
  private lastReceived = Date.now()
  private attempts = 0

  constructor(
    private url: string,
    private hello: () => ClientMessage,
    private message: (message: ServerMessage) => void,
    private status: (status: ConnectionStatus) => void,
  ) {
    window.addEventListener('online', this.wake)
    window.addEventListener('pageshow', this.wake)
    document.addEventListener('visibilitychange', this.wake)
    this.connect()
  }

  send(message: ClientMessage): boolean {
    if (this.stopped || this.socket?.readyState !== WebSocket.OPEN) return false
    try {
      this.socket.send(JSON.stringify(message))
      return true
    } catch {
      this.socket.close()
      return false
    }
  }

  private connect() {
    if (this.stopped) return
    if (this.lostAt !== undefined && Date.now() - this.lostAt >= RESUME_WINDOW) {
      this.stop()
      return
    }
    this.status(this.lostAt === undefined ? 'connecting' : 'reconnecting')
    const socket = new WebSocket(this.url)
    this.socket = socket
    const watchdog = setTimeout(() => {
      if (socket.readyState === WebSocket.CONNECTING) socket.close()
    }, 10_000)
    socket.onopen = () => {
      clearTimeout(watchdog)
      if (this.socket !== socket || this.stopped) return
      this.lastReceived = Date.now()
      this.status('connected')
      this.send(this.hello())
      this.heartbeat = setInterval(() => {
        if (Date.now() - this.lastReceived > 30_000) socket.close()
        else this.send({ type: 'ping' })
      }, 10_000)
    }
    socket.onmessage = (event) => {
      if (this.socket !== socket || this.stopped) return
      this.lastReceived = Date.now()
      this.lostAt = undefined
      this.attempts = 0
      try {
        this.message(JSON.parse(event.data) as ServerMessage)
      } catch {
        this.stop()
      }
    }
    socket.onclose = () => {
      clearTimeout(watchdog)
      if (this.socket !== socket || this.stopped) return
      clearInterval(this.heartbeat)
      this.lostAt ??= Date.now()
      this.status('reconnecting')
      this.retry = setTimeout(() => this.connect(), Math.min(500 * 2 ** this.attempts++, 5000))
    }
    socket.onerror = () => socket.close()
  }

  private wake = () => {
    if (document.visibilityState === 'hidden' || this.stopped) return
    this.message({ type: 'offline' })
    if (Date.now() - this.lastReceived > 20_000) this.socket?.close()
    else if (this.socket?.readyState === WebSocket.OPEN) {
      // Resume never trusts a cached snapshot, even if Safari kept the socket open.
      this.send({ type: 'sync' })
    }
  }

  stop() {
    this.stopped = true
    clearTimeout(this.retry)
    clearInterval(this.heartbeat)
    this.socket?.close()
    window.removeEventListener('online', this.wake)
    window.removeEventListener('pageshow', this.wake)
    document.removeEventListener('visibilitychange', this.wake)
    this.status('disconnected')
  }
}
