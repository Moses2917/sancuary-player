import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLibraryStore } from '@/stores/library'
import { makeNoiseWavFile } from '@/__tests__/helpers/audio'
import * as idb from '@/db/sqlite'

describe('library store', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    const db = await idb.getDB()
    await db.clear('songs')
  })

  it('starts empty and unready', () => {
    const lib = useLibraryStore()
    expect(lib.songs).toEqual([])
    expect(lib.ready).toBe(false)
  })

  it('init() is idempotent', async () => {
    const lib = useLibraryStore()
    await lib.init()
    const first = lib.ready
    await lib.init()
    expect(lib.ready).toBe(first)
  })

  it('adds a song with derived title and stores the blobs', async () => {
    const lib = useLibraryStore()
    await lib.init()
    const piano = makeNoiseWavFile('amazing-grace-piano.wav', { seconds: 1 })
    const choir = makeNoiseWavFile('amazing-grace-choir.wav', { seconds: 1 })

    const song = await lib.addSong({ title: 'Amazing Grace', piano, choir })

    expect(song.title).toBe('Amazing Grace')
    expect(song.bundled).toBe(false)
    expect(song.piano.blob).toBeInstanceOf(Blob)
    expect(song.piano.name).toBe('amazing-grace-piano.wav')
    expect(lib.songs.length).toBe(1)
    expect(lib.songs[0]?.id).toBe(song.id)
  })

  it('falls back to the piano filename when title is blank', async () => {
    const lib = useLibraryStore()
    await lib.init()
    const song = await lib.addSong({
      title: '   ',
      piano: makeNoiseWavFile('Holy Holy Holy.mp3'),
      choir: makeNoiseWavFile('choir.wav'),
    })
    expect(song.title).toBe('Holy Holy Holy')
  })

  it('getById finds an existing song', async () => {
    const lib = useLibraryStore()
    await lib.init()
    const added = await lib.addSong({
      title: 'X',
      piano: makeNoiseWavFile('p.wav'),
      choir: makeNoiseWavFile('c.wav'),
    })
    expect(lib.getById(added.id)?.title).toBe('X')
    expect(lib.getById('missing')).toBeUndefined()
  })

  it('removes a song from the store', async () => {
    const lib = useLibraryStore()
    await lib.init()
    const added = await lib.addSong({
      title: 'X',
      piano: makeNoiseWavFile('p.wav'),
      choir: makeNoiseWavFile('c.wav'),
    })
    await lib.removeSong(added.id)
    expect(lib.songs.length).toBe(0)
    expect(lib.getById(added.id)).toBeUndefined()
  })

  it('persists across a fresh store instance (storage round-trip)', async () => {
    const lib1 = useLibraryStore()
    await lib1.init()
    await lib1.addSong({
      title: 'Persisted',
      piano: makeNoiseWavFile('p.wav'),
      choir: makeNoiseWavFile('c.wav'),
    })

    // Simulate a reload: new pinia, new store, init reads from storage.
    setActivePinia(createPinia())
    const lib2 = useLibraryStore()
    await lib2.init()
    expect(lib2.songs.length).toBe(1)
    expect(lib2.songs[0]?.title).toBe('Persisted')
  })

  it('addBundledSongs registers url-backed songs flagged bundled', async () => {
    const lib = useLibraryStore()
    await lib.init()
    const created = await lib.addBundledSongs([
      {
        title: 'Example Hymn',
        pianoUrl: '/audio/example-piano.mp3',
        choirUrl: '/audio/example-choir.mp3',
      },
    ])
    expect(created.length).toBe(1)
    expect(lib.songs[0]?.bundled).toBe(true)
    expect(lib.songs[0]?.piano.url).toBe('/audio/example-piano.mp3')
    expect(lib.songs[0]?.piano.blob).toBeUndefined()
  })

  it('stores the optional tag when provided', async () => {
    const lib = useLibraryStore()
    await lib.init()
    const song = await lib.addSong({
      title: 'Brand New Hymn',
      piano: makeNoiseWavFile('p.wav'),
      choir: makeNoiseWavFile('c.wav'),
      tag: 'new',
    })
    expect(song.tag).toBe('new')
    expect(lib.songs[0]?.tag).toBe('new')
  })

  it('omits tag when not provided so old library entries keep working', async () => {
    const lib = useLibraryStore()
    await lib.init()
    const song = await lib.addSong({
      title: 'Untitled',
      piano: makeNoiseWavFile('p.wav'),
      choir: makeNoiseWavFile('c.wav'),
    })
    expect(song.tag).toBeUndefined()
  })

  it('addMarker stores a sorted marker list on the song', async () => {
    const lib = useLibraryStore()
    await lib.init()
    const song = await lib.addSong({
      title: 'X',
      piano: makeNoiseWavFile('p.wav'),
      choir: makeNoiseWavFile('c.wav'),
    })
    await lib.addMarker(song.id, 20, 'Verse')
    await lib.addMarker(song.id, 5, 'Intro')
    const stored = lib.getById(song.id)
    expect(stored?.markers?.length).toBe(2)
    expect(stored?.markers?.[0]?.label).toBe('Intro')
    expect(stored?.markers?.[1]?.label).toBe('Verse')
  })

  it('removeMarker drops the matching entry', async () => {
    const lib = useLibraryStore()
    await lib.init()
    const song = await lib.addSong({
      title: 'X',
      piano: makeNoiseWavFile('p.wav'),
      choir: makeNoiseWavFile('c.wav'),
    })
    const updated = await lib.addMarker(song.id, 5, 'Intro')
    const markerId = updated?.markers?.[0]?.id
    expect(markerId).toBeTruthy()
    await lib.removeMarker(song.id, markerId!)
    expect(lib.getById(song.id)?.markers ?? []).toEqual([])
  })

  it('updateSong patches title/tag/markers and persists', async () => {
    const lib = useLibraryStore()
    await lib.init()
    const song = await lib.addSong({
      title: 'Old',
      piano: makeNoiseWavFile('p.wav'),
      choir: makeNoiseWavFile('c.wav'),
    })
    const next = await lib.updateSong(song.id, { title: 'New', tag: 'old' })
    expect(next?.title).toBe('New')
    expect(next?.tag).toBe('old')
    expect(lib.getById(song.id)?.title).toBe('New')
  })

  it('addFade stores a fade region and removeFade drops it', async () => {
    const lib = useLibraryStore()
    await lib.init()
    const song = await lib.addSong({
      title: 'X',
      piano: makeNoiseWavFile('p.wav'),
      choir: makeNoiseWavFile('c.wav'),
    })
    const fade = await lib.addFade(song.id, { start: 10, end: 20, toVolume: 0 })
    expect(fade?.id).toBeTruthy()
    expect(lib.getById(song.id)?.fades?.length).toBe(1)
    expect(lib.getById(song.id)?.fades?.[0]?.start).toBe(10)

    // Update the region bounds
    await lib.updateFade(song.id, fade!.id, { start: 12 })
    expect(lib.getById(song.id)?.fades?.[0]?.start).toBe(12)

    // Remove it
    await lib.removeFade(song.id, fade!.id)
    expect(lib.getById(song.id)?.fades ?? []).toEqual([])
  })

  it('addCut stores a cut region, updateCut patches it, removeCut drops it', async () => {
    const lib = useLibraryStore()
    await lib.init()
    const song = await lib.addSong({
      title: 'X',
      piano: makeNoiseWavFile('p.wav'),
      choir: makeNoiseWavFile('c.wav'),
    })
    const cut = await lib.addCut(song.id, { start: 30, end: 50 })
    expect(cut?.id).toBeTruthy()
    expect(lib.getById(song.id)?.cuts?.length).toBe(1)
    expect(lib.getById(song.id)?.cuts?.[0]).toMatchObject({ start: 30, end: 50 })

    // Patch the splice shape.
    await lib.updateCut(song.id, cut!.id, { end: 48, curve: 'ease', fadeMs: 250 })
    expect(lib.getById(song.id)?.cuts?.[0]).toMatchObject({
      start: 30,
      end: 48,
      curve: 'ease',
      fadeMs: 250,
    })

    await lib.removeCut(song.id, cut!.id)
    expect(lib.getById(song.id)?.cuts ?? []).toEqual([])
  })

  it('keeps cut regions sorted by start', async () => {
    const lib = useLibraryStore()
    await lib.init()
    const song = await lib.addSong({
      title: 'X',
      piano: makeNoiseWavFile('p.wav'),
      choir: makeNoiseWavFile('c.wav'),
    })
    await lib.addCut(song.id, { start: 60, end: 70 })
    await lib.addCut(song.id, { start: 10, end: 20 })
    const starts = lib.getById(song.id)?.cuts?.map((c) => c.start)
    expect(starts).toEqual([10, 60])
  })
})
