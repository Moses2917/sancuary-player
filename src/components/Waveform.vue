<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { FadeRegion } from '@/types'

/**
 * Marker / loop / fade overlays drawn on top of the waveform.
 * Times are in seconds.
 */
export interface WaveformMarker {
  id?: string
  time: number
  label?: string
}

const props = withDefaults(
  defineProps<{
    peaks: number[]
    duration: number
    current: number
    isPlaying?: boolean
    markers?: WaveformMarker[]
    loop?: { start: number; end: number } | null
    fades?: FadeRegion[]
    height?: number
    accent?: string
    disabled?: boolean
    /** Emit a seek on every pointer move during drag (true) or only on drop (false). */
    liveSeek?: boolean
    /** When true, clicks on the waveform drop a cue at the clicked position
     *  instead of seeking. Useful on touch devices where right-click isn't available. */
    placeCueMode?: boolean
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
    placeCueMode: false,
  },
)

const emit = defineEmits<{
  (e: 'seek', time: number): void
  (e: 'marker-seek', marker: WaveformMarker): void
  (e: 'add-cue', time: number): void
  (e: 'add-cue-at', time: number): void
  (e: 'update-fade', id: string, patch: Partial<FadeRegion>): void
  (e: 'remove-fade', id: string): void
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
  // In place-cue mode, a click drops a cue at the clicked position rather
  // than seeking. We still let the user drag-seek by holding — but a click
  // without movement becomes a cue placement.
  if (props.placeCueMode) {
    const t = ratioToTime(clientXToRatio(e.clientX))
    emit('add-cue-at', t)
    return
  }
  dragging = true
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
  const t = ratioToTime(clientXToRatio(e.clientX))
  setPlayhead(t)
  emit('seek', t)
}

/** Right-click always drops a cue at the clicked position, regardless of mode. */
function onContextMenu(e: MouseEvent) {
  if (props.disabled || props.duration <= 0) return
  e.preventDefault()
  const t = ratioToTime(clientXToRatio(e.clientX))
  emit('add-cue-at', t)
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

  // Fade regions are rendered as draggable HTML overlays (see template),
  // so the canvas only draws the loop region + bars + markers + playhead.

  // Loop region highlight
  if (props.loop && props.duration > 0) {
    const lx = (props.loop.start / props.duration) * w
    const rx = (props.loop.end / props.duration) * w
    ctx.fillStyle = 'rgba(46, 158, 91, 0.12)'
    ctx.fillRect(lx, 0, Math.max(1, rx - lx), h)
    ctx.strokeStyle = 'rgba(46, 158, 91, 0.55)'
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
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)'
    ctx.fillRect(0, baseline - 0.5, w, 1)
  } else {
    const barWidth = w / peaks.length
    const playedColor = props.accent
    const unplayedColor = 'rgba(0, 0, 0, 0.14)'
    const innerH = h - 4
    for (let i = 0; i < peaks.length; i++) {
      const p = peaks[i] ?? 0
      const barH = Math.max(1.5, p * innerH)
      const x = i * barWidth
      const played = x + barWidth / 2 <= playedX
      ctx.fillStyle = played ? playedColor : unplayedColor
      ctx.fillRect(x, baseline - barH / 2, Math.max(1, barWidth * 0.66), barH)
    }
  }

  // Markers (thin vertical lines + labels)
  if (props.markers.length && props.duration > 0) {
    for (const m of props.markers) {
      const x = (m.time / props.duration) * w
      ctx.strokeStyle = 'rgba(232, 71, 76, 0.6)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
      if (m.label) {
        ctx.font = '600 9px Inter, system-ui, sans-serif'
        const labelW = ctx.measureText(m.label).width
        const pad = 4
        let bx = x + 3
        if (bx + labelW + pad * 2 > w) bx = x - labelW - pad * 2 - 3
        ctx.fillStyle = 'rgba(232, 71, 76, 0.92)'
        ctx.fillRect(bx, 1, labelW + pad * 2, 13)
        ctx.fillStyle = '#fff'
        ctx.fillText(m.label, bx + pad, 11)
      }
    }
  }

  // Playhead line + small handle
  if (props.duration > 0) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(playedX, 0)
    ctx.lineTo(playedX, h)
    ctx.stroke()
    ctx.fillStyle = '#050505'
    ctx.beginPath()
    ctx.arc(playedX, baseline, 3.5, 0, Math.PI * 2)
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
  onFadeDragEnd()
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

