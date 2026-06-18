import { beforeEach, describe, expect, it } from 'vitest'
import * as idb from '@/db/idb'
import type { Service, Song } from '@/types'

function makeSong(overrides: Partial<Song> = {}): Song {
  return {
    id: 'song_1',
    title: 'Test Hymn',
    piano: { name: 'piano.wav', blob: new Blob([new Uint8Array([1, 2, 3])]) },
    choir: { name: 'choir.wav', blob: new Blob([new Uint8Array([4, 5, 6])]) },
    bundled: false,
    createdAt: 1,
    ...overrides,
  }
}

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: 'svc_1',
    name: 'Sunday Morning',
    date: '2026-06-22',
    items: [],
    createdAt: 1,
    ...overrides,
  }
}

describe('idb — songs', () => {
  beforeEach(async () => {
    // Wipe the fake DB between tests for isolation.
    const db = await idb.getDB()
    await Promise.all([
      db.clear('songs'),
      db.clear('services'),
      db.clear('settings'),
    ])
  })

  it('round-trips a song through the store', async () => {
    const song = makeSong()
    await idb.putSong(song)
    const fetched = await idb.getSong('song_1')
    expect(fetched).toBeDefined()
    expect(fetched?.title).toBe('Test Hymn')
    expect(fetched?.piano.name).toBe('piano.wav')
    expect(fetched?.choir.name).toBe('choir.wav')
    expect(fetched?.bundled).toBe(false)
    // Blob preservation through IndexedDB is exercised end-to-end by the
    // playwright specs in a real browser; fake-indexeddb doesn't round-trip
    // Blobs (it returns a plain object), so we only assert the track entry
    // is present here.
    expect(fetched?.piano).toBeDefined()
    expect(fetched?.choir).toBeDefined()
  })

  it('returns all songs sorted by createdAt ascending', async () => {
    await idb.putSong(makeSong({ id: 'b', createdAt: 200 }))
    await idb.putSong(makeSong({ id: 'a', createdAt: 100 }))
    await idb.putSong(makeSong({ id: 'c', createdAt: 300 }))
    const all = await idb.getAllSongs()
    expect(all.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('overwrites a song on put with the same id', async () => {
    await idb.putSong(makeSong({ id: 'x', title: 'Old' }))
    await idb.putSong(makeSong({ id: 'x', title: 'New' }))
    expect((await idb.getAllSongs()).length).toBe(1)
    expect((await idb.getSong('x'))?.title).toBe('New')
  })

  it('deletes a song', async () => {
    await idb.putSong(makeSong({ id: 'x' }))
    await idb.deleteSong('x')
    expect(await idb.getSong('x')).toBeUndefined()
    expect((await idb.getAllSongs()).length).toBe(0)
  })

  it('returns undefined for a missing id', async () => {
    expect(await idb.getSong('nope')).toBeUndefined()
  })
})

describe('idb — services', () => {
  beforeEach(async () => {
    const db = await idb.getDB()
    await db.clear('services')
  })

  it('round-trips a service including its playlist items', async () => {
    const svc = makeService({
      items: [
        { id: 'i1', songId: 's1', pianoVolume: 0.8, choirVolume: 1 },
        { id: 'i2', songId: 's2', pianoVolume: 1, choirVolume: 0.5 },
      ],
    })
    await idb.putService(svc)
    const fetched = await idb.getService('svc_1')
    expect(fetched?.items.length).toBe(2)
    expect(fetched?.items[1]?.choirVolume).toBe(0.5)
  })

  it('returns services sorted by createdAt', async () => {
    await idb.putService(makeService({ id: '2', createdAt: 200 }))
    await idb.putService(makeService({ id: '1', createdAt: 100 }))
    const all = await idb.getAllServices()
    expect(all.map((s) => s.id)).toEqual(['1', '2'])
  })

  it('deletes a service', async () => {
    await idb.putService(makeService({ id: 'svc_1' }))
    await idb.deleteService('svc_1')
    expect(await idb.getService('svc_1')).toBeUndefined()
  })
})

describe('idb — settings', () => {
  beforeEach(async () => {
    const db = await idb.getDB()
    await db.clear('settings')
  })

  it('returns defaults when nothing is stored', async () => {
    const s = await idb.getSettings()
    expect(s.masterVolume).toBe(0.9)
    expect(s.id).toBe('app')
  })

  it('saves and merges patches', async () => {
    await idb.saveSettings({ masterVolume: 0.4 })
    expect((await idb.getSettings()).masterVolume).toBe(0.4)
    await idb.saveSettings({ lastServiceId: 'svc_9' })
    const s = await idb.getSettings()
    expect(s.masterVolume).toBe(0.4)
    expect(s.lastServiceId).toBe('svc_9')
  })
})
