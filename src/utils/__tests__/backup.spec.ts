import { beforeEach, describe, expect, it } from 'vitest'
import {
  BACKUP_MAGIC,
  base64ToBlob,
  blobToBase64,
  buildBackup,
  parseBackup,
  restoreBackup,
} from '@/utils/backup'
import { makeNoiseWavFile } from '@/__tests__/helpers/audio'
import * as idb from '@/db/idb'
import { useLibraryStore } from '@/stores/library'
import { createPinia, setActivePinia } from 'pinia'

describe('backup blob helpers', () => {
  it('round-trips a blob through base64 preserving type', async () => {
    const original = makeNoiseWavFile('test.wav', { seconds: 0.1 })
    const b64 = await blobToBase64(original)
    expect(typeof b64).toBe('string')
    const restored = base64ToBlob(b64, original.type)
    expect(restored.size).toBe(original.size)
    expect(restored.type).toBe(original.type)
  })
})

describe('backup build / parse / restore', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    const db = await idb.getDB()
    await db.clear('songs')
    await db.clear('services')
  })

  it('builds a backup with magic + version + serialized blob tracks', async () => {
    const lib = useLibraryStore()
    await lib.init()
    await lib.addSong({
      title: 'Test Hymn',
      piano: makeNoiseWavFile('p.wav', { seconds: 0.1 }),
      choir: makeNoiseWavFile('c.wav', { seconds: 0.1 }),
    })

    const backup = await buildBackup()
    expect(backup.app).toBe(BACKUP_MAGIC)
    expect(backup.version).toBe(1)
    expect(backup.songs.length).toBe(1)
    expect(backup.songs[0]?.piano.blobBase64).toBeTruthy()
    expect(backup.songs[0]?.choir.blobBase64).toBeTruthy()
    expect(backup.songs[0]?.title).toBe('Test Hymn')
  })

  it('parseBackup rejects files that are not sanctuary backups', () => {
    expect(() => parseBackup(JSON.stringify({ app: 'something-else' }))).toThrow(
      /not a Sanctuary Player backup/i,
    )
  })

  it('restoreBackup rebuilds blob tracks and writes them to idb', async () => {
    const lib = useLibraryStore()
    await lib.init()
    await lib.addSong({
      title: 'Roundtrip',
      piano: makeNoiseWavFile('p.wav', { seconds: 0.1 }),
      choir: makeNoiseWavFile('c.wav', { seconds: 0.1 }),
    })

    const backup = await buildBackup()
    // Wipe the library, then restore from backup
    await idb.getDB().then((db) => db.clear('songs'))
    await lib.reload()
    expect(lib.songs.length).toBe(0)

    const result = await restoreBackup(backup, 'replace')
    expect(result.songs).toBe(1)
    await lib.reload()
    expect(lib.songs.length).toBe(1)
    expect(lib.songs[0]?.title).toBe('Roundtrip')
    // fake-indexeddb doesn't preserve Blob instances through put/get, so we
    // only assert the payload survived. In a real browser this is a Blob.
    expect(lib.songs[0]?.piano.blob).toBeTruthy()
  })
})
