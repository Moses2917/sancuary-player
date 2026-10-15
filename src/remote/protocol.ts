export const VERSION = 1
export const CODE_TTL = 5 * 60_000
export const RESUME_WINDOW = 2 * 60_000
export const COMMAND_TIMEOUT = 10_000

export interface PlaybackContext {
  revision: number
  songId: string | null
  itemId: string | null
}
export type Operation =
  | { action: 'play' | 'pause' | 'stop' | 'previous' | 'next' | 'panic' }
  | { action: 'seek'; position: number }
  | { action: 'select'; itemId: string }
  | { action: 'service'; serviceId: string }
  | { action: 'volume'; channel: 'master' | 'piano' | 'choir'; value: number }
  | { action: 'mute'; channel: 'piano' | 'choir'; value: boolean }
  | { action: 'solo'; channel: 'piano' | 'choir' | null }
  | { action: 'cue'; markerId: string }
  | { action: 'loop'; region: { start: number; end: number } | null }

export interface Command {
  version: typeof VERSION
  requestId: string
  context: PlaybackContext
  operation: Operation
}
export interface CommandResult {
  requestId: string
  ok: boolean
  error?: { code: string; message: string }
}
export interface PlaybackState {
  context: PlaybackContext
  service: { id: string; name: string } | null
  song: { id: string; title: string } | null
  queue: { id: string; title: string }[]
  services: { id: string; name: string }[]
  markers: { id: string; label: string; time: number }[]
  status: 'playing' | 'paused' | 'stopped' | 'loading' | 'error'
  isPlaying: boolean
  error: string | null
  position: number
  duration: number
  master: number
  piano: number
  choir: number
  pianoMuted: boolean
  choirMuted: boolean
  solo: 'piano' | 'choir' | null
  loop: { start: number; end: number } | null
  hasNext: boolean
  hasPrev: boolean
}

export type ClientMessage =
  | { type: 'create'; version: number; token: string }
  | { type: 'resume'; version: number; role: 'host' | 'controller'; token: string }
  | { type: 'pair'; version: number; code: string; name: string }
  | { type: 'approval'; id: string; approve: boolean }
  | { type: 'regenerate' | 'revoke' | 'disable' | 'sync' | 'ping' }
  | { type: 'state'; state: PlaybackState }
  | { type: 'command'; command: Command }
  | { type: 'result'; controllerId: string; result: CommandResult }

export type ServerMessage =
  | { type: 'host'; code: string; expiresAt: number }
  | { type: 'approval'; id: string; name: string; expiresAt: number }
  | { type: 'waiting' }
  | { type: 'paired'; token: string }
  | { type: 'controller'; id: string; name: string; online: boolean }
  | { type: 'resumed' | 'sync' | 'pong' }
  | { type: 'state'; state: PlaybackState }
  | { type: 'command'; controllerId: string; command: Command }
  | { type: 'result'; result: CommandResult }
  | { type: 'offline' | 'revoked' }
  | { type: 'error'; code: string; message: string }

export function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
export const validId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)
const position = (value: unknown): value is number => finite(value) && value >= 0
const volume = (value: unknown): value is number => finite(value) && value >= 0 && value <= 1
const stem = (value: unknown) => value === 'piano' || value === 'choir'
const region = (value: unknown) =>
  value === null ||
  (record(value) && position(value.start) && position(value.end) && value.end > value.start)

export function validContext(value: unknown): value is PlaybackContext {
  return (
    record(value) &&
    Number.isSafeInteger(value.revision) &&
    Number(value.revision) >= 0 &&
    (value.songId === null || validId(value.songId)) &&
    (value.itemId === null || validId(value.itemId))
  )
}

export function validCommand(value: unknown): value is Command {
  if (
    !record(value) ||
    value.version !== VERSION ||
    !validId(value.requestId) ||
    !validContext(value.context) ||
    !record(value.operation)
  )
    return false
  if (
    Object.keys(value).some((k) => !['version', 'requestId', 'context', 'operation'].includes(k)) ||
    Object.keys(value.context).some((k) => !['revision', 'songId', 'itemId'].includes(k))
  )
    return false
  const op = value.operation
  const only = (...keys: string[]) =>
    Object.keys(op).every((k) => k === 'action' || keys.includes(k))
  switch (op.action) {
    case 'play':
    case 'pause':
    case 'stop':
    case 'previous':
    case 'next':
    case 'panic':
      return only()
    case 'seek':
      return only('position') && position(op.position)
    case 'select':
      return only('itemId') && validId(op.itemId)
    case 'service':
      return only('serviceId') && validId(op.serviceId)
    case 'volume':
      return (
        only('channel', 'value') &&
        (op.channel === 'master' || stem(op.channel)) &&
        volume(op.value)
      )
    case 'mute':
      return only('channel', 'value') && stem(op.channel) && typeof op.value === 'boolean'
    case 'solo':
      return only('channel') && (op.channel === null || stem(op.channel))
    case 'cue':
      return only('markerId') && validId(op.markerId)
    case 'loop':
      return (
        only('region') &&
        region(op.region) &&
        (op.region === null ||
          Object.keys(op.region as object).every((k) => ['start', 'end'].includes(k)))
      )
    default:
      return false
  }
}

// Validate metadata at the relay boundary; never forward track sources or arbitrary objects.
export function validState(value: unknown): value is PlaybackState {
  if (!record(value) || !validContext(value.context)) return false
  const text = (v: unknown) => typeof v === 'string' && v.length <= 1000
  const rows = (v: unknown, field: string) =>
    Array.isArray(v) &&
    v.length <= 5000 &&
    v.every(
      (r) =>
        record(r) &&
        validId(r.id) &&
        text(r[field]) &&
        Object.keys(r).every((k) =>
          ['id', field, ...(field === 'label' ? ['time'] : [])].includes(k),
        ),
    )
  const named = (v: unknown, field: string) => v === null || rows([v], field)
  const keys = [
    'context',
    'service',
    'song',
    'queue',
    'services',
    'markers',
    'status',
    'isPlaying',
    'error',
    'position',
    'duration',
    'master',
    'piano',
    'choir',
    'pianoMuted',
    'choirMuted',
    'solo',
    'loop',
    'hasNext',
    'hasPrev',
  ]
  return (
    Object.keys(value).every((k) => keys.includes(k)) &&
    Object.keys(value.context as object).every((k) =>
      ['revision', 'songId', 'itemId'].includes(k),
    ) &&
    named(value.service, 'name') &&
    named(value.song, 'title') &&
    rows(value.queue, 'title') &&
    rows(value.services, 'name') &&
    rows(value.markers, 'label') &&
    (value.markers as Record<string, unknown>[]).every((m) => position(m.time)) &&
    ['playing', 'paused', 'stopped', 'loading', 'error'].includes(String(value.status)) &&
    typeof value.isPlaying === 'boolean' &&
    (value.error === null || text(value.error)) &&
    position(value.position) &&
    position(value.duration) &&
    volume(value.master) &&
    volume(value.piano) &&
    volume(value.choir) &&
    typeof value.pianoMuted === 'boolean' &&
    typeof value.choirMuted === 'boolean' &&
    (value.solo === null || stem(value.solo)) &&
    region(value.loop) &&
    (value.loop === null ||
      Object.keys(value.loop as object).every((k) => ['start', 'end'].includes(k))) &&
    typeof value.hasNext === 'boolean' &&
    typeof value.hasPrev === 'boolean'
  )
}
