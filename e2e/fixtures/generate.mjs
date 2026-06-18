// Generates small white-noise WAV fixtures for tests.
// Usage: node e2e/fixtures/generate.mjs
// Writes piano-noise.wav and choir-noise.wav into e2e/fixtures/
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Build a mono 16-bit PCM WAV buffer filled with pseudo-random noise. */
function makeNoiseWav({ seconds = 1, sampleRate = 8000, seed = 1 }) {
  const numSamples = Math.round(seconds * sampleRate)
  const dataSize = numSamples * 2 // 16-bit = 2 bytes/sample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  // RIFF header
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  // fmt subchunk
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true) // subchunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  // data subchunk
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  // Mulberry32 PRNG for deterministic noise
  let state = seed >>> 0
  const rand = () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    const amplitude = 0.25 // keep it quiet
    const sample = Math.round((rand() * 2 - 1) * amplitude * 32767)
    view.setInt16(offset, sample, true)
    offset += 2
  }

  return Buffer.from(buffer)
}

mkdirSync(__dirname, { recursive: true })

const files = [
  { name: 'piano-noise.wav', seconds: 2, seed: 12345 },
  { name: 'choir-noise.wav', seconds: 2, seed: 67890 },
  { name: 'piano-2.wav', seconds: 1, seed: 11111 },
  { name: 'choir-2.wav', seconds: 1, seed: 22222 },
]

for (const f of files) {
  const buf = makeNoiseWav(f)
  writeFileSync(join(__dirname, f.name), buf)
  console.log(`wrote ${f.name} (${buf.length} bytes)`)
}
