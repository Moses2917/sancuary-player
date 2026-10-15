import {
  CODE_TTL,
  RESUME_WINDOW,
  VERSION,
  record,
  validCommand,
  validId,
  validState,
  type ServerMessage,
} from '../src/remote/protocol'

export interface Peer {
  send(message: ServerMessage): void
  close(): void
}
interface Controller {
  id: string
  name: string
  token: string
  peer?: Peer
  leftAt?: number
  ready: boolean
}
interface Session {
  token: string
  peer?: Peer
  leftAt?: number
  code: string
  expiresAt: number
  controller?: Controller
  pending?: { id: string; name: string; peer: Peer; expiresAt: number }
}
interface Connection {
  ip: string
  openedAt: number
  session?: Session
  role?: 'host' | 'controller'
  count: number
  since: number
}
const token = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
const validToken = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
function randomCode(): string {
  const bytes = new Uint32Array(1)
  do {
    crypto.getRandomValues(bytes)
  } while (bytes[0]! >= 4_294_000_000)
  return String(bytes[0]! % 1_000_000).padStart(6, '0')
}

export class Relay {
  // shortcut: sessions belong to one process; add shared state before deploying replicas.
  private sessions = new Set<Session>()
  private connections = new Map<Peer, Connection>()
  private codes = new Map<string, Session>()
  private hosts = new Map<string, Session>()
  private controllers = new Map<string, Session>()
  private attempts = new Map<string, { count: number; since: number }>()

  constructor(
    private now = Date.now,
    private codeGenerator = randomCode,
  ) {}

  connect(peer: Peer, ip: string): boolean {
    if (
      this.connections.size >= 2000 ||
      [...this.connections.values()].filter((c) => c.ip === ip).length >= 20
    ) {
      peer.close()
      return false
    }
    this.connections.set(peer, { ip, count: 0, since: this.now(), openedAt: this.now() })
    return true
  }

  private error(peer: Peer, code: string, message: string) {
    peer.send({ type: 'error', code, message })
  }
  private consumeAttempt(key: string, limit: number): boolean {
    let entry = this.attempts.get(key)
    if (!entry || this.now() - entry.since >= 60_000) {
      entry = { count: 0, since: this.now() }
      this.attempts.set(key, entry)
    }
    return ++entry.count <= limit
  }
  private cancelPending(session: Session, code = 'REJECTED') {
    if (!session.pending) return
    this.error(
      session.pending.peer,
      code,
      'Pairing was rejected or expired. Ask the player for a new code.',
    )
    session.pending = undefined
  }
  private invalidateCode(session: Session) {
    this.codes.delete(session.code)
    session.code = ''
    session.expiresAt = 0
  }
  private issueCode(session: Session) {
    this.cancelPending(session)
    this.invalidateCode(session)
    let code = this.codeGenerator()
    while (this.codes.has(code)) code = this.codeGenerator()
    session.code = code
    session.expiresAt = this.now() + CODE_TTL
    this.codes.set(code, session)
    session.peer?.send({ type: 'host', code, expiresAt: session.expiresAt })
  }
  private controllerStatus(session: Session) {
    const c = session.controller
    if (c) session.peer?.send({ type: 'controller', id: c.id, name: c.name, online: !!c.peer })
  }
  private revoke(session: Session) {
    const c = session.controller
    if (!c) return
    this.controllers.delete(c.token)
    if (c.peer) {
      const connection = this.connections.get(c.peer)
      if (connection) {
        connection.session = undefined
        connection.role = undefined
      }
      c.peer.send({ type: 'revoked' })
      c.peer.close()
    }
    session.controller = undefined
    session.peer?.send({ type: 'revoked' })
  }
  private remove(session: Session) {
    this.cancelPending(session)
    this.revoke(session)
    this.invalidateCode(session)
    this.hosts.delete(session.token)
    this.sessions.delete(session)
    if (session.peer) {
      const peer = session.peer
      const connection = this.connections.get(peer)
      if (connection) {
        connection.session = undefined
        connection.role = undefined
      }
      peer.close()
    }
  }

  disconnect(peer: Peer) {
    const connection = this.connections.get(peer)
    this.connections.delete(peer)
    for (const session of this.sessions) {
      if (session.pending?.peer === peer) session.pending = undefined
    }
    if (!connection?.session) return
    const session = connection.session
    if (connection.role === 'host' && session.peer === peer) {
      session.peer = undefined
      session.leftAt = this.now()
      if (session.controller) {
        session.controller.ready = false
        session.controller.peer?.send({ type: 'offline' })
      }
      this.cancelPending(session)
    } else if (session.controller?.peer === peer) {
      session.controller.peer = undefined
      session.controller.leftAt = this.now()
      session.controller.ready = false
      this.controllerStatus(session)
    }
  }

