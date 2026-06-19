/**
 * Compute normalized amplitude peaks from an audio source for waveform display.
 *
 * Uses the Web Audio `decodeAudioData` API to get raw PCM samples, then
 * down-samples to a fixed number of buckets by taking the loudest sample in
 * each bucket. Results are cached per source key so seeking back to the
 * intro doesn't re-decode a 10 MB file.
 */

const peakCache = new Map<string, number[]>()

export interface WaveformSource {
  blob?: Blob
  url?: string
}

async function sourceToArrayBuffer(src: WaveformSource): Promise<ArrayBuffer> {
  if (src.blob) return src.blob.arrayBuffer()
  if (src.url) {
    const res = await fetch(src.url)
    if (!res.ok) throw new Error(`Could not fetch audio (HTTP ${res.status})`)
    return res.arrayBuffer()
  }
  throw new Error('Waveform source has no blob or url')
}

function getAudioContext(): AudioContext {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) throw new Error('Web Audio API is not available in this browser')
  return new Ctor()
}

export async function computePeaks(
  key: string,
  source: WaveformSource,
  buckets = 600,
): Promise<number[]> {
  const cached = peakCache.get(key)
  if (cached) return cached

  const buffer = await sourceToArrayBuffer(source)
  const ctx = getAudioContext()
  try {
    const audio = await ctx.decodeAudioData(buffer.slice(0))
    const channel = audio.getChannelData(0)
    const { length } = channel
    const blockSize = Math.max(1, Math.floor(length / buckets))
    const peaks: number[] = Array.from({ length: buckets })
    let top = 0.0001
    for (let i = 0; i < buckets; i++) {
      const start = i * blockSize
      let max = 0
      const end = Math.min(start + blockSize, length)
      for (let j = start; j < end; j++) {
        const v = channel[j]
        if (v) {
          const abs = v < 0 ? -v : v
          if (abs > max) max = abs
        }
      }
      peaks[i] = max
      if (max > top) top = max
    }
    // Normalize 0..1 so the quietest input still produces a visible shape.
    const normalized = peaks.map((p) => p / top)
    peakCache.set(key, normalized)
    return normalized
  } finally {
    void ctx.close()
  }
}

export function clearPeakCache(key?: string): void {
  if (key) peakCache.delete(key)
  else peakCache.clear()
}
