import { watch } from 'vue'
import type { usePlayerStore } from '@/stores/player'
import type { useServicesStore } from '@/stores/services'
import type { useLibraryStore } from '@/stores/library'
import {
  COMMAND_TIMEOUT,
  record,
  validId,
  validCommand,
  type CommandResult,
  type PlaybackState,
} from './protocol'

export function createPlaybackBridge(
  player: ReturnType<typeof usePlayerStore>,
  services: ReturnType<typeof useServicesStore>,
  library: ReturnType<typeof useLibraryStore>,
) {
  let revision = 0
  const unwatch = watch(
    () => [player.queue, player.index],
    () => revision++,
    { flush: 'sync' },
  )
  const context = () => ({
    revision,
    songId: player.currentSong?.id ?? null,
    itemId: player.current?.item.id ?? null,
  })
  const text = (s: string) => s.slice(0, 1000)
  function snapshot(): PlaybackState {
    return {
      context: context(),
      service: player.service && { id: player.service.id, name: text(player.service.name) },
      song: player.currentSong && {
        id: player.currentSong.id,
        title: text(player.currentSong.title),
      },
      queue: player.queue.map(({ item, song }) => ({ id: item.id, title: text(song.title) })),
      services: services.services.map((s) => ({ id: s.id, name: text(s.name) })),
      markers: player.currentMarkers.map((m) => ({
        id: m.id,
        label: text(m.label ?? 'Cue'),
        time: m.time,
      })),
      status: player.error
        ? 'error'
        : player.isLoading
          ? 'loading'
          : player.isPlaying
            ? 'playing'
            : player.currentTime > 0
              ? 'paused'
              : 'stopped',
      isPlaying: player.isPlaying,
      error: player.error && text(player.error),
      position: player.getCurrentTime(),
      duration: player.duration,
      master: player.masterVolume,
      piano: player.pianoVolume,
      choir: player.choirVolume,
      pianoMuted: player.pianoMuted,
      choirMuted: player.choirMuted,
      solo: player.pianoSolo ? 'piano' : player.choirSolo ? 'choir' : null,
      loop: player.loop && player.loop.end > player.loop.start ? { ...player.loop } : null,
      hasNext: player.hasNext,
      hasPrev: player.hasPrev,
    }
  }

  let serial = Promise.resolve()
  const results = new Map<string, Promise<CommandResult>>()
  function dispatch(
    input: unknown,
    authorized: () => boolean = () => true,
  ): Promise<CommandResult> {
    if (!validCommand(input))
      return Promise.resolve({
        requestId: record(input) && validId(input.requestId) ? input.requestId : '',
        ok: false,
        error: { code: 'INVALID_COMMAND', message: 'Unsupported command or invalid payload.' },
      })
    const previous = results.get(input.requestId)
    if (previous) return previous
    const fail = (code: string, message: string): CommandResult => ({
      requestId: input.requestId,
      ok: false,
      error: { code, message },
    })
    // shortcut: retain 4,096 IDs per session; add an expiring replay ledger for longer sessions.
    if (results.size >= 4096)
      return Promise.resolve(
        fail('SESSION_LIMIT', 'Re-enable remote access to start a fresh command session.'),
      )
    const deadline = Date.now() + COMMAND_TIMEOUT
    const result = serial.then(async (): Promise<CommandResult> => {
      if (!authorized()) return fail('REVOKED', 'Controller is no longer connected or authorized.')
      if (Date.now() > deadline)
        return fail('TIMEOUT', 'Command expired before execution; check the player.')
      const op = input.operation
      const now = context()
      if (
        op.action !== 'panic' &&
        op.action !== 'stop' &&
        (input.context.revision !== now.revision ||
          input.context.songId !== now.songId ||
          input.context.itemId !== now.itemId)
      ) {
        return fail(
          'STALE_CONTEXT',
          'The song or queue changed. Please try again with the refreshed state.',
        )
      }
      try {
        switch (op.action) {
          case 'play':
            if (!player.currentSong) return fail('NO_SONG', 'Load a service on the player first.')
            await player.play()
            if (player.error || !player.isPlaying)
              return fail(
                'PLAYBACK_BLOCKED',
                player.error ?? 'Click Play on the host to allow audio, then try again.',
              )
            break
          case 'pause':
            player.pause()
            break
          case 'stop':
            player.stop()
            break
          case 'panic':
            await player.panicStop()
            break
          case 'previous':
            await player.prev()
            break
          case 'next':
            await player.next()
            break
          case 'seek':
            if (op.position > player.duration || !player.ready)
              return fail('INVALID_POSITION', 'Seek is outside the loaded song.')
            await player.seek(op.position)
            break
          case 'select': {
            const index = player.queue.findIndex((q) => q.item.id === op.itemId)
            if (index < 0 || !player.service)
              return fail('NOT_FOUND', 'Queue item no longer exists.')
            await player.load(
              player.service,
              player.queue.map((q) => q.song),
              index,
              false,
            )
            break
          }
          case 'service': {
            const service = services.getById(op.serviceId)
            if (!service) return fail('NOT_FOUND', 'Service no longer exists.')
            await player.load(service, library.songs, 0, false)
            break
          }
          case 'volume':
            if (op.channel === 'master') player.setMaster(op.value)
            else if (op.channel === 'piano') player.setPiano(op.value)
            else player.setChoir(op.value)
            break
          case 'mute':
            if (op.channel === 'piano' && player.pianoMuted !== op.value) player.togglePianoMute()
            if (op.channel === 'choir' && player.choirMuted !== op.value) player.toggleChoirMute()
            break
          case 'solo': {
            const solo = player.pianoSolo ? 'piano' : player.choirSolo ? 'choir' : null
            if (solo !== op.channel) {
              if (op.channel === 'piano' || (op.channel === null && solo === 'piano'))
                player.togglePianoSolo()
              else player.toggleChoirSolo()
            }
            break
          }
          case 'cue': {
            const marker = player.currentMarkers.find((m) => m.id === op.markerId)
            if (!marker || marker.time < 0 || marker.time > player.duration || !player.ready)
              return fail('NOT_FOUND', 'Cue is unavailable.')
            await player.seek(marker.time)
            break
          }
          case 'loop':
            if (op.region && (!player.ready || op.region.end > player.duration))
              return fail('INVALID_POSITION', 'Loop is outside the loaded song.')
            // The existing engine observes this same region; no second loop implementation.
            player.loop = op.region && { ...op.region }
            break
        }
        return { requestId: input.requestId, ok: true }
      } catch {
        return fail(
          'EXECUTION_FAILED',
          'The host could not complete the command. Check the player.',
        )
      }
    })
    results.set(input.requestId, result)
    serial = result.then(() => {})
    return result
  }
  return { snapshot, dispatch, dispose: unwatch }
}
