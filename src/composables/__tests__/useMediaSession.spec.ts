import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useMediaSession } from '@/composables/useMediaSession'
import { usePlayerStore } from '@/stores/player'
import { useLibraryStore } from '@/stores/library'
import { resetFakeAudioInstances } from '@/__tests__/setup'
import { makeNoiseWavFile } from '@/__tests__/helpers/audio'
import * as idb from '@/db/sqlite'

interface StubMediaSession {
  metadata: MediaMetadata | null
  playbackState: MediaSessionPlaybackState
  setActionHandler: (action: string, handler: (() => void) | null) => void
  setPositionState: (state: { duration: number; position: number; playbackRate: number }) => void
}

function installStubMediaSession() {
  const calls: string[] = []
  const handlers = new Map<string, () => void>()
  const stub: StubMediaSession & { __calls: string[]; __fire: (action: string) => void } = {
    metadata: null,
    playbackState: 'none',
    __calls: calls,
    setActionHandler: (action, handler) => {
      calls.push(`setActionHandler:${action}`)
      if (handler) handlers.set(action, handler)
      else handlers.delete(action)
    },
    setPositionState: (state) => {
      calls.push(`setPositionState:${Math.round(state.position)}`)
    },
    __fire: (action) => handlers.get(action)?.(),
  }
  Object.defineProperty(navigator, 'mediaSession', {
    configurable: true,
    value: stub,
  })
  // jsdom doesn't ship MediaMetadata by default — provide a tiny stub.
  ;(globalThis as unknown as { MediaMetadata: typeof MediaMetadata }).MediaMetadata = class {
    title: string
    artist: string
    album: string
    constructor(init: { title?: string; artist?: string; album?: string }) {
      this.title = init.title ?? ''
      this.artist = init.artist ?? ''
      this.album = init.album ?? ''
    }
  } as unknown as typeof MediaMetadata
  return stub
}

describe('useMediaSession', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    resetFakeAudioInstances()
    const db = await idb.getDB()
    await Promise.all([db.clear('songs'), db.clear('services')])
  })

  afterEach(() => {
    // Clean up so other test files don't see our stubs.
    Object.defineProperty(navigator, 'mediaSession', {
      configurable: true,
      value: undefined,
    })
    delete (globalThis as { MediaMetadata?: unknown }).MediaMetadata
    vi.useRealTimers()
  })

  it('installs action handlers on mount and updates metadata when a song loads', async () => {
    const stub = installStubMediaSession()

    const library = useLibraryStore()
    await library.init()
    const song = await library.addSong({
      title: 'Amazing Grace',
      piano: makeNoiseWavFile('p.wav'),
      choir: makeNoiseWavFile('c.wav'),
    })

    // Mount via a real host component so onMounted/onUnmounted fire correctly.
    const Host = defineComponent({
      setup() {
        useMediaSession()
        return () => h('div')
      },
    })
    const wrapper = mount(Host)
    await flushPromises()

    const player = usePlayerStore()
    player.playSingle(song)
    await flushPromises()

    expect(stub.metadata?.title).toBe('Amazing Grace')
    expect(stub.playbackState).toBe('playing')
    expect(stub.__calls).toContain('setActionHandler:play')
    expect(stub.__calls).toContain('setActionHandler:pause')
    expect(stub.__calls).toContain('setActionHandler:seekto')

    // Fire a media-session action and confirm it routes to the player.
    stub.__fire('pause')
    await flushPromises()
    expect(player.isPlaying).toBe(false)
    expect(stub.playbackState).toBe('paused')

    wrapper.unmount()
  })

  it('no-ops gracefully when MediaSession is unavailable', async () => {
    Object.defineProperty(navigator, 'mediaSession', {
      configurable: true,
      value: undefined,
    })
    // Should not throw.
    const Host = defineComponent({
      setup() {
        useMediaSession()
        return () => h('div')
      },
    })
    const wrapper = mount(Host)
    await flushPromises()
    wrapper.unmount()
    expect(true).toBe(true)
  })
})
