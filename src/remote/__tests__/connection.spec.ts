import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useRemoteControllerStore } from '@/stores/remoteController'
import { useRemoteHostStore } from '@/stores/remoteHost'
import { usePlayerStore } from '@/stores/player'
import { useServicesStore } from '@/stores/services'
import { useLibraryStore } from '@/stores/library'
import { COMMAND_TIMEOUT, RESUME_WINDOW, type ClientMessage, type ServerMessage } from '../protocol'
import { RelayConnection } from '../connection'
import { command, state } from './fixtures'

class Socket {
  static OPEN = 1
  static CONNECTING = 0
  static instances: Socket[] = []
  readyState = 0
  sent: ClientMessage[] = []
  onopen?: () => void
  onclose?: () => void
  onerror?: () => void
  onmessage?: (e: { data: string }) => void
  constructor() {
    Socket.instances.push(this)
  }
  send(value: string) {
    this.sent.push(JSON.parse(value))
  }
  open() {
    this.readyState = 1
    this.onopen?.()
  }
  close() {
    if (this.readyState === 3) return
    this.readyState = 3
    this.onclose?.()
  }
  receive(value: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(value) })
  }
}
const socket = () => Socket.instances.at(-1)!
describe('controller and host connections', () => {
  let remote: ReturnType<typeof useRemoteControllerStore>
  let host: ReturnType<typeof useRemoteHostStore>
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', Socket)
    Socket.instances = []
    sessionStorage.clear()
    setActivePinia(createPinia())
    remote = useRemoteControllerStore()
    host = useRemoteHostStore()
  })
  afterEach(() => {
    remote.disconnect()
    host.disable()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
  function paired() {
    remote.pair('123456')
    socket().open()
    socket().receive({ type: 'paired', token: 'b'.repeat(64) })
    socket().receive({ type: 'state', state: state() })
  }
  it('keeps commands pending until host acknowledgment and reports panic status', () => {
    paired()
    remote.send({ action: 'panic' })
    expect(remote.pending).toHaveLength(1)
    expect(remote.panicStatus).toContain('waiting for host acknowledgment')
    socket().receive({ type: 'result', result: { requestId: remote.pending[0]!, ok: true } })
    expect(remote.pending).toHaveLength(0)
    expect(remote.panicStatus).toContain('Acknowledged')
  })
  it('never sends or replays offline presses, and refreshes state before restoring controls', () => {
    paired()
    const firstSocket = socket()
    firstSocket.close()
    remote.send({ action: 'play' })
    remote.send({ action: 'panic' })
    expect(remote.panicStatus).toContain('Not sent')
    expect(firstSocket.sent.some((m) => m.type === 'command')).toBe(false)
    vi.advanceTimersByTime(500)
    socket().open()
    expect(socket().sent[0]).toMatchObject({ type: 'resume', role: 'controller' })
    socket().receive({ type: 'resumed' })
    expect(remote.ready).toBe(false)
    remote.send({ action: 'next' })
    socket().receive({ type: 'state', state: state() })
    expect(remote.ready).toBe(true)
    expect(socket().sent.some((m) => m.type === 'command')).toBe(false)
  })
  it('makes timed out panic outcomes explicitly unknown, without retries', () => {
    paired()
    remote.send({ action: 'panic' })
    vi.advanceTimersByTime(COMMAND_TIMEOUT)
    expect(remote.pending).toHaveLength(0)
    expect(remote.panicStatus).toContain('Unconfirmed')
    expect(socket().sent.filter((m) => m.type === 'command')).toHaveLength(1)
  })
  it('requires fresh state after phone foreground/resume and retains tab credentials for reload', () => {
    paired()
    window.dispatchEvent(new Event('pageshow'))
    expect(remote.ready).toBe(false)
    expect(socket().sent.at(-1)).toMatchObject({ type: 'sync' })
    expect(sessionStorage.getItem('sanctuary-controller')).toBe('b'.repeat(64))
    socket().receive({ type: 'state', state: state() })
    expect(remote.ready).toBe(true)
    socket().receive({ type: 'revoked' })
    expect(remote.ready).toBe(false)
    expect(sessionStorage.getItem('sanctuary-controller')).toBeNull()
  })
  it('resumes a controller after reload using tab storage, not a pairing code', () => {
    sessionStorage.setItem('sanctuary-controller', 'c'.repeat(64))
    remote.resume()
    socket().open()
    expect(socket().sent[0]).toMatchObject({
      type: 'resume',
      token: 'c'.repeat(64),
      role: 'controller',
    })
    socket().receive({ type: 'error', code: 'INVALID_SESSION', message: 'Pair again.' })
    expect(remote.status).toBe('disconnected')
    expect(remote.error).toBe('Pair again.')
  })
  it('stops reconnection after the documented session window', () => {
    const statuses: string[] = []
    const connection = new RelayConnection(
      'ws://localhost/relay',
      () => ({ type: 'ping' }),
      () => {},
      (s) => statuses.push(s),
    )
    socket().open()
    socket().close()
    vi.advanceTimersByTime(RESUME_WINDOW + 10_000)
    expect(statuses.at(-1)).toBe('disconnected')
    connection.stop()
  })
  it('publishes local changes and paused seeks, without altering playback on disconnect', async () => {
    useServicesStore().ready = true
    useLibraryStore().ready = true
    await host.enable()
    socket().open()
    socket().receive({ type: 'host', code: '123456', expiresAt: Date.now() + 300_000 })
    socket().receive({ type: 'controller', id: 'approved', name: 'phone', online: true })
    const player = usePlayerStore()
    player.setChoir(0.2)
    await Promise.resolve()
    expect(socket().sent.findLast((m) => m.type === 'state')).toMatchObject({
      state: { choir: 0.2 },
    })
    const stop = vi.spyOn(player, 'stop')
    const pause = vi.spyOn(player, 'pause')
    socket().close()
    expect(stop).not.toHaveBeenCalled()
    expect(pause).not.toHaveBeenCalled()
    expect(host.status).toBe('reconnecting')
    host.revoke()
    expect(host.enabled).toBe(false)
    expect(stop).not.toHaveBeenCalled()
    expect(pause).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })
  it('dispatches only commands from the currently approved controller', async () => {
    useServicesStore().ready = true
    useLibraryStore().ready = true
    await host.enable()
    socket().open()
    socket().receive({ type: 'host', code: '123456', expiresAt: Date.now() + 300_000 })
    socket().receive({ type: 'controller', id: 'approved', name: 'phone', online: true })
    const stop = vi.spyOn(usePlayerStore(), 'stop')
    socket().receive({
      type: 'command',
      controllerId: 'attacker',
      command: command({ action: 'stop' }),
    })
    await Promise.resolve()
    expect(stop).not.toHaveBeenCalled()
    socket().receive({
      type: 'command',
      controllerId: 'approved',
      command: command({ action: 'stop' }),
    })
    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce())
    host.revoke()
    socket().receive({
      type: 'command',
      controllerId: 'approved',
      command: command({ action: 'stop' }),
    })
    await Promise.resolve()
    expect(stop).toHaveBeenCalledOnce()
    vi.restoreAllMocks()
  })
  it('does not restore removed access if a revocation frame was lost before reconnect', async () => {
    useServicesStore().ready = true
    useLibraryStore().ready = true
    await host.enable()
    socket().open()
    socket().receive({ type: 'controller', id: 'removed', name: 'phone', online: true })
    host.revoke()
    socket().close()
    vi.advanceTimersByTime(500)
    socket().open()
    socket().receive({ type: 'controller', id: 'removed', name: 'phone', online: true })
    const stop = vi.spyOn(usePlayerStore(), 'stop')
    socket().receive({
      type: 'command',
      controllerId: 'removed',
      command: command({ action: 'stop' }),
    })
    await Promise.resolve()
    expect(stop).not.toHaveBeenCalled()
    expect(host.controller).toBeNull()
    expect(socket().sent).toContainEqual({ type: 'revoke' })
    vi.restoreAllMocks()
  })
})
