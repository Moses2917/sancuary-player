import 'fake-indexeddb/auto'

/**
 * jsdom's HTMLAudioElement.play() rejects ("Not supported") and there's no
 * real media pipeline, so the player store can't be exercised as-is. This
 * stub mirrors the surface the store touches: listeners, play/pause state,
 * currentTime/duration/volume, and event dispatching for testing sync logic.
 */
type Listener = (e: Event) => void

class FakeAudioElement {
  src = ''
  volume = 1
  currentTime = 0
  duration = NaN
  preload: string = 'auto'
  paused = true
  ended = false
  sinkId = ''
  private listeners = new Map<string, Set<Listener>>()

  constructor(src?: string) {
    if (src !== undefined) this.src = src
    // Track every instance so tests can grab the audio elements the player
    // store creates and simulate events / assert state on them.
    fakeAudioInstances.push(this)
  }
  addEventListener(type: string, fn: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(fn)
  }
  removeEventListener(type: string, fn: Listener) {
    this.listeners.get(type)?.delete(fn)
  }
  /** Test helper: dispatch an event to all listeners of `type`. */
  __dispatch(type: string) {
    const set = this.listeners.get(type)
    if (!set) return
    const event = { type, target: this, currentTarget: this } as unknown as Event
    for (const fn of set) fn(event)
  }
  play() {
    this.paused = false
    this.ended = false
    this.__dispatch('play')
    return Promise.resolve()
  }
  pause() {
    this.paused = true
    this.__dispatch('pause')
  }
  load() {
    /* noop */
  }
  removeAttribute(name: string) {
    if (name === 'src') this.src = ''
  }
  /** Stub for HTMLMediaElement.setSinkId; resolves successfully. */
  setSinkId(id: string) {
    this.sinkId = id
    return Promise.resolve()
  }
}

/** Registry of every FakeAudio element created during the test run. */
const fakeAudioInstances: FakeAudioElement[] = []

// Expose the constructor both as a named export for direct use in tests and
// as the global Audio so `new Audio()` inside the store resolves to the stub.
export const FakeAudio = FakeAudioElement as unknown as {
  new (src?: string): FakeAudioElement & HTMLAudioElement
}

/** Test helpers: inspect / reset the audio instances the player created. */
export function getFakeAudioInstances(): FakeAudioElement[] {
  return fakeAudioInstances
}
export function resetFakeAudioInstances() {
  fakeAudioInstances.length = 0
}

globalThis.Audio = FakeAudio as unknown as typeof Audio

// requestAnimationFrame is used by the player's drift guard; jsdom provides it
// but ties it to paint frames. Swap to a microtask-based shim so callbacks
// run deterministically in tests.
let rafId = 0
const rafQueue = new Map<number, FrameRequestCallback>()
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
  const id = ++rafId
  rafQueue.set(id, cb)
  queueMicrotask(() => {
    if (rafQueue.has(id)) {
      rafQueue.delete(id)
      cb(performance.now())
    }
  })
  return id
}
globalThis.cancelAnimationFrame = (id: number) => {
  rafQueue.delete(id)
}

// URL.createObjectURL is used by the player for blob-backed tracks.
if (!('createObjectURL' in URL)) {
  // @ts-expect-error test shim
  URL.createObjectURL = (blob: Blob) => `blob:fake/${blob.size}`
  // @ts-expect-error test shim
  URL.revokeObjectURL = () => {}
}

/**
 * Minimal AudioContext stub for waveform tests. Real Web Audio isn't
 * available in jsdom; this returns a synthetic single-channel buffer whose
 * length tracks the source size so peak extraction has something to chew on.
 */
class FakeAudioBuffer {
  constructor(private length: number) {}
  getNumberOfChannels() {
    return 1
  }
  getChannelData() {
    const arr = new Float32Array(this.length)
    for (let i = 0; i < this.length; i++) {
      arr[i] = Math.sin(i / 12) * 0.5
    }
    return arr
  }
}
class FakeAudioContext {
  async decodeAudioData(buf: ArrayBuffer) {
    return new FakeAudioBuffer(Math.max(1, Math.floor(buf.byteLength / 2)))
  }
  async close() {}
}
globalThis.AudioContext = FakeAudioContext as unknown as typeof AudioContext
