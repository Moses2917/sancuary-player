/** Build an in-memory noise WAV File for tests (no fs or ffmpeg needed). */
export function makeNoiseWavFile(
  name: string,
  opts: { seconds?: number; sampleRate?: number; seed?: number } = {},
): File {
  const { seconds = 1, sampleRate = 8000, seed = 1 } = opts
  const numSamples = Math.round(seconds * sampleRate)
  const dataSize = numSamples * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)
  let state = seed >>> 0
  const rand = () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    view.setInt16(offset, Math.round((rand() * 2 - 1) * 0.25 * 32767), true)
    offset += 2
  }
  return new File([buffer], name, { type: 'audio/wav' })
}