  sweep() {
    for (const session of this.sessions) {
      if (session.leftAt !== undefined && this.now() - session.leftAt >= RESUME_WINDOW) {
        this.remove(session)
        continue
      }
      if (session.code && this.now() >= session.expiresAt) {
        this.cancelPending(session, 'EXPIRED')
        this.invalidateCode(session)
        session.peer?.send({ type: 'host', code: '', expiresAt: 0 })
      }
      if (session.pending && this.now() >= session.pending.expiresAt)
        this.cancelPending(session, 'EXPIRED')
      if (
        session.controller?.leftAt !== undefined &&
        this.now() - session.controller.leftAt >= RESUME_WINDOW
      )
        this.revoke(session)
    }
    for (const [key, entry] of this.attempts)
      if (this.now() - entry.since >= 60_000) this.attempts.delete(key)
    for (const [peer, connection] of this.connections) {
      if (!connection.role && this.now() - connection.openedAt > CODE_TTL) peer.close()
    }
  }

  receive(peer: Peer, message: unknown) {
    this.sweep()
    const connection = this.connections.get(peer)
    if (!connection || !record(message)) return
    if (this.now() - connection.since >= 1000) {
      connection.count = 0
      connection.since = this.now()
    }
    if (++connection.count > 40) {
      this.error(peer, 'RATE_LIMIT', 'Too many requests. Slow down and try again.')
      peer.close()
      return
    }
    if (message.type === 'ping') {
      peer.send({ type: 'pong' })
      return
    }
    if (message.type === 'create' || message.type === 'resume' || message.type === 'pair') {
      if (connection.role || connection.session)
        return this.error(peer, 'ALREADY_AUTHENTICATED', 'Use a new connection.')
      if (message.version !== VERSION)
        return this.error(peer, 'VERSION', 'Update Sanctuary Player on both devices.')
      if (message.type === 'create') {
        if (
          !validToken(message.token) ||
          this.hosts.has(message.token) ||
          this.controllers.has(message.token)
        )
          return this.error(peer, 'INVALID_SESSION', 'Invalid host credential.')
        if (!this.consumeAttempt(`create:${connection.ip}`, 10) || this.sessions.size >= 1000)
          return this.error(peer, 'RATE_LIMIT', 'Session limit reached. Try again later.')
        const session: Session = { token: message.token, peer, code: '', expiresAt: 0 }
        this.sessions.add(session)
        this.hosts.set(session.token, session)
        connection.session = session
        connection.role = 'host'
        this.issueCode(session)
        return
      }
      if (message.type === 'resume') {
        if (!validToken(message.token) || !['host', 'controller'].includes(String(message.role)))
          return this.error(peer, 'INVALID_SESSION', 'Pair again on the player.')
        const session =
          message.role === 'host'
            ? this.hosts.get(message.token)
            : this.controllers.get(message.token)
        if (!session)
          return this.error(peer, 'INVALID_SESSION', 'Session expired. Pair again on the player.')
        connection.session = session
        connection.role = message.role as 'host' | 'controller'
        if (message.role === 'host') {
          const old = session.peer
          session.peer = peer
          session.leftAt = undefined
          if (old && old !== peer) old.close()
          peer.send({ type: 'host', code: session.code, expiresAt: session.expiresAt })
          this.controllerStatus(session)
        } else {
          const c = session.controller!
          const old = c.peer
          c.peer = peer
          c.leftAt = undefined
          c.ready = false
          if (old && old !== peer) old.close()
          peer.send({ type: 'resumed' })
          this.controllerStatus(session)
          if (!session.peer) peer.send({ type: 'offline' })
        }
        session.peer?.send({ type: 'sync' })
        return
      }
      const allowed = this.consumeAttempt(`pair:${connection.ip}`, 6)
      const globalAllowed = this.consumeAttempt('pair:global', 120)
      if (!allowed || !globalAllowed)
        return this.error(peer, 'RATE_LIMIT', 'Too many pairing attempts. Wait one minute.')
      if (
        typeof message.code !== 'string' ||
        !/^\d{6}$/.test(message.code) ||
        typeof message.name !== 'string' ||
        message.name.length > 80
      )
        return this.error(peer, 'INVALID_CODE', 'Enter a six-digit code.')
      const session = this.codes.get(message.code)
      if (!session?.peer || session.pending)
        return this.error(peer, 'INVALID_CODE', 'Code unavailable, expired, or awaiting approval.')
      for (const s of this.sessions)
        if (s.pending?.peer === peer)
          return this.error(peer, 'WAITING', 'Already waiting for host approval.')
      session.pending = {
        id: token(),
        peer,
        name: message.name.trim() || 'Browser controller',
        expiresAt: Math.min(session.expiresAt, this.now() + 60_000),
      }
      peer.send({ type: 'waiting' })
      session.peer.send({
        type: 'approval',
        id: session.pending.id,
        name: session.pending.name,
        expiresAt: session.pending.expiresAt,
      })
      return
    }

    const session = connection.session
    if (!session) return this.error(peer, 'UNAUTHORIZED', 'Pair with a player first.')
    if (connection.role === 'host') {
      if (session.peer !== peer) return
      switch (message.type) {
        case 'regenerate':
          if (this.consumeAttempt(`code:${session.token}`, 10)) this.issueCode(session)
          else this.error(peer, 'RATE_LIMIT', 'Wait one minute before generating another code.')
          break
        case 'revoke':
          this.cancelPending(session)
          this.revoke(session)
          break
        case 'disable':
          this.remove(session)
          break
        case 'sync':
          peer.send({ type: 'sync' })
          break
        case 'approval': {
          const pending = session.pending
          if (!pending || message.id !== pending.id || typeof message.approve !== 'boolean') break
          if (!message.approve) {
            this.cancelPending(session)
            this.invalidateCode(session)
            peer.send({ type: 'host', code: '', expiresAt: 0 })
            break
          }
          if (!this.connections.has(pending.peer)) {
            this.cancelPending(session)
            break
          }
          this.revoke(session)
          const c: Controller = {
            id: pending.id,
            name: pending.name,
            token: token(),
            peer: pending.peer,
            ready: false,
          }
          session.controller = c
          this.controllers.set(c.token, session)
          const controllerConnection = this.connections.get(pending.peer)!
          controllerConnection.session = session
          controllerConnection.role = 'controller'
          session.pending = undefined
          this.invalidateCode(session)
          peer.send({ type: 'host', code: '', expiresAt: 0 })
          c.peer!.send({ type: 'paired', token: c.token })
          this.controllerStatus(session)
          peer.send({ type: 'sync' })
          break
        }
        case 'state':
          if (!validState(message.state))
            return this.error(peer, 'INVALID_STATE', 'Host metadata is invalid or too large.')
          if (session.controller?.peer) {
            session.controller.ready = true
            session.controller.peer.send({ type: 'state', state: message.state })
          }
          break
        case 'result': {
          const c = session.controller
          const r = message.result
          if (
            c?.id !== message.controllerId ||
            !record(r) ||
            !validId(r.requestId) ||
            typeof r.ok !== 'boolean'
          )
            break
          if (
            !r.ok &&
            (!record(r.error) ||
              typeof r.error.code !== 'string' ||
              typeof r.error.message !== 'string')
          )
            break
          c?.peer?.send({
            type: 'result',
            result: {
              requestId: r.requestId,
              ok: r.ok,
              ...(!r.ok && record(r.error)
                ? {
                    error: {
                      code: String(r.error.code).slice(0, 80),
                      message: String(r.error.message).slice(0, 1000),
                    },
                  }
                : {}),
            },
          })
          break
        }
        default:
          this.error(peer, 'UNSUPPORTED', 'Unsupported host operation.')
      }
    } else {
      const c = session.controller
      if (c?.peer !== peer) return
      if (message.type === 'sync') {
        c.ready = false
        session.peer?.send({ type: 'sync' })
      } else if (message.type === 'command') {
        if (!validCommand(message.command)) {
          if (record(message.command) && validId(message.command.requestId)) {
            peer.send({
              type: 'result',
              result: {
                requestId: message.command.requestId,
                ok: false,
                error: { code: 'INVALID_COMMAND', message: 'Invalid playback command.' },
              },
            })
          } else this.error(peer, 'INVALID_COMMAND', 'Invalid playback command.')
          return
        }
        if (!c.ready || !session.peer) {
          peer.send({
            type: 'result',
            result: {
              requestId: message.command.requestId,
              ok: false,
              error: { code: 'OFFLINE', message: 'Player disconnected. Command was not queued.' },
            },
          })
          return
        }
        session.peer.send({ type: 'command', controllerId: c.id, command: message.command })
      } else this.error(peer, 'UNSUPPORTED', 'Unsupported controller operation.')
    }
  }
}
