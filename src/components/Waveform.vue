<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

/**
 * Marker / loop / fade overlays drawn on top of the waveform.
 * Times are in seconds.
 */
export interface WaveformMarker {
  id?: string
  time: number
  label?: string
}

export interface WaveformFade {
  id?: string
  start: number
  end: number
}

const props = withDefaults(
  defineProps<{
    peaks: number[]
    duration: number
    current: number
    isPlaying?: boolean
    markers?: WaveformMarker[]
    loop?: { start: number; end: number } | null
    fades?: WaveformFade[]
    height?: number
    accent?: string
    disabled?: boolean
    /** Emit a seek on every pointer move during drag (true) or only on drop (false). */
    liveSeek?: boolean
  }>(),
  {
    isPlaying: false,
    markers: () => [],
    loop: null,
    fades: () => [],
    height: 56,
    accent: 'var(--c-accent)',
    disabled: false,
    liveSeek: true,
  },
)

const emit = defineEmits<{
  (e: 'seek', time: number): void
  (e: 'marker-seek', marker: WaveformMarker): void
  (e: 'add-cue', time: number): void
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const playhead = ref(props.current)

// Drag state. Pointer events are bound to window during a drag so the user
// can scrub outside the canvas without losing the gesture (HTML pointer
// capture is flaky across browsers; window listeners are bulletproof).
let dragging = false
let dpr = 1
let cssWidth = 0

// RAF state. <audio> timeupdate fires ~4x/sec, which looks choppy. While
// playing, we run a RAF loop that interpolates the playhead from the last
// known time, so the visual scrub is smooth at 60fps.
let rafId: number | null = null
let lastAnchorTime = 0
let lastAnchorWall = 0

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function ratioToTime(ratio: number): number {
  return clamp(ratio, 0, 1) * (props.duration || 0)
}

function clientXToRatio(clientX: number): number {
  const el = canvas.value
  if (!el) return 0
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0) return 0
  return (clientX - rect.left) / rect.width
}

function startDrag(e: PointerEvent) {
  if (props.disabled || props.duration <= 0) return
  dragging = true
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
  const t = ratioToTime(clientXToRatio(e.clientX))
  setPlayhead(t)
  emit('seek', t)
}

function onDragMove(e: PointerEvent) {
  if (!dragging) return
  const t = ratioToTime(clientXToRatio(e.clientX))
  setPlayhead(t)
  if (props.liveSeek) emit('seek', t)
}

function onDragEnd() {
  if (!dragging) return
  dragging = false
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
  // If we were in non-live mode, emit the final seek now.
  if (!props.liveSeek) emit('seek', playhead.value)
}

function setPlayhead(t: number) {
  playhead.value = t
  lastAnchorTime = t
  lastAnchorWall = performance.now()
  draw()
}

function startRaf() {
  if (rafId !== null) return
  // The interpolation loop is a real-browser optimisation; in vitest the
  // microtask-based rAF shim would spin forever, so we skip it there.
  if (import.meta.env?.MODE === 'test') return
  const loop = () => {
    if (props.isPlaying && !dragging) {
      const elapsed = (performance.now() - lastAnchorWall) / 1000
      const next = clamp(lastAnchorTime + elapsed, 0, props.duration)
      playhead.value = next
      draw()
    }
    rafId = requestAnimationFrame(loop)
  }
  rafId = requestAnimationFrame(loop)
}

function stopRaf() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}

