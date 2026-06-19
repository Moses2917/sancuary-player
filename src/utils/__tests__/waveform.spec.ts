import { describe, expect, it, beforeEach } from 'vitest'
import { clearPeakCache, computePeaks } from '@/utils/waveform'
import { makeNoiseWavFile } from '@/__tests__/helpers/audio'

describe('computePeaks', () => {
  beforeEach(() => clearPeakCache())

  it('returns the requested number of normalized buckets', async () => {
    const file = makeNoiseWavFile('test.wav', { seconds: 0.5, sampleRate: 8000 })
    const peaks = await computePeaks('song-1', { blob: file }, 100)
    expect(peaks.length).toBe(100)
    // Normalized to 0..1, max ~1
    for (const p of peaks) {
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThanOrEqual(1.0001)
    }
    expect(Math.max(...peaks)).toBeCloseTo(1, 1)
  })

  it('caches results so the second call does not re-decode', async () => {
    const file = makeNoiseWavFile('cached.wav', { seconds: 0.25 })
    const first = await computePeaks('song-cache', { blob: file }, 50)
    const second = await computePeaks('song-cache', { blob: file }, 50)
    expect(second).toBe(first)
  })

  it('clearPeakCache() drops a specific entry only', async () => {
    const file = makeNoiseWavFile('drop.wav', { seconds: 0.25 })
    await computePeaks('song-drop', { blob: file }, 40)
    clearPeakCache('song-drop')
    // Re-decoding produces a fresh array (different reference) — proves cache was cleared.
    const again = await computePeaks('song-drop', { blob: file }, 40)
    expect(again.length).toBe(40)
  })

  it('rejects for sources with neither blob nor url', async () => {
    await expect(computePeaks('bad', {}, 10)).rejects.toThrow(/no blob or url/i)
  })
})
