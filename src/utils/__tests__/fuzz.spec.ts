import { beforeEach, describe, expect, it } from 'vitest'
import {
  BACKUP_MAGIC,
  BACKUP_VERSION,
  base64ToBlob,
  blobToBase64,
  parseBackup,
  restoreBackup,
} from '@/utils/backup'
import { clearPeakCache, computePeaks } from '@/utils/waveform'
import { formatDate, formatTime, uid } from '@/utils'
import { makeNoiseWavFile } from '@/__tests__/helpers/audio'
import * as idb from '@/db/sqlite'
import { createPinia, setActivePinia } from 'pinia'
import { useLibraryStore } from '@/stores/library'

/**
 * Lightweight property/fuzz tests. We don't pull in fast-check to keep the
 * dependency surface small — a seeded PRNG + a few hundred iterations is
 * enough to catch panics and invariant violations in pure utilities.
 */

function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ITERATIONS = 200

describe('fuzz: formatTime', () => {
  it('never throws and always returns a valid M:SS or H:MM:SS shape for any number', () => {
    const rng = makeRng(1)
    const shape = /^\d+:\d{2}(:\d{2})?$/
    for (let i = 0; i < ITERATIONS; i++) {
      const values = [
        rng() * 1e6,
        -rng() * 1e6,
        Math.floor(rng() * 1e6),
        i,
        NaN,
        Infinity,
        -Infinity,
      ]
      for (const v of values) {
        const out = formatTime(v)
        expect(out, `input ${v}`).toMatch(shape)
      }
    }
  })

  it('clamps negatives and non-finite values to 0:00', () => {
    expect(formatTime(-1)).toBe('0:00')
    expect(formatTime(-100)).toBe('0:00')
    expect(formatTime(NaN)).toBe('0:00')
    expect(formatTime(Infinity)).toBe('0:00')
    expect(formatTime(-Infinity)).toBe('0:00')
  })
})

describe('fuzz: formatDate', () => {
  it('always returns a string and never throws on arbitrary input', () => {
    const rng = makeRng(2)
    const samples = [
      '',
      'garbage',
      '2026-13-45',
      `${Math.floor(rng() * 3000)}-01-01`,
      `${Math.floor(rng() * 3000)}-${Math.floor(rng() * 12 + 1)
        .toString()
        .padStart(2, '0')}-${Math.floor(rng() * 28 + 1).toString().padStart(2, '0')}`,
      'January 1, 2030',
      null,
      undefined,
    ]
    for (const s of samples) {
      // @ts-expect-error intentionally feeding non-strings to confirm robustness
      const out = formatDate(s)
      expect(typeof out).toBe('string')
    }
  })

  it('passes date-only ISO strings back as a localized label without shifting the day', () => {
    expect(formatDate('2026-06-22')).toMatch(/Jun/)
    expect(formatDate('2026-06-22')).toMatch(/22/)
  })
})

describe('fuzz: uid uniqueness', () => {
  it('produces no collisions across many generations', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 5000; i++) {
      const id = uid('pfx')
      expect(id.startsWith('pfx_')).toBe(true)
      expect(seen.has(id)).toBe(false)
      seen.add(id)
    }
  })
})

describe('fuzz: parseBackup rejects malformed input', () => {
  const rng = makeRng(3)
  const samples: string[] = [
    '',
    'not json',
    '{}',
    '[]',
    'null',
    JSON.stringify({ app: 'wrong-app', version: 1, songs: [], services: [] }),
    JSON.stringify({ app: BACKUP_MAGIC, version: BACKUP_VERSION }), // missing songs/services
    JSON.stringify({ app: BACKUP_MAGIC, version: BACKUP_VERSION, songs: 'nope', services: [] }),
    JSON.stringify({ app: BACKUP_MAGIC, version: BACKUP_VERSION, songs: [], services: 7 }),
  ]
  for (let i = 0; i < ITERATIONS; i++) {
    // Random JSON-ish noise.
    samples.push(JSON.stringify({ [Math.random().toString(36)]: rng() }))
  }

  for (const [i, sample] of samples.entries()) {
    it(`rejects sample #${i} cleanly`, () => {
      // Every fuzz sample above is malformed in some way, so parseBackup
      // must throw. Asserting on the throw (not conditionally) keeps vitest happy.
      expect(() => parseBackup(sample)).toThrow(Error)
    })
  }

  it('accepts a structurally valid backup regardless of numeric version', () => {
    const valid = JSON.stringify({
      app: BACKUP_MAGIC,
      version: 999, // future versions should still parse structurally
      exportedAt: 1,
      songs: [],
      services: [],
      settings: { id: 'app', masterVolume: 0.5 },
    })
    const parsed = parseBackup(valid)
    expect(parsed.app).toBe(BACKUP_MAGIC)
  })
})