function draw() {
  const cv = canvas.value
  if (!cv) return
  const ctx = cv.getContext('2d')
  if (!ctx) return

  const w = cssWidth
  const h = props.height
  if (w <= 0) return
  const ratio = dpr
  cv.width = Math.floor(w * ratio)
  cv.height = Math.floor(h * ratio)
  cv.style.width = `${w}px`
  cv.style.height = `${h}px`
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const baseline = h / 2
  const playedRatio =
    props.duration > 0 ? clamp(playhead.value / props.duration, 0, 1) : 0
  const playedX = playedRatio * w

  // Fade regions: gray translucent boxes
  if (props.fades.length && props.duration > 0) {
    for (const f of props.fades) {
      const fx = (f.start / props.duration) * w
      const ex = (f.end / props.duration) * w
      ctx.fillStyle = 'rgba(180, 180, 180, 0.18)'
      ctx.fillRect(fx, 0, Math.max(2, ex - fx), h)
      ctx.strokeStyle = 'rgba(220, 220, 220, 0.5)'
      ctx.setLineDash([4, 3])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(fx, 0)
      ctx.lineTo(fx, h)
      ctx.moveTo(ex, 0)
      ctx.lineTo(ex, h)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  // Loop region highlight
  if (props.loop && props.duration > 0) {
    const lx = (props.loop.start / props.duration) * w
    const rx = (props.loop.end / props.duration) * w
    ctx.fillStyle = 'rgba(116, 215, 168, 0.12)'
    ctx.fillRect(lx, 0, Math.max(1, rx - lx), h)
    ctx.strokeStyle = 'rgba(116, 215, 168, 0.55)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(lx, 0)
    ctx.lineTo(lx, h)
    ctx.moveTo(rx, 0)
    ctx.lineTo(rx, h)
    ctx.stroke()
  }

  const peaks = props.peaks
  if (peaks.length === 0) {
    // Placeholder rail
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.fillRect(0, baseline - 1, w, 2)
  } else {
    const barWidth = w / peaks.length
    const playedColor = props.accent
    const unplayedColor = 'rgba(255, 255, 255, 0.22)'
    const innerH = h - 8
    for (let i = 0; i < peaks.length; i++) {
      const p = peaks[i] ?? 0
      const barH = Math.max(2, p * innerH)
      const x = i * barWidth
      const played = x + barWidth / 2 <= playedX
      ctx.fillStyle = played ? playedColor : unplayedColor
      ctx.fillRect(x, baseline - barH / 2, Math.max(1, barWidth * 0.78), barH)
    }
  }

  // Markers (vertical lines + labels)
  if (props.markers.length && props.duration > 0) {
    for (const m of props.markers) {
      const x = (m.time / props.duration) * w
      ctx.strokeStyle = 'rgba(227, 184, 115, 0.9)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
      if (m.label) {
        ctx.font = '600 9px Inter, system-ui, sans-serif'
        const labelW = ctx.measureText(m.label).width
        const pad = 3
        let bx = x + 3
        if (bx + labelW + pad * 2 > w) bx = x - labelW - pad * 2 - 3
        ctx.fillStyle = 'rgba(227, 184, 115, 0.18)'
        ctx.fillRect(bx, 1, labelW + pad * 2, 12)
        ctx.fillStyle = 'rgba(240, 205, 149, 1)'
        ctx.fillText(m.label, bx + pad, 10)
      }
    }
  }

  // Playhead line + handle
  if (props.duration > 0) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(playedX, 0)
    ctx.lineTo(playedX, h)
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(playedX, baseline, 5, 0, Math.PI * 2)
    ctx.fill()
  }
}

function resize() {
  const cv = canvas.value
  if (!cv) return
  const rect = cv.getBoundingClientRect()
  cssWidth = rect.width || cv.parentElement?.clientWidth || 0
  dpr = window.devicePixelRatio || 1
  draw()
}

let ro: ResizeObserver | null = null

onMounted(() => {
  // Defer one frame so layout has settled before measuring.
  requestAnimationFrame(() => {
    resize()
    // Only run the interpolation loop while actually playing — otherwise
    // we'd churn microtasks forever in test environments.
    if (props.isPlaying) startRaf()
  })
  if (typeof ResizeObserver !== 'undefined' && canvas.value) {
    ro = new ResizeObserver(() => resize())
    ro.observe(canvas.value)
  }
  window.addEventListener('devicepixelratiochange', resize)
})

onBeforeUnmount(() => {
  stopRaf()
  onDragEnd() // removes any lingering window listeners
  ro?.disconnect()
  window.removeEventListener('devicepixelratiochange', resize)
})

// Anchor the RAF interpolator whenever the player reports a new time.
watch(
  () => props.current,
  (v) => {
    if (!dragging) {
      lastAnchorTime = v
      lastAnchorWall = performance.now()
      playhead.value = v
      draw()
    }
  },
)

watch(
  () => [props.peaks, props.duration, props.markers, props.loop, props.fades, props.height, props.accent],
  () => draw(),
  { deep: true },
)

watch(
  () => props.isPlaying,
  (playing) => {
    lastAnchorWall = performance.now()
    if (playing) startRaf()
    else stopRaf()
  },
)

defineExpose({ redraw: draw })
</script>

<template>
  <div class="waveform" :class="{ 'waveform--disabled': disabled }">
    <canvas
      ref="canvas"
      class="waveform__canvas"
      :style="{ height: `${height}px` }"
      @pointerdown="startDrag"
      @dblclick="props.duration > 0 && emit('add-cue', playhead)"
    />
    <button
      v-for="(m, i) in markers"
      :key="m.id ?? i"
      class="waveform__marker"
      :style="{ left: duration > 0 ? `${(m.time / duration) * 100}%` : '0%' }"
      :title="`Jump to ${m.label ?? formatMarkerTime(m.time)}`"
      @click.stop="emit('marker-seek', m)"
      @pointerdown.stop
    >
      <span class="waveform__marker-dot" />
    </button>
  </div>
</template>

<script lang="ts">
function formatMarkerTime(t: number): string {
  if (!Number.isFinite(t) || t < 0) return '0:00'
  const total = Math.floor(t)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
export { formatMarkerTime }
</script>

<style scoped>
.waveform {
  position: relative;
  width: 100%;
  user-select: none;
  touch-action: none;
}
.waveform__canvas {
  display: block;
  width: 100%;
  cursor: pointer;
  border-radius: var(--r-sm);
}
.waveform--disabled .waveform__canvas {
  cursor: not-allowed;
  opacity: 0.5;
}
.waveform__marker {
  position: absolute;
  top: 0;
  height: 100%;
  width: 14px;
  margin-left: -7px;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
}
.waveform__marker-dot {
  position: absolute;
  bottom: -3px;
  left: 50%;
  transform: translateX(-50%);
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--c-accent);
  box-shadow: 0 0 8px var(--c-accent-glow);
  border: 2px solid var(--c-bg-0);
}
</style>
