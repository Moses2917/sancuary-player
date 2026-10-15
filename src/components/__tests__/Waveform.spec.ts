import { afterEach, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import Waveform from '@/components/Waveform.vue'

enableAutoUnmount(afterEach)

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it('follows the audio clock instead of overshooting and snapping back on delayed updates', async () => {
  // Exercise the real animation loop with manually stepped frames.
  vi.stubEnv('MODE', 'development')
  let now = 0
  let frameId = 0
  const frames = new Map<number, FrameRequestCallback>()
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  const frame = (time: number) => {
    now = time
    const pending = [...frames.values()]
    frames.clear()
    for (const callback of pending) callback(now)
  }

  const context = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 1000, 56),
  )

  let audioTime = 10
  const wrapper = mount(Waveform, {
    props: { peaks: [], duration: 100, current: 0, getCurrentTime: () => audioTime },
  })
  const drawnTime = () => Number(context.arc.mock.lastCall?.[0]) / 10
  frame(0)
  await wrapper.setProps({ current: 10, isPlaying: true })

  audioTime = 10.2
  frame(250)
  expect(drawnTime()).toBeCloseTo(audioTime)
  audioTime = 10.55
  frame(600)
  const beforeUpdate = drawnTime()
  await wrapper.setProps({ current: 10.5 }) // A delayed timeupdate snapshot.
  expect(drawnTime()).toBeCloseTo(beforeUpdate)

  // Buffering must not make the visual playhead run ahead of the audio.
  frame(1600)
  expect(drawnTime()).toBeCloseTo(audioTime)
  audioTime = 3
  await wrapper.setProps({ current: 3 }) // A real backwards seek must still work.
  expect(drawnTime()).toBeCloseTo(3)

  await wrapper.setProps({ isPlaying: false })
  frame(5000)
  expect(drawnTime()).toBeCloseTo(3)
  expect(frames.size).toBe(0)
  await wrapper.setProps({ isPlaying: true })
  audioTime = 3.1
  frame(5100)
  expect(drawnTime()).toBeCloseTo(audioTime)
})