describe('fuzz: blob <-> base64 round trip preserves bytes', () => {
  it('round-trips arbitrary random binary buffers', async () => {
    const rng = makeRng(4)
    for (let i = 0; i < 30; i++) {
      const len = Math.floor(rng() * 2048)
      const bytes = new Uint8Array(len)
      for (let j = 0; j < len; j++) bytes[j] = Math.floor(rng() * 256)
      const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' })
      const b64 = await blobToBase64(blob)
      const restored = base64ToBlob(b64, 'application/octet-stream')
      expect(restored.size).toBe(len)
      const restoredBytes = new Uint8Array(await restored.arrayBuffer())
      expect(restoredBytes).toEqual(bytes)
    }
  })
})

describe('fuzz: computePeaks handles odd bucket counts', () => {
  beforeEach(async () => {
    clearPeakCache()
    const db = await idb.getDB()
    await db.clear('songs')
    setActivePinia(createPinia())
  })

  it('always returns exactly the requested bucket count and stays within [0,1]', async () => {
    const rng = makeRng(5)
    const file = makeNoiseWavFile('fuzz.wav', { seconds: 0.5, sampleRate: 8000 })
    const sizes = [1, 2, 10, 100, 1000, 5000, Math.floor(rng() * 2000) + 1]
    for (const n of sizes) {
      clearPeakCache()
      const peaks = await computePeaks(`fuzz-${n}`, { blob: file }, n)
      expect(peaks.length).toBe(n)
      for (const p of peaks) {
        expect(p).toBeGreaterThanOrEqual(0)
        expect(p).toBeLessThanOrEqual(1.0001)
      }
    }
  })

  it('does not crash when given a very large bucket count vs tiny source', async () => {
    clearPeakCache()
    const tiny = makeNoiseWavFile('tiny.wav', { seconds: 0.01, sampleRate: 8000 })
    const peaks = await computePeaks('tiny', { blob: tiny }, 10000)
    expect(peaks.length).toBe(10000)
  })
})

describe('fuzz: restoreBackup with adversarial payloads', () => {
  beforeEach(async () => {
    clearPeakCache()
    const db = await idb.getDB()
    await db.clear('songs')
    await db.clear('services')
    setActivePinia(createPinia())
    await useLibraryStore().init()
  })

  it('round-trips many randomly generated songs through build/restore', async () => {
    const lib = useLibraryStore()
    const rng = makeRng(6)
    const titles = []
    for (let i = 0; i < 6; i++) {
      titles.push(`Song ${Math.floor(rng() * 100000)}`)
    }
    for (const title of titles) {
      await lib.addSong({
        title,
        piano: makeNoiseWavFile('p.wav', { seconds: 0.05 }),
        choir: makeNoiseWavFile('c.wav', { seconds: 0.05 }),
      })
    }
    const { buildBackup } = await import('@/utils/backup')
    const backup = await buildBackup()
    expect(backup.songs.length).toBe(6)

    // Wipe and restore, then verify all titles round-tripped.
    const db = await idb.getDB()
    await db.clear('songs')
    await lib.reload()
    expect(lib.songs.length).toBe(0)

    await restoreBackup(backup, 'replace')
    await lib.reload()
    expect(lib.songs.length).toBe(6)
    const restoredTitles = new Set(lib.songs.map((s) => s.title))
    for (const t of titles) expect(restoredTitles.has(t)).toBe(true)
  })
})
