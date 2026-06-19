import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { getFakeAudioInstances, resetFakeAudioInstances } from '@/__tests__/setup'
import { makeNoiseWavFile } from '@/__tests__/helpers/audio'
import type { PlaylistItem, Service, Song } from '@/types'

function makeSong(id: string, title: string): Song {
  return {
    id,
    title,
    piano: { name: `${id}-p.wav`, blob: makeNoiseWavFile('p.wav') },
    choir: { name: `${id}-c.wav`, blob: makeNoiseWavFile('c.wav') },
    bundled: false,
    createdAt: 1,
  }
}

function makeService(items: PlaylistItem[], name = 'Service'): Service {
  return { id: 'svc_1', name, items, createdAt: 1 }
}

/** After a load(), the player creates exactly two audio elements: piano then choir. */
function grabElements() {
  const els = getFakeAudioInstances()
  expect(els.length).toBeGreaterThanOrEqual(2)
  return {
    piano: els[els.length - 2]!,
    choir: els[els.length - 1]!,
  }
}

describe('player store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetFakeAudioInstances()
  })

  it('starts with no current song', () => {
    const player = usePlayerStore()
    expect(player.currentSong).toBeNull()
    expect(player.isPlaying).toBe(false)
    expect(player.queue).toEqual([])
  })

  describe('load', () => {
    it('builds the queue and exposes the current song', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      const b = makeSong('s2', 'B')
      const svc = makeService([
        { id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 },
        { id: 'i2', songId: 's2', pianoVolume: 1, choirVolume: 1 },
      ])

      await player.load(svc, [a, b], 0, false)

      expect(player.queue.length).toBe(2)
      expect(player.index).toBe(0)
      expect(player.currentSong?.id).toBe('s1')
      expect(player.service?.id).toBe('svc_1')
    })

    it('skips items whose song is missing', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      const svc = makeService([
        { id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 },
        { id: 'i2', songId: 'gone', pianoVolume: 1, choirVolume: 1 },
      ])
      await player.load(svc, [a], 0, false)
      expect(player.queue.length).toBe(1)
      expect(player.currentSong?.id).toBe('s1')
    })

    it('sets the per-item volumes onto the player on load', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      const svc = makeService([{ id: 'i1', songId: 's1', pianoVolume: 0.4, choirVolume: 0.7 }])
      await player.load(svc, [a], 0, false)
      expect(player.pianoVolume).toBe(0.4)
      expect(player.choirVolume).toBe(0.7)
    })
  })

  describe('transport', () => {
    it('play() drives both audio elements and sets isPlaying', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      const svc = makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }])
      await player.load(svc, [a], 0, true)
      const { piano, choir } = grabElements()
      expect(piano.paused).toBe(false)
      expect(choir.paused).toBe(false)
      expect(player.isPlaying).toBe(true)
    })

    it('pause() stops both elements', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      await player.load(
        makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }]),
        [a],
        0,
        true,
      )
      player.pause()
      const { piano, choir } = grabElements()
      expect(piano.paused).toBe(true)
      expect(choir.paused).toBe(true)
      expect(player.isPlaying).toBe(false)
    })

    it('toggle() flips between play and pause', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      await player.load(
        makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }]),
        [a],
        0,
        false,
      )
      expect(player.isPlaying).toBe(false)
      player.toggle()
      await Promise.resolve()
      expect(player.isPlaying).toBe(true)
      player.toggle()
      expect(player.isPlaying).toBe(false)
    })

    it('stop() pauses and rewinds to zero', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      await player.load(
        makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }]),
        [a],
        0,
        true,
      )
      const { piano, choir } = grabElements()
      piano.currentTime = 12
      choir.currentTime = 12
      player.stop()
      expect(piano.currentTime).toBe(0)
      expect(choir.currentTime).toBe(0)
      expect(player.isPlaying).toBe(false)
    })

    it('next() advances the index and loads the next song', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      const b = makeSong('s2', 'B')
      await player.load(
        makeService([
          { id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 },
          { id: 'i2', songId: 's2', pianoVolume: 1, choirVolume: 1 },
        ]),
        [a, b],
        0,
        false,
      )
      expect(player.currentSong?.id).toBe('s1')
      await player.next()
      expect(player.currentSong?.id).toBe('s2')
      expect(player.hasNext).toBe(false)
    })

    it('next() does nothing at the end of the queue', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      await player.load(
        makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }]),
        [a],
        0,
        false,
      )
      await player.next()
      expect(player.currentSong?.id).toBe('s1')
    })

    it('prev() moves the index backwards', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      const b = makeSong('s2', 'B')
      await player.load(
        makeService([
          { id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 },
          { id: 'i2', songId: 's2', pianoVolume: 1, choirVolume: 1 },
        ]),
        [a, b],
        1,
        false,
      )
      expect(player.currentSong?.id).toBe('s2')
      await player.prev()
      expect(player.currentSong?.id).toBe('s1')
    })
  })

  describe('seek & drift', () => {
    it('seek() sets currentTime on both elements', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      await player.load(
        makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }]),
        [a],
        0,
        false,
      )
      const { piano, choir } = grabElements()
      await player.seek(42)
      expect(piano.currentTime).toBe(42)
      expect(choir.currentTime).toBe(42)
      expect(player.currentTime).toBe(42)
    })

    it('timeupdate on piano updates the exposed currentTime', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      await player.load(
        makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }]),
        [a],
        0,
        true,
      )
      const { piano } = grabElements()
      piano.currentTime = 8.5
      piano.__dispatch('timeupdate')
      expect(player.currentTime).toBeCloseTo(8.5, 1)
    })

    it('drift correction nudges choir back into sync with piano', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      await player.load(
        makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }]),
        [a],
        0,
        true,
      )
      const { piano, choir } = grabElements()
      piano.currentTime = 10
      choir.currentTime = 10.3 // 0.3s drift, above the 0.08s threshold
      piano.__dispatch('timeupdate')
      // RAF is microtask-based in tests; let it flush.
      await Promise.resolve()
      expect(choir.currentTime).toBeCloseTo(10, 5)
    })
  })

  describe('volumes & mute/solo', () => {
    it('setMaster scales both tracks', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      await player.load(
        makeService([{ id: 'i1', songId: 's1', pianoVolume: 0.8, choirVolume: 0.5 }]),
        [a],
        0,
        true,
      )
      const { piano, choir } = grabElements()
      player.setMaster(0.5)
      // effective = trackVol * master
      expect(piano.volume).toBeCloseTo(0.8 * 0.5, 5)
      expect(choir.volume).toBeCloseTo(0.5 * 0.5, 5)
    })

    it('setPiano only changes the piano element volume', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      await player.load(
        makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }]),
        [a],
        0,
        true,
      )
      const { piano, choir } = grabElements()
      player.setPiano(0.3)
      expect(piano.volume).toBeCloseTo(0.3 * player.masterVolume, 5)
      expect(choir.volume).toBeCloseTo(1 * player.masterVolume, 5)
    })

    it('togglePianoMute silences the piano track only', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      await player.load(
        makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }]),
        [a],
        0,
        true,
      )
      const { piano, choir } = grabElements()
      player.togglePianoMute()
      expect(player.pianoMuted).toBe(true)
      expect(piano.volume).toBe(0)
      expect(choir.volume).toBeGreaterThan(0)
      player.togglePianoMute()
      expect(piano.volume).toBeGreaterThan(0)
    })

    it('togglePianoSolo silences the choir track', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      await player.load(
        makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }]),
        [a],
        0,
        true,
      )
      const { piano, choir } = grabElements()
      player.togglePianoSolo()
      expect(player.pianoSolo).toBe(true)
      expect(piano.volume).toBeGreaterThan(0)
      expect(choir.volume).toBe(0)
    })

    it('choir solo turns off piano solo (mutually exclusive)', async () => {
      const player = usePlayerStore()
      player.togglePianoSolo()
      player.toggleChoirSolo()
      expect(player.pianoSolo).toBe(false)
      expect(player.choirSolo).toBe(true)
    })
  })

  describe('playSingle', () => {
    it('loads a single song as a one-item preview queue and plays it', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      player.playSingle(a)
      await Promise.resolve()
      expect(player.currentSong?.id).toBe('s1')
      expect(player.queue.length).toBe(1)
      expect(player.isPlaying).toBe(true)
      expect(player.service?.id).toBe('preview')
    })
  })

  describe('auto-advance on end', () => {
    it('advances to the next track when both elements end', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      const b = makeSong('s2', 'B')
      await player.load(
        makeService([
          { id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 },
          { id: 'i2', songId: 's2', pianoVolume: 1, choirVolume: 1 },
        ]),
        [a, b],
        0,
        true,
      )
      expect(player.currentSong?.id).toBe('s1')
      const { piano, choir } = grabElements()
      piano.ended = true
      choir.ended = true
      piano.__dispatch('ended')
      choir.__dispatch('ended')
      // The store debounces the ended check with a short setTimeout.
      await new Promise((r) => setTimeout(r, 200))
      expect(player.currentSong?.id).toBe('s2')
    })
  })

  describe('A↔B loop', () => {
    it('is null until set', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      await player.load(
        makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }]),
        [a],
        0,
        false,
      )
      expect(player.loop).toBeNull()
    })

    it('setLoopStart/setLoopEnd anchor A and B to the playhead', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      await player.load(
        makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }]),
        [a],
        0,
        false,
      )
      const { piano } = grabElements()
      piano.currentTime = 5
      piano.__dispatch('timeupdate')
      player.setLoopStart()
      expect(player.loop?.start).toBe(5)

      piano.currentTime = 12
      piano.__dispatch('timeupdate')
      player.setLoopEnd()
      expect(player.loop).toEqual({ start: 5, end: 12 })
    })

    it('toggleLoop flips between enabled and disabled', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      await player.load(
        makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }]),
        [a],
        0,
        false,
      )
      player.duration = 30
      player.toggleLoop()
      expect(player.loop).not.toBeNull()
      player.toggleLoop()
      expect(player.loop).toBeNull()
    })

    it('timeupdate past the loop end seeks back to the loop start', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      await player.load(
        makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }]),
        [a],
        0,
        true,
      )
      const { piano, choir } = grabElements()

      // Build the loop directly on the exposed currentTime so onTimeUpdate's
      // enforcement doesn't fire mid-setup.
      player.setLoopStart() // A=0
      player.currentTime = 4
      player.setLoopEnd() // B=4
      expect(player.loop).toEqual({ start: 0, end: 4 })

      // Step past B: the store should rewind both elements to the loop start.
      piano.currentTime = 4.5
      choir.currentTime = 4.5
      piano.__dispatch('timeupdate')
      expect(piano.currentTime).toBeCloseTo(player.loop!.start, 5)
      expect(choir.currentTime).toBeCloseTo(player.loop!.start, 5)
    })
  })
})
