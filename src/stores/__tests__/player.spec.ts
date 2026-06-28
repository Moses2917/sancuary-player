import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useLibraryStore } from '@/stores/library'
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

  describe('cue markers', () => {
    it('addMarkerHere persists a marker at the playhead on the current song', async () => {
      const player = usePlayerStore()
      const library = useLibraryStore()
      await library.init()
      const song = await library.addSong({
        title: 'Cued',
        piano: makeNoiseWavFile('p.wav'),
        choir: makeNoiseWavFile('c.wav'),
      })
      await player.load(
        makeService([{ id: 'i1', songId: song.id, pianoVolume: 1, choirVolume: 0.5 }]),
        [library.getById(song.id)!],
        0,
        false,
      )
      const { piano } = grabElements()
      piano.currentTime = 12
      piano.__dispatch('timeupdate')
      await player.addMarkerHere('Verse')
      expect(player.currentMarkers.length).toBe(1)
      expect(player.currentMarkers[0]?.time).toBe(12)
      expect(player.currentMarkers[0]?.label).toBe('Verse')
    })

    it('addMarkerAt places a cue at an arbitrary time regardless of playhead', async () => {
      const player = usePlayerStore()
      const library = useLibraryStore()
      await library.init()
      const song = await library.addSong({
        title: 'Cued',
        piano: makeNoiseWavFile('p.wav'),
        choir: makeNoiseWavFile('c.wav'),
      })
      await player.load(
        makeService([{ id: 'i1', songId: song.id, pianoVolume: 1, choirVolume: 0.5 }]),
        [library.getById(song.id)!],
        0,
        false,
      )
      const { piano } = grabElements()
      piano.currentTime = 5
      piano.__dispatch('timeupdate')
      await player.addMarkerAt(42, 'Outro')
      expect(player.currentMarkers[0]?.time).toBe(42)
      expect(player.currentMarkers[0]?.label).toBe('Outro')
    })
  })

  describe('fade regions', () => {
    it('addFadeHere creates a fade starting at the playhead', async () => {
      const player = usePlayerStore()
      const library = useLibraryStore()
      await library.init()
      const song = await library.addSong({
        title: 'Faded',
        piano: makeNoiseWavFile('p.wav'),
        choir: makeNoiseWavFile('c.wav'),
      })
      await player.load(
        makeService([{ id: 'i1', songId: song.id, pianoVolume: 1, choirVolume: 0.5 }]),
        [library.getById(song.id)!],
        0,
        false,
      )
      const { piano } = grabElements()
      player.duration = 100
      piano.currentTime = 80
      piano.__dispatch('timeupdate')
      await player.addFadeHere(8)
      expect(player.currentFades.length).toBe(1)
      expect(player.currentFades[0]?.start).toBe(80)
      expect(player.currentFades[0]?.end).toBe(88)
    })

    it('fade multiplier scales the effective volume as playback crosses the region', async () => {
      const player = usePlayerStore()
      const library = useLibraryStore()
      await library.init()
      const song = await library.addSong({
        title: 'Faded',
        piano: makeNoiseWavFile('p.wav'),
        choir: makeNoiseWavFile('c.wav'),
      })
      await player.load(
        makeService([{ id: 'i1', songId: song.id, pianoVolume: 1, choirVolume: 0.5 }]),
        [library.getById(song.id)!],
        0,
        true,
      )
      const { piano } = grabElements()
      player.duration = 100
      piano.currentTime = 90
      piano.__dispatch('timeupdate') // outside fade → multiplier 1
      // Add a fade 90→100, then move inside it.
      await player.addFadeHere(10)
      expect(player.currentFades[0]).toMatchObject({ start: 90, end: 100 })
      piano.currentTime = 95
      piano.__dispatch('timeupdate') // halfway through fade → ~0.5 multiplier
      // The actual element volume = pianoVol(1) * master(0.9) * fade(0.5) = 0.45
      expect(piano.volume).toBeCloseTo(0.45, 2)
    })
  })

  describe('solo refactor', () => {
    it('piano solo silences choir; choir solo turns piano solo off', async () => {
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
      expect(player.choirSolo).toBe(false)
      expect(piano.volume).toBeGreaterThan(0)
      expect(choir.volume).toBe(0)

      player.toggleChoirSolo()
      expect(player.pianoSolo).toBe(false)
      expect(player.choirSolo).toBe(true)
      expect(piano.volume).toBe(0)
      expect(choir.volume).toBeGreaterThan(0)
    })

    it('toggling the same solo twice clears it', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      await player.load(
        makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }]),
        [a],
        0,
        false,
      )
      player.togglePianoSolo()
      expect(player.pianoSolo).toBe(true)
      player.togglePianoSolo()
      expect(player.pianoSolo).toBe(false)
      expect(player.choirSolo).toBe(false)
    })
  })

  describe('muteAll', () => {
    it('mutes both tracks together', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      await player.load(
        makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }]),
        [a],
        0,
        true,
      )
      const { piano, choir } = grabElements()
      player.muteAll()
      expect(player.pianoMuted).toBe(true)
      expect(player.choirMuted).toBe(true)
      expect(piano.volume).toBe(0)
      expect(choir.volume).toBe(0)
    })
  })

  describe('panicStop', () => {
    it('pauses and rewinds both elements to zero', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      await player.load(
        makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }]),
        [a],
        0,
        true,
      )
      const { piano, choir } = grabElements()
      piano.currentTime = 30
      choir.currentTime = 30
      await player.panicStop()
      expect(piano.paused).toBe(true)
      expect(choir.paused).toBe(true)
      expect(piano.currentTime).toBe(0)
      expect(choir.currentTime).toBe(0)
      expect(player.isPlaying).toBe(false)
      // fade multiplier is restored so subsequent playback isn't silent.
      expect(player.fadeMultiplier).toBe(1)
    })
  })

  describe('audio output routing', () => {
    // Pretend the browser supports setSinkId by attaching it to the prototype.
    const proto = HTMLMediaElement.prototype as unknown as Record<string, unknown>
    const sinkCalls: string[] = []
    let hadSetSinkId: unknown

    beforeEach(() => {
      hadSetSinkId = proto.setSinkId
      sinkCalls.length = 0
      proto.setSinkId = function (this: { sinkId?: string }, id: string) {
        this.sinkId = id
        sinkCalls.push(id)
        return Promise.resolve()
      }
    })
    afterEach(() => {
      if (hadSetSinkId === undefined) delete proto.setSinkId
      else proto.setSinkId = hadSetSinkId
    })

    it('setPianoSink routes the piano element only', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      await player.load(
        makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }]),
        [a],
        0,
        false,
      )
      const { piano, choir } = grabElements()
      await player.setPianoSink('sink-piano')
      expect(piano.sinkId).toBe('sink-piano')
      expect(choir.sinkId).toBe('')
    })

    it('setChoirSink routes the choir element only', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      await player.load(
        makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }]),
        [a],
        0,
        false,
      )
      const { piano, choir } = grabElements()
      await player.setChoirSink('sink-choir')
      expect(choir.sinkId).toBe('sink-choir')
      expect(piano.sinkId).toBe('')
    })

    it('defaults both tracks to the same (empty) sink', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      await player.load(
        makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }]),
        [a],
        0,
        false,
      )
      expect(player.pianoSinkId).toBe('')
      expect(player.choirSinkId).toBe('')
    })
  })

  describe('resume position', () => {
    it('does not restore position when disabled', async () => {
      const player = usePlayerStore()
      const library = useLibraryStore()
      await library.init()
      const song = await library.addSong({
        title: 'Resumable',
        piano: makeNoiseWavFile('p.wav'),
        choir: makeNoiseWavFile('c.wav'),
      })
      // Pre-seed a saved position.
      await library.updateSong(song.id, { position: 42 })
      player.setResumePosition(false)
      await player.load(
        makeService([{ id: 'i1', songId: song.id, pianoVolume: 1, choirVolume: 1 }]),
        [library.getById(song.id)!],
        0,
        false,
      )
      expect(player.currentTime).toBe(0)
    })

    it('restores the saved position when enabled', async () => {
      const player = usePlayerStore()
      const library = useLibraryStore()
      await library.init()
      const song = await library.addSong({
        title: 'Resumable',
        piano: makeNoiseWavFile('p.wav'),
        choir: makeNoiseWavFile('c.wav'),
      })
      await library.updateSong(song.id, { position: 42 })
      player.setResumePosition(true)
      await player.load(
        makeService([{ id: 'i1', songId: song.id, pianoVolume: 1, choirVolume: 1 }]),
        [library.getById(song.id)!],
        0,
        false,
      )
      const { piano } = grabElements()
      expect(player.currentTime).toBeCloseTo(42, 5)
      expect(piano.currentTime).toBeCloseTo(42, 5)
    })
  })

  describe('error reporting', () => {
    it('exposes and clears errors', async () => {
      const player = usePlayerStore()
      expect(player.error).toBeNull()
      player.setError('boom')
      expect(player.error).toBe('boom')
      player.clearError()
      expect(player.error).toBeNull()
    })

    it('reports a blocked play() as a user-facing error', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      await player.load(
        makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }]),
        [a],
        0,
        false,
      )
      const { piano, choir } = grabElements()
      // Force both play() calls to reject, simulating a blocked autoplay.
      const pianoPlay = piano.play.bind(piano)
      const choirPlay = choir.play.bind(choir)
      piano.play = () => Promise.reject(new DOMException('blocked', 'NotAllowedError'))
      choir.play = () => Promise.reject(new DOMException('blocked', 'NotAllowedError'))
      try {
        await player.play()
        expect(player.error).toContain('blocked')
        expect(player.isPlaying).toBe(false)
      } finally {
        piano.play = pianoPlay
        choir.play = choirPlay
      }
    })

    it('reports a partial failure when only one track rejects', async () => {
      const player = usePlayerStore()
      const a = makeSong('s1', 'A')
      await player.load(
        makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }]),
        [a],
        0,
        false,
      )
      const { piano } = grabElements()
      const pianoPlay = piano.play.bind(piano)
      piano.play = () => Promise.reject(new DOMException('blocked', 'NotAllowedError'))
      try {
        await player.play()
        // Choir still started, so the player reflects that.
        expect(player.isPlaying).toBe(true)
        expect(player.error).toContain('One of the tracks failed')
      } finally {
        piano.play = pianoPlay
      }
    })
  })

  describe('cut regions', () => {
    // The dip engine reschedules itself on rAF every frame while playing.
    // The default test shim auto-flushes each rAF as a microtask, which would
    // spin forever. Swap in a manual stepper so we advance frame-by-frame.
    const pendingFrames: FrameRequestCallback[] = []
    let origRAF: typeof requestAnimationFrame
    let origCancel: typeof cancelAnimationFrame

    beforeEach(() => {
      pendingFrames.length = 0
      origRAF = globalThis.requestAnimationFrame
      origCancel = globalThis.cancelAnimationFrame
      globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
        pendingFrames.push(cb)
        return pendingFrames.length
      }) as typeof requestAnimationFrame
      globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame
    })
    afterEach(() => {
      globalThis.requestAnimationFrame = origRAF
      globalThis.cancelAnimationFrame = origCancel
      pendingFrames.length = 0
    })

    /** Run only the frames queued so far (reschedules wait for the next call). */
    const flushFrames = () => {
      const batch = pendingFrames.splice(0)
      for (const cb of batch) cb(performance.now())
    }

    async function loadWithCut(cut: { start: number; end: number; fadeMs?: number; curve?: 'linear' | 'equalPower' | 'ease' | 'fast' }, autoplay = false) {
      const player = usePlayerStore()
      const library = useLibraryStore()
      await library.init()
      const song = await library.addSong({
        title: 'Cut',
        piano: makeNoiseWavFile('p.wav'),
        choir: makeNoiseWavFile('c.wav'),
      })
      await library.addCut(song.id, cut)
      await player.load(
        makeService([{ id: 'i1', songId: song.id, pianoVolume: 1, choirVolume: 1 }]),
        [library.getById(song.id)!],
        0,
        autoplay,
      )
      player.duration = 100
      return player
    }

    it('addCutHere creates a cut at the playhead with the default smoothing', async () => {
      const player = usePlayerStore()
      const library = useLibraryStore()
      await library.init()
      const song = await library.addSong({
        title: 'Cut',
        piano: makeNoiseWavFile('p.wav'),
        choir: makeNoiseWavFile('c.wav'),
      })
      await player.load(
        makeService([{ id: 'i1', songId: song.id, pianoVolume: 1, choirVolume: 1 }]),
        [library.getById(song.id)!],
        0,
        false,
      )
      const { piano } = grabElements()
      player.duration = 100
      piano.currentTime = 20
      piano.__dispatch('timeupdate')
      await player.addCutHere(16)
      expect(player.currentCuts.length).toBe(1)
      expect(player.currentCuts[0]).toMatchObject({ start: 20, end: 36 })
      expect(player.currentCuts[0]?.curve).toBe('equalPower')
      expect(player.currentCuts[0]?.fadeMs).toBe(120)
    })

    it('updateCut and removeCut mutate the current song', async () => {
      const player = await loadWithCut({ start: 10, end: 20 })
      const id = player.currentCuts[0]!.id
      await player.updateCut(id, { curve: 'linear', fadeMs: 0 })
      expect(player.currentCuts[0]).toMatchObject({ curve: 'linear', fadeMs: 0 })
      await player.removeCut(id)
      expect(player.currentCuts.length).toBe(0)
    })

    it('seek() into a cut snaps to its end; seeking to the end is allowed', async () => {
      const player = await loadWithCut({ start: 10, end: 20 })
      const { piano } = grabElements()
      await player.seek(15) // inside the removed span
      expect(player.currentTime).toBeCloseTo(20, 5)
      expect(piano.currentTime).toBeCloseTo(20, 5)
      await player.seek(20) // boundary stays put
      expect(player.currentTime).toBe(20)
      await player.seek(5) // before the cut is untouched
      expect(player.currentTime).toBe(5)
    })

    it('ducks and jumps to the cut end when the playhead enters a cut', async () => {
      const player = await loadWithCut({ start: 10, end: 20, fadeMs: 120 })
      await player.play()
      // Let the isPlaying watch fire and queue the dip engine's first frame.
      await new Promise((r) => setTimeout(r, 0))
      const { piano } = grabElements()
      piano.currentTime = 15 // landed inside the cut
      flushFrames()
      expect(piano.currentTime).toBeCloseTo(20, 5)
      expect(player.cutMultiplier).toBe(0)
    })

    it('ramps the volume down as the playhead approaches a cut (equal-power)', async () => {
      const player = await loadWithCut({ start: 10, end: 20, fadeMs: 120 })
      await player.play()
      await new Promise((r) => setTimeout(r, 0))
      const { piano } = grabElements()
      // Halfway through the 120ms approach window [9.88, 10] → ~0.707 gain.
      piano.currentTime = 9.94
      flushFrames()
      expect(player.cutMultiplier).toBeGreaterThan(0.6)
      expect(player.cutMultiplier).toBeLessThan(0.8)
      // Effective element volume = piano(1) * master(0.9) * cut(0.707) ≈ 0.64
      expect(piano.volume).toBeGreaterThan(0.55)
      expect(piano.volume).toBeLessThan(0.7)
    })

    it('returns to full volume after a hard cut lands', async () => {
      const player = await loadWithCut({ start: 10, end: 20, fadeMs: 0 })
      await player.play()
      await new Promise((r) => setTimeout(r, 0))
      const { piano } = grabElements()
      piano.currentTime = 15
      flushFrames() // jump frame: duck to 0
      expect(player.cutMultiplier).toBe(0)
      flushFrames() // with no fade, the fade-in completes immediately
      expect(player.cutMultiplier).toBe(1)
      expect(piano.currentTime).toBeCloseTo(20, 5)
    })
  })
})