/* ---------- fade region dragging ---------- */
const MIN_FADE_LEN = 0.5 // seconds; prevents zero-length regions
type DragMode = 'move' | 'start' | 'end'
let fadeDrag: {
  id: string
  mode: DragMode
  startClientX: number
  origStart: number
  origEnd: number
  rectWidth: number
} | null = null

function startFadeDrag(e: PointerEvent, fade: FadeRegion, mode: DragMode) {
  if (props.disabled || props.duration <= 0) return
  e.stopPropagation()
  e.preventDefault()
  const rect = canvas.value?.getBoundingClientRect()
  const rectWidth = rect?.width ?? 0
  fadeDrag = {
    id: fade.id,
    mode,
    startClientX: e.clientX,
    origStart: fade.start,
    origEnd: fade.end,
    rectWidth,
  }
  window.addEventListener('pointermove', onFadeDragMove)
  window.addEventListener('pointerup', onFadeDragEnd)
  window.addEventListener('pointercancel', onFadeDragEnd)
}

function onFadeDragMove(e: PointerEvent) {
  const drag = fadeDrag
  if (!drag || drag.rectWidth <= 0) return
  const dxSeconds = ((e.clientX - drag.startClientX) / drag.rectWidth) * props.duration
  const { origStart, origEnd, mode } = drag
  let nextStart = origStart
  let nextEnd = origEnd
  if (mode === 'move') {
    const len = origEnd - origStart
    nextStart = clamp(origStart + dxSeconds, 0, props.duration - len)
    nextEnd = nextStart + len
  } else if (mode === 'start') {
    nextStart = clamp(origStart + dxSeconds, 0, origEnd - MIN_FADE_LEN)
  } else if (mode === 'end') {
    nextEnd = clamp(origEnd + dxSeconds, origStart + MIN_FADE_LEN, props.duration)
  }
  emit('update-fade', drag.id, { start: nextStart, end: nextEnd })
}

function onFadeDragEnd() {
  fadeDrag = null
  window.removeEventListener('pointermove', onFadeDragMove)
  window.removeEventListener('pointerup', onFadeDragEnd)
  window.removeEventListener('pointercancel', onFadeDragEnd)
}

defineExpose({ redraw: draw })
</script>

<template>
  <div class="waveform" :class="{ 'waveform--disabled': disabled }">
    <canvas
      ref="canvas"
      class="waveform__canvas"
      :class="{ 'waveform__canvas--placing': placeCueMode }"
      :style="{ height: `${height}px` }"
      @pointerdown="startDrag"
      @contextmenu="onContextMenu"
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

    <!-- Draggable fade regions: gray translucent boxes with resize handles. -->
    <div
      v-for="fade in fades"
      :key="fade.id"
      class="fade"
      :style="{
        left: duration > 0 ? `${(fade.start / duration) * 100}%` : '0%',
        width:
          duration > 0 ? `${((fade.end - fade.start) / duration) * 100}%` : '0%',
      }"
    >
      <div
        class="fade__handle fade__handle--start"
        @pointerdown="startFadeDrag($event, fade, 'start')"
      />
      <div
        class="fade__body"
        title="Drag to move the fade region"
        @pointerdown="startFadeDrag($event, fade, 'move')"
      />
      <div
        class="fade__handle fade__handle--end"
        @pointerdown="startFadeDrag($event, fade, 'end')"
      />
      <button
        class="fade__close"
        title="Remove fade"
        @click.stop="emit('remove-fade', fade.id)"
        @pointerdown.stop
      >
        ×
      </button>
    </div>
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
.waveform__canvas--placing {
  cursor: crosshair;
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
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--c-accent);
  border: 2px solid var(--c-surface-raised);
}

/* Fade regions: gray translucent boxes with resize handles. */
.fade {
  position: absolute;
  top: 0;
  height: 100%;
  background: rgba(0, 0, 0, 0.07);
  border-left: 1px dashed rgba(0, 0, 0, 0.4);
  border-right: 1px dashed rgba(0, 0, 0, 0.4);
  border-radius: 3px;
  pointer-events: auto;
  cursor: grab;
  user-select: none;
}
.fade:active {
  cursor: grabbing;
}
.fade__body {
  position: absolute;
  inset: 0;
}
.fade__handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: ew-resize;
  z-index: 1;
}
.fade__handle--start {
  left: -4px;
}
.fade__handle--end {
  right: -4px;
}
.fade__close {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  z-index: 2;
  padding: 0;
}
.fade__close:hover {
  background: var(--c-danger);
  color: #fff;
}
</style>
