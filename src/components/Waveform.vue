<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

/**
 * Marker / loop overlay drawn on top of the waveform.
 * Times are in seconds. Labels render above the bar.
 */
export interface WaveformMarker {
  time: number
  label?: string
}

const props = withDefaults(
  defineProps<{
    peaks: number[]
    duration: number
    current: number
    markers?: WaveformMarker[]
    loop?: { start: number; end: number } | null
    height?: number
    accent?: string
    disabled?: boolean
  }>(),
  {
    markers: () => [],
    loop: null,
    height: 40,
    accent: 'var(--c-accent)',
    disabled: false,
  },
)

const emit = defineEmits<{
  (e: 'seek', time: number): void
  (e: 'marker-seek', marker: WaveformMarker): void
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const playhead = ref(props.current)
let dragging = false
let dpr = 1
let cssWidth = 0

function ratioToTime(ratio: number): number {
  const r = Math.max(0, Math.min(1, ratio))
  return r * (props.duration || 0)
}

function clientXToRatio(clientX: number): number {
  const el = canvas.value
  if (!el) return 0
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0) return 0
  return (clientX - rect.left) / rect.width
}

function pointerDown(e: PointerEvent) {
  if (props.disabled || props.duration <= 0) return
  dragging = true
  ;(e.target as Element).setPointerCapture?.(e.pointerId)
  const t = ratioToTime(clientXToRatio(e.clientX))
  playhead.value = t
  emit('seek', t)
}

function pointerMove(e: PointerEvent) {
  if (!dragging) return
  const t = ratioToTime(clientXToRatio(e.clientX))
  playhead.value = t
  emit('seek', t)
}

function pointerUp(e: PointerEvent) {
  if (!dragging) return
  dragging = false
  ;(e.target as Element).releasePointerCapture?.(e.pointerId)
}

function draw() {
  const cv = canvas.value
  if (!cv) return
  const ctx = cv.getContext('2d')
  if (!ctx) return

  const w = cssWidth
  const h = props.height
  const ratio = dpr
  cv.width = Math.floor(w * ratio)
  cv.height = Math.floor(h * ratio)
  cv.style.width = `${w}px`
  cv.style.height = `${h}px`
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const baseline = h / 2
  const playedRatio =
    props.duration > 0 ? Math.max(0, Math.min(1, playhead.value / props.duration)) : 0
  const playedX = playedRatio * w

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
    const unplayedColor = 'rgba(255, 255, 255, 0.18)'
    for (let i = 0; i < peaks.length; i++) {
      const p = peaks[i] ?? 0
      const barH = Math.max(1.5, p * (h - 6))
      const x = i * barWidth
      const played = x + barWidth / 2 <= playedX
      ctx.fillStyle = played ? playedColor : unplayedColor
      ctx.fillRect(x, baseline - barH / 2, Math.max(1, barWidth * 0.72), barH)
    }
  }

  // Markers (drawn after bars so labels sit above)
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
        ctx.fillStyle = 'rgba(227, 184, 115, 0.9)'
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

  // Playhead line
  if (props.duration > 0) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(playedX, 0)
    ctx.lineTo(playedX, h)
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(playedX, baseline, 4, 0, Math.PI * 2)
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
  resize()
  if (typeof ResizeObserver !== 'undefined' && canvas.value) {
    ro = new ResizeObserver(() => resize())
    ro.observe(canvas.value)
  }
  window.addEventListener('devicepixelratiochange', resize)
})

onBeforeUnmount(() => {
  ro?.disconnect()
  window.removeEventListener('devicepixelratiochange', resize)
})

// Keep playhead in sync with the player when not actively dragging.
watch(
  () => props.current,
  (v) => {
    if (!dragging) playhead.value = v
  },
)

watch(
  () => [props.peaks, props.duration, props.markers, props.loop, props.height, props.accent],
  () => draw(),
  { deep: true },
)

defineExpose({ redraw: draw })
</script>

<template>
  <div class="waveform" :class="{ 'waveform--disabled': disabled }">
    <canvas
      ref="canvas"
      class="waveform__canvas"
      :style="{ height: `${height}px` }"
      @pointerdown="pointerDown"
      @pointermove="pointerMove"
      @pointerup="pointerUp"
      @pointercancel="pointerUp"
    />
    <button
      v-for="(m, i) in markers"
      :key="i"
      class="waveform__marker"
      :style="{ left: duration > 0 ? `${(m.time / duration) * 100}%` : '0%' }"
      :title="`Jump to ${m.label ?? formatMarkerTime(m.time)}`"
      @click.stop="$emit('marker-seek', m)"
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
  width: 12px;
  margin-left: -6px;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
}
.waveform__marker-dot {
  position: absolute;
  bottom: -2px;
  left: 50%;
  transform: translateX(-50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--c-accent);
  box-shadow: 0 0 6px var(--c-accent-glow);
  border: 1.5px solid var(--c-bg-0);
}
</style>
