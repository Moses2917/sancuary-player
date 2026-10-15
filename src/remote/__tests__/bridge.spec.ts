import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useServicesStore } from '@/stores/services'
import { useLibraryStore } from '@/stores/library'
import { getFakeAudioInstances, resetFakeAudioInstances } from '@/__tests__/setup'
import { createPlaybackBridge } from '../bridge'
import { validState, type Command, type Operation } from '../protocol'
import type { Service, Song } from '@/types'

describe.each(['browser', 'tauri'])('shared player bridge (%s host)', (platform) => {
  let player: ReturnType<typeof usePlayerStore>
  let bridge: ReturnType<typeof createPlaybackBridge>
  const songs: Song[] = ['a', 'b'].map((id) => ({
    id,
    title: id,
    piano: { name: 'p', url: `/p-${id}.wav` },
    choir: { name: 'c', url: `/c-${id}.wav` },
    bundled: true,
    createdAt: 1,
    markers: [{ id: 'verse', time: 12, label: 'Verse' }],
    cuts: [{ id: 'cut', start: 20, end: 30 }],
  }))
  const service: Service = {
    id: 'svc',
    name: 'Sunday',
    createdAt: 1,
    items: songs.map((s) => ({
      id: `item-${s.id}`,
      songId: s.id,
      pianoVolume: 1,
      choirVolume: 0.5,
    })),
  }
  function cmd(operation: Operation): Command {
    return {
      version: 1,
      requestId: crypto.randomUUID(),
      context: bridge.snapshot().context,
      operation,
    }
  }
  beforeEach(async () => {
    setActivePinia(createPinia())
    resetFakeAudioInstances()
    vi.stubGlobal('requestAnimationFrame', () => 1)
    if (platform === 'tauri')
      Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} })
    player = usePlayerStore()
    const services = useServicesStore()
    const library = useLibraryStore()
    services.services = [service]
    library.songs = songs
    bridge = createPlaybackBridge(player, services, library)
    await player.load(service, songs, 0, false)
    for (const el of getFakeAudioInstances()) {
      el.duration = 120
      el.__dispatch('loadedmetadata')
    }
  })
  afterEach(() => {
    bridge.dispose()
    player.dispose()
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
  it('publishes only valid metadata, including local changes', async () => {
    expect(validState(bridge.snapshot())).toBe(true)
    await player.seek(14)
    player.setChoir(0.2)
    expect(bridge.snapshot()).toMatchObject({
      position: 14,
      choir: 0.2,
      markers: [{ id: 'verse' }],
    })
    expect(JSON.stringify(bridge.snapshot())).not.toContain('.wav')
  })
  it('dispatches transport, seeking, cuts, cues and explicit mix semantics to the store', async () => {
    // Do not spin the continuously scheduled cut RAF in the fake audio environment.
    expect((await bridge.dispatch(cmd({ action: 'play' }))).ok).toBe(true)
    expect(player.isPlaying).toBe(true)
    await bridge.dispatch(cmd({ action: 'pause' }))
    await bridge.dispatch(cmd({ action: 'seek', position: 25 }))
    expect(player.currentTime).toBe(30)
    await bridge.dispatch(cmd({ action: 'cue', markerId: 'verse' }))
    expect(player.currentTime).toBe(12)
    for (const channel of ['master', 'piano', 'choir'] as const)
      await bridge.dispatch(cmd({ action: 'volume', channel, value: 0.3 }))
    expect([player.masterVolume, player.pianoVolume, player.choirVolume]).toEqual([0.3, 0.3, 0.3])
    await bridge.dispatch(cmd({ action: 'mute', channel: 'piano', value: true }))
    await bridge.dispatch(cmd({ action: 'mute', channel: 'piano', value: true }))
    expect(player.pianoMuted).toBe(true)
    await bridge.dispatch(cmd({ action: 'solo', channel: 'choir' }))
    expect(player.choirSolo).toBe(true)
    await bridge.dispatch(cmd({ action: 'solo', channel: null }))
    expect(player.choirSolo).toBe(false)
    await bridge.dispatch(cmd({ action: 'loop', region: { start: 5, end: 15 } }))
    expect(player.loop).toEqual({ start: 5, end: 15 })
    await bridge.dispatch(cmd({ action: 'loop', region: null }))
    expect(player.loop).toBeNull()
  })
  it('loads queue selections and services paused even when the host was playing', async () => {
    await player.play()
    await bridge.dispatch(cmd({ action: 'select', itemId: 'item-b' }))
    expect(player.currentSong?.id).toBe('b')
    expect(player.isPlaying).toBe(false)
    await player.play()
    await bridge.dispatch(cmd({ action: 'service', serviceId: 'svc' }))
    expect(player.currentSong?.id).toBe('a')
    expect(player.isPlaying).toBe(false)
  })
  it('deduplicates in-flight requests, serializes actions, and rejects stale contexts at execution', async () => {
    let finish!: () => void
    const panic = vi.spyOn(player, 'panicStop').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const first = cmd({ action: 'panic' })
    const p = bridge.dispatch(first)
    const duplicate = bridge.dispatch(first)
    const stale = bridge.dispatch(cmd({ action: 'seek', position: 10 }))
    await Promise.resolve()
    expect(panic).toHaveBeenCalledTimes(1)
    expect(player.currentTime).toBe(0)
    await player.next()
    finish()
    expect(await p).toEqual(await duplicate)
    expect((await stale).error?.code).toBe('STALE_CONTEXT')
  })
  it('does not execute commands queued before revocation or disconnect', async () => {
    let allowed = true
    const stop = vi.spyOn(player, 'stop')
    const result = bridge.dispatch(cmd({ action: 'stop' }), () => allowed)
    allowed = false
    expect((await result).error?.code).toBe('REVOKED')
    expect(stop).not.toHaveBeenCalled()
  })
  it('preserves previous/next behavior and rejects an old context after returning to the same song', async () => {
    const stale = cmd({ action: 'seek', position: 8 })
    const next = cmd({ action: 'next' })
    await bridge.dispatch(next)
    await bridge.dispatch(next)
    expect(player.currentSong?.id).toBe('b')
    expect(player.isPlaying).toBe(false)
    await player.play()
    await bridge.dispatch(cmd({ action: 'previous' }))
    expect(player.currentSong?.id).toBe('a')
    expect(player.isPlaying).toBe(true)
    expect((await bridge.dispatch(stale)).error?.code).toBe('STALE_CONTEXT')
    await bridge.dispatch(cmd({ action: 'stop' }))
    expect(player.currentTime).toBe(0)
    expect(player.isPlaying).toBe(false)
  })
  it('validates identifiers, version, bounds, and structured host failures', async () => {
    for (const operation of [
      { action: 'seek', position: -1 },
      { action: 'volume', channel: 'master', value: NaN },
      { action: 'loop', region: { start: 10, end: 5 } },
      { action: 'upload' },
    ]) {
      expect((await bridge.dispatch({ ...cmd({ action: 'play' }), operation })).error?.code).toBe(
        'INVALID_COMMAND',
      )
    }
    expect((await bridge.dispatch(cmd({ action: 'seek', position: 121 }))).error?.code).toBe(
      'INVALID_POSITION',
    )
    expect((await bridge.dispatch(cmd({ action: 'select', itemId: 'missing' }))).error?.code).toBe(
      'NOT_FOUND',
    )
    for (const el of getFakeAudioInstances())
      vi.spyOn(el, 'play').mockRejectedValue(new DOMException('blocked', 'NotAllowedError'))
    expect((await bridge.dispatch(cmd({ action: 'play' }))).error?.code).toBe('PLAYBACK_BLOCKED')
    expect(player.isPlaying).toBe(false)
  })
  it('runs panic through the existing fade-and-stop action', async () => {
    const panic = vi.spyOn(player, 'panicStop').mockResolvedValue()
    expect((await bridge.dispatch(cmd({ action: 'panic' }))).ok).toBe(true)
    expect(panic).toHaveBeenCalledOnce()
  })
})
