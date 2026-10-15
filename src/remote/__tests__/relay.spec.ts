import { beforeEach, describe, expect, it } from 'vitest'
import { Relay, type Peer } from '../../../relay/session'
import { CODE_TTL, RESUME_WINDOW, type ServerMessage } from '../protocol'
import { command, state } from './fixtures'

class Client implements Peer {
  messages: ServerMessage[] = []
  closed = false
  send(message: ServerMessage) {
    this.messages.push(message)
  }
  close() {
    this.closed = true
  }
  last<T extends ServerMessage['type']>(type: T) {
    return this.messages.findLast((m) => m.type === type) as Extract<ServerMessage, { type: T }>
  }
}
describe('relay authorization and recovery', () => {
  let relay: Relay
  let now: number
  let host: Client
  let phone: Client
  let code: string
  const hostToken = 'a'.repeat(64)
  function client(ip: string = crypto.randomUUID()) {
    const peer = new Client()
    expect(relay.connect(peer, ip)).toBe(true)
    return peer
  }
  function pair() {
    relay.receive(phone, { type: 'pair', version: 1, code, name: 'iPhone' })
    relay.receive(host, { type: 'approval', id: host.last('approval').id, approve: true })
    return phone.last('paired').token
  }
  beforeEach(() => {
    now = 1000
    relay = new Relay(() => now)
    host = client()
    phone = client()
    relay.receive(host, { type: 'create', version: 1, token: hostToken })
    code = host.last('host').code
  })
  it('requires approval before state or commands and consumes the code', () => {
    expect(code).toMatch(/^\d{6}$/)
    relay.receive(phone, { type: 'pair', version: 1, code, name: 'iPhone' })
    relay.receive(host, { type: 'state', state: state() })
    expect(phone.last('state')).toBeUndefined()
    relay.receive(phone, { type: 'command', command: command() })
    expect(phone.last('error').code).toBe('UNAUTHORIZED')
    relay.receive(host, { type: 'approval', id: 'wrong', approve: true })
    expect(phone.last('paired')).toBeUndefined()
    relay.receive(host, { type: 'approval', id: host.last('approval').id, approve: true })
    expect(phone.last('paired').token).toMatch(/^[a-f0-9]{64}$/)
    relay.receive(host, { type: 'state', state: state() })
    expect(phone.last('state').state.song?.title).toBe('Hymn')
    const other = client()
    relay.receive(other, { type: 'pair', version: 1, code, name: 'Other' })
    expect(other.last('error').code).toBe('INVALID_CODE')
  })
  it('expires codes and pending approvals at their deadlines', () => {
    relay.receive(phone, { type: 'pair', version: 1, code, name: 'iPhone' })
    const id = host.last('approval').id
    now += CODE_TTL
    relay.receive(host, { type: 'approval', id, approve: true })
    expect(phone.last('paired')).toBeUndefined()
    expect(phone.last('error').code).toBe('EXPIRED')
    relay.receive(client(), { type: 'pair', version: 1, code, name: 'late' })
    expect(host.last('host').code).toBe('')
  })
  it('rejects a request and invalidates its code', () => {
    relay.receive(phone, { type: 'pair', version: 1, code, name: 'iPhone' })
    relay.receive(host, { type: 'approval', id: host.last('approval').id, approve: false })
    expect(phone.last('error').code).toBe('REJECTED')
    const retry = client()
    relay.receive(retry, { type: 'pair', version: 1, code, name: 'retry' })
    expect(retry.last('error').code).toBe('INVALID_CODE')
  })
  it('keeps active codes unique even when the random generator collides', () => {
    const codes = ['123456', '123456', '654321']
    relay = new Relay(
      () => now,
      () => codes.shift()!,
    )
    const a = client()
    const b = client()
    relay.receive(a, { type: 'create', version: 1, token: hostToken })
    relay.receive(b, { type: 'create', version: 1, token: 'b'.repeat(64) })
    expect(a.last('host').code).not.toBe(b.last('host').code)
  })
  it('separates host credentials from controllers and isolates sessions', () => {
    const controllerToken = pair()
    const impostor = client()
    relay.receive(impostor, { type: 'resume', version: 1, role: 'host', token: controllerToken })
    expect(impostor.last('error').code).toBe('INVALID_SESSION')
    const otherHost = client()
    relay.receive(otherHost, { type: 'create', version: 1, token: 'b'.repeat(64) })
    relay.receive(host, { type: 'state', state: state() })
    relay.receive(phone, { type: 'command', command: command() })
    expect(host.last('command')).toBeDefined()
    expect(otherHost.last('command')).toBeUndefined()
    relay.receive(phone, { type: 'state', state: state() })
    expect(phone.last('error').code).toBe('UNSUPPORTED')
  })
  it('revokes existing credentials only after replacement approval', () => {
    const oldToken = pair()
    relay.receive(host, { type: 'regenerate' })
    const next = client()
    relay.receive(next, {
      type: 'pair',
      version: 1,
      code: host.last('host').code,
      name: 'Replacement',
    })
    expect(phone.closed).toBe(false)
    relay.receive(host, { type: 'approval', id: host.last('approval').id, approve: true })
    expect(phone.last('revoked')).toBeDefined()
    expect(phone.closed).toBe(true)
    relay.receive(client(), { type: 'resume', version: 1, role: 'controller', token: oldToken })
    const stale = client()
    relay.receive(stale, { type: 'resume', version: 1, role: 'controller', token: oldToken })
    expect(stale.last('error').code).toBe('INVALID_SESSION')
  })
  it('disable immediately revokes the entire session', () => {
    const credential = pair()
    relay.receive(host, { type: 'disable' })
    expect(phone.closed).toBe(true)
    const retry = client()
    relay.receive(retry, { type: 'resume', version: 1, role: 'controller', token: credential })
    expect(retry.last('error').code).toBe('INVALID_SESSION')
    relay.receive(retry, { type: 'resume', version: 1, role: 'host', token: hostToken })
    expect(retry.last('error').code).toBe('INVALID_SESSION')
  })
  it('requires fresh host state on reconnect and never queues offline commands', () => {
    const credential = pair()
    relay.receive(host, { type: 'state', state: state() })
    relay.disconnect(phone)
    const resumed = client()
    relay.receive(resumed, { type: 'resume', version: 1, role: 'controller', token: credential })
    const op = command()
    relay.receive(resumed, { type: 'command', command: op })
    expect(resumed.last('result').result.error?.code).toBe('OFFLINE')
    relay.receive(host, { type: 'state', state: state() })
    expect(host.last('command')).toBeUndefined()
    relay.receive(resumed, { type: 'command', command: command() })
    expect(host.last('command')).toBeDefined()
    relay.disconnect(host)
    expect(resumed.last('offline')).toBeDefined()
    const newHost = client()
    relay.receive(newHost, { type: 'resume', version: 1, role: 'host', token: hostToken })
    expect(newHost.last('sync')).toBeDefined()
    relay.receive(newHost, { type: 'state', state: state() })
    expect(resumed.last('state')).toBeDefined()
  })
  it('expires disconnected hosts and controller credentials after two minutes', () => {
    const credential = pair()
    relay.disconnect(phone)
    now += RESUME_WINDOW
    relay.sweep()
    const retry = client()
    relay.receive(retry, { type: 'resume', version: 1, role: 'controller', token: credential })
    expect(retry.last('error').code).toBe('INVALID_SESSION')
    relay.disconnect(host)
    now += RESUME_WINDOW
    relay.receive(retry, { type: 'resume', version: 1, role: 'host', token: hostToken })
    expect(retry.last('error').code).toBe('INVALID_SESSION')
  })
  it('rate limits pairing attempts across connections from the same IP', () => {
    for (let i = 0; i < 6; i++)
      relay.receive(client('same-ip'), { type: 'pair', version: 1, code: '------', name: 'guess' })
    const seventh = client('same-ip')
    relay.receive(seventh, { type: 'pair', version: 1, code, name: 'guess' })
    expect(seventh.last('error').code).toBe('RATE_LIMIT')
    now += 60_000
    relay.receive(seventh, { type: 'pair', version: 1, code, name: 'phone' })
    expect(seventh.last('waiting')).toBeDefined()
  })
  it('rejects malformed commands and metadata containing audio sources', () => {
    pair()
    relay.receive(host, { type: 'state', state: { ...state(), pianoSource: 'secret' } })
    expect(host.last('error').code).toBe('INVALID_STATE')
    relay.receive(phone, {
      type: 'command',
      command: command({ action: 'volume', channel: 'master', value: 8 }),
    })
    expect(phone.last('result').result.error?.code).toBe('INVALID_COMMAND')
    relay.receive(phone, { type: 'command', command: { ...command(), version: 2 } })
    expect(phone.last('result').result.error?.code).toBe('INVALID_COMMAND')
  })
})
