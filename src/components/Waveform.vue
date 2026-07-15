<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CutRegion, FadeRegion } from '@/types'

/**
 * Marker / loop / fade / cut overlays drawn on top of the waveform.
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
    cuts?: CutRegion[]
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
    cuts: () => [],
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
  (e: 'update-cut', id: string, patch: Partial<CutRegion>): void
  (e: 'remove-cut', id: string): void
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
  onRegionDragEnd()
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
  () => [props.peaks, props.duration, props.markers, props.loop, props.fades, props.cuts, props.height, props.accent],
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

/* ---------- region dragging (fades + cuts) ---------- */
const MIN_REGION_LEN = 0.5 // seconds; prevents zero-length regions
type DragMode = 'move' | 'start' | 'end'
type RegionKind = 'fade' | 'cut'
let regionDrag: {
  kind: RegionKind
  id: string
  mode: DragMode
  startClientX: number
  origStart: number
  origEnd: number
  rectWidth: number
} | null = null

/**
 * Live position of the region currently being dragged, rendered locally so
 * the box tracks the pointer smoothly WITHOUT round-tripping through the
 * store + SQLite on every move (that re-serialized the whole song —
 * blobs included — per pixel and made dragging unusably slow). The final
 * position is emitted once, on pointer drop.
 */
const liveRegion = ref<{ id: string; start: number; end: number } | null>(null)

/** Position of a region's edges, preferring the in-flight drag override. */
function regionStart(region: { id: string; start: number }): number {
  const live = liveRegion.value
  return live && live.id === region.id ? live.start : region.start
}
function regionEnd(region: { id: string; end: number }): number {
  const live = liveRegion.value
  return live && live.id === region.id ? live.end : region.end
}

/** Open cut transition popover, keyed by cut id; null when closed. */
const openCutMenu = ref<string | null>(null)

function startRegionDrag(
  e: PointerEvent,
  kind: RegionKind,
  region: { id: string; start: number; end: number },
  mode: DragMode,
) {
  if (props.disabled || props.duration <= 0) return
  e.stopPropagation()
  e.preventDefault()
  const rect = canvas.value?.getBoundingClientRect()
  const rectWidth = rect?.width ?? 0
  regionDrag = {
    kind,
    id: region.id,
    mode,
    startClientX: e.clientX,
    origStart: region.start,
    origEnd: region.end,
    rectWidth,
  }
  liveRegion.value = { id: region.id, start: region.start, end: region.end }
  window.addEventListener('pointermove', onRegionDragMove)
  window.addEventListener('pointerup', onRegionDragEnd)
  window.addEventListener('pointercancel', onRegionDragEnd)
}

function onRegionDragMove(e: PointerEvent) {
  const drag = regionDrag
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
    nextStart = clamp(origStart + dxSeconds, 0, origEnd - MIN_REGION_LEN)
  } else if (mode === 'end') {
    nextEnd = clamp(origEnd + dxSeconds, origStart + MIN_REGION_LEN, props.duration)
  }
  // Local-only update: re-renders just this box's style, nothing else.
  liveRegion.value = { id: drag.id, start: nextStart, end: nextEnd }
}

function onRegionDragEnd() {
  // Commit the final position exactly once; the store updates memory
  // synchronously (so the box doesn't snap back) and persists to SQLite async.
  const drag = regionDrag
  const live = liveRegion.value
  if (drag && live) {
    const patch = { start: live.start, end: live.end }
    if (drag.kind === 'fade') emit('update-fade', drag.id, patch)
    else emit('update-cut', drag.id, patch)
  }
  regionDrag = null
  liveRegion.value = null
  window.removeEventListener('pointermove', onRegionDragMove)
  window.removeEventListener('pointerup', onRegionDragEnd)
  window.removeEventListener('pointercancel', onRegionDragEnd)
}

/** Stop pointer events from reaching the canvas when interacting with a cut menu. */
function toggleCutMenu(cutId: string) {
  openCutMenu.value = openCutMenu.value === cutId ? null : cutId
}
function setCutCurve(cut: CutRegion, curve: CutRegion['curve']) {
  emit('update-cut', cut.id, { curve })
}
function setCutFadeMs(cut: CutRegion, fadeMs: number) {
  emit('update-cut', cut.id, { fadeMs })
}

/** DaVinci-style splice curves (Power = constant power, the smooth default). */
const curveOptions = [
  { value: 'equalPower', label: 'Power', title: 'Constant power — smoothest (default)' },
  { value: 'linear', label: 'Linear', title: 'Constant gain' },
  { value: 'ease', label: 'Ease', title: 'S-curve' },
  { value: 'fast', label: 'Fast', title: 'Exponential' },
] as const
/** Per-side fade lengths; 0 = hard cut. */
const fadeOptions = [
  { value: 0, label: 'Hard' },
  { value: 60, label: '60ms' },
  { value: 120, label: '120ms' },
  { value: 250, label: '250ms' },
  { value: 500, label: '500ms' },
] as const

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

    <!-- Draggable fade regions: gradient-filled boxes with grabbable resize handles. -->
    <div
      v-for="fade in fades"
      :key="fade.id"
      class="fade"
      :style="{
        left: duration > 0 ? `${(regionStart(fade) / duration) * 100}%` : '0%',
        width:
          duration > 0 ? `${((regionEnd(fade) - regionStart(fade)) / duration) * 100}%` : '0%',
        '--fade-target': fadeTargetPercent(fade),
      }"
    >
      <div class="fade__ramp" />
      <div
        class="fade__handle fade__handle--start"
        @pointerdown="startRegionDrag($event, 'fade', fade, 'start')"
      >
        <span class="fade__grip" />
      </div>
      <div
        class="fade__body"
        title="Drag to move · drag edges to resize"
        @pointerdown="startRegionDrag($event, 'fade', fade, 'move')"
      >
        <span class="fade__label">{{
          formatFadeDuration({ start: regionStart(fade), end: regionEnd(fade) })
        }}</span>
      </div>
      <div
        class="fade__handle fade__handle--end"
        @pointerdown="startRegionDrag($event, 'fade', fade, 'end')"
      >
        <span class="fade__grip" />
      </div>
      <button
        class="fade__close"
        title="Remove fade"
        @click.stop="emit('remove-fade', fade.id)"
        @pointerdown.stop
      >
        ×
      </button>
    </div>

    <!-- Draggable cut (skip) regions: the removed span is shown as a hatched
         box with resize handles; a transition button opens the splice picker. -->
    <div
      v-for="cut in cuts"
      :key="cut.id"
      class="cut"
      :style="{
        left: duration > 0 ? `${(regionStart(cut) / duration) * 100}%` : '0%',
        width:
          duration > 0 ? `${((regionEnd(cut) - regionStart(cut)) / duration) * 100}%` : '0%',
      }"
    >
      <div class="cut__hatch" />
      <div
        class="cut__handle cut__handle--start"
        @pointerdown="startRegionDrag($event, 'cut', cut, 'start')"
      >
        <span class="cut__grip" />
      </div>
      <div
        class="cut__body"
        title="Removed span · drag to move · drag edges to resize"
        @pointerdown="startRegionDrag($event, 'cut', cut, 'move')"
      >
        <span class="cut__label">−{{
          formatCutDuration({ start: regionStart(cut), end: regionEnd(cut) })
        }}</span>
        <button
          class="cut__transition"
          :title="`Transition: ${curveLabel(cut)} · ${fadeLabel(cut)}`"
          @click.stop="toggleCutMenu(cut.id)"
          @pointerdown.stop
        >
          {{ curveInitial(cut) }}
        </button>
      </div>
      <div
        class="cut__handle cut__handle--end"
        @pointerdown="startRegionDrag($event, 'cut', cut, 'end')"
      >
        <span class="cut__grip" />
      </div>
      <button
        class="cut__close"
        title="Remove cut"
        @click.stop="emit('remove-cut', cut.id)"
        @pointerdown.stop
      >
        ×
      </button>

      <!-- Transition picker (DaVinci-style): curve + fade length per side. -->
      <div v-if="openCutMenu === cut.id" class="cut__menu" @pointerdown.stop @click.stop>
        <div class="cut__menu-row">
          <span class="cut__menu-title">Transition</span>
        </div>
        <div class="cut__menu-row cut__curves">
          <button
            v-for="opt in curveOptions"
            :key="opt.value"
            class="cut__chip"
            :class="{ 'cut__chip--on': (cut.curve ?? 'equalPower') === opt.value }"
            :title="opt.title"
            @click="setCutCurve(cut, opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
        <div class="cut__menu-row cut__fades">
          <button
            v-for="opt in fadeOptions"
            :key="opt.value"
            class="cut__chip"
            :class="{ 'cut__chip--on': (cut.fadeMs ?? 120) === opt.value }"
            @click="setCutFadeMs(cut, opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
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

function formatFadeDuration(fade: { end: number; start: number }): string {
  const s = Math.max(0, fade.end - fade.start)
  if (!Number.isFinite(s) || s <= 0) return '0s'
  if (s < 10) return `${s.toFixed(1)}s`
  return `${Math.round(s)}s`
}

function fadeTargetPercent(fade: { toVolume?: number }): string {
  const v = fade.toVolume ?? 0
  return `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`
}

/** Duration of a removed span, formatted with a leading minus sign. */
function formatCutDuration(cut: { end: number; start: number }): string {
  const s = Math.max(0, cut.end - cut.start)
  if (!Number.isFinite(s) || s <= 0) return '0s'
  if (s < 10) return `${s.toFixed(1)}s`
  return `${Math.round(s)}s`
}

const CUT_CURVE_LABELS: Record<string, string> = {
  equalPower: 'Constant power',
  linear: 'Linear',
  ease: 'Ease',
  fast: 'Fast',
}
const CUT_CURVE_INITIALS: Record<string, string> = {
  equalPower: 'P',
  linear: 'L',
  ease: 'E',
  fast: 'F',
}

function curveLabel(cut: { curve?: string }): string {
  return CUT_CURVE_LABELS[cut.curve ?? 'equalPower'] ?? 'Constant power'
}
function curveInitial(cut: { curve?: string }): string {
  return CUT_CURVE_INITIALS[cut.curve ?? 'equalPower'] ?? 'P'
}
function fadeLabel(cut: { fadeMs?: number }): string {
  const ms = cut.fadeMs ?? 120
  return ms <= 0 ? 'hard cut' : `${ms}ms fade`
}

export { formatMarkerTime, formatFadeDuration, fadeTargetPercent, formatCutDuration }
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

/* Fade regions: translucent box with a visible volume ramp inside,
 * grabbable resize handles on each edge, and a duration label. */
.fade {
  position: absolute;
  top: 0;
  height: 100%;
  background: rgba(0, 0, 0, 0.06);
  border-left: 2px solid rgba(0, 0, 0, 0.45);
  border-right: 2px solid rgba(0, 0, 0, 0.45);
  border-radius: 4px;
  pointer-events: auto;
  cursor: grab;
  user-select: none;
  box-sizing: border-box;
  --fade-target: 0%;
}
.fade:active {
  cursor: grabbing;
}
.fade__body {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}
/* The visual ramp: solid at the right edge (target volume), faint at the left.
 * Drives home "this is where the sound tapers off". */
.fade__ramp {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    to right,
    rgba(232, 71, 76, 0.05) 0%,
    rgba(232, 71, 76, 0.32) var(--fade-target, 0%) 100%
  );
  /* Ramp fades from low alpha on the left to high alpha at the right end. */
  opacity: 0.85;
}
.fade__label {
  position: relative;
  z-index: 1;
  margin-top: 2px;
  padding: 1px 6px;
  border-radius: var(--r-pill);
  background: rgba(232, 71, 76, 0.9);
  color: #fff;
  font-size: 0.6rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  pointer-events: none;
  white-space: nowrap;
}
.fade__handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 14px;
  cursor: ew-resize;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
}
.fade__handle--start {
  left: -8px;
}
.fade__handle--end {
  right: -8px;
}
.fade__grip {
  width: 4px;
  height: 22px;
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.4);
  transition: background var(--dur-fast) var(--ease);
}
.fade__handle:hover .fade__grip {
  background: var(--c-accent);
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
  z-index: 3;
  padding: 0;
}
.fade__close:hover {
  background: var(--c-danger);
  color: #fff;
}

/* Cut (skip) regions: the removed span. Hatched fill + scissors-toned frame
 * to read as "gone", with the same grabbable handle pattern as fades plus a
 * transition picker button and a small popover for curve/fade length. */
.cut {
  position: absolute;
  top: 0;
  height: 100%;
  border-left: 2px dashed rgba(232, 71, 76, 0.7);
  border-right: 2px dashed rgba(232, 71, 76, 0.7);
  border-radius: 4px;
  pointer-events: auto;
  cursor: grab;
  user-select: none;
  box-sizing: border-box;
}
.cut:active {
  cursor: grabbing;
}
.cut__hatch {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: repeating-linear-gradient(
    135deg,
    rgba(232, 71, 76, 0.16) 0,
    rgba(232, 71, 76, 0.16) 6px,
    rgba(232, 71, 76, 0.05) 6px,
    rgba(232, 71, 76, 0.05) 12px
  );
  opacity: 0.9;
}
.cut__body {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 4px;
  padding-top: 2px;
}
.cut__label {
  padding: 1px 6px;
  border-radius: var(--r-pill);
  background: rgba(232, 71, 76, 0.9);
  color: #fff;
  font-size: 0.6rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  pointer-events: none;
  white-space: nowrap;
}
.cut__transition {
  border: 1px solid rgba(232, 71, 76, 0.6);
  background: rgba(255, 255, 255, 0.85);
  color: var(--c-danger, #c01f25);
  width: 16px;
  height: 16px;
  border-radius: 50%;
  font-size: 0.58rem;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.cut__transition:hover {
  background: #fff;
}
.cut__handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 14px;
  cursor: ew-resize;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cut__handle--start {
  left: -8px;
}
.cut__handle--end {
  right: -8px;
}
.cut__grip {
  width: 4px;
  height: 22px;
  border-radius: 2px;
  background: rgba(232, 71, 76, 0.55);
  transition: background var(--dur-fast) var(--ease);
}
.cut__handle:hover .cut__grip {
  background: var(--c-danger);
}
.cut__close {
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
  z-index: 3;
  padding: 0;
}
.cut__close:hover {
  background: var(--c-danger);
  color: #fff;
}
/* Transition popover: curve chips + per-side fade length chips. */
.cut__menu {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 6px;
  z-index: 4;
  background: var(--c-surface-raised, #fff);
  border: 1px solid var(--c-border, #e3e3e8);
  border-radius: var(--r-md, 8px);
  box-shadow: var(--sh-md, 0 4px 14px rgba(0, 0, 0, 0.14));
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  white-space: nowrap;
  cursor: default;
}
.cut__menu-row {
  display: flex;
  align-items: center;
  gap: 3px;
}
.cut__menu-title {
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--c-text-muted, #888);
  padding: 0 2px;
}
.cut__chip {
  border: 1px solid var(--c-border, #e3e3e8);
  background: transparent;
  color: var(--c-text-soft, #555);
  border-radius: var(--r-pill, 999px);
  font-size: 0.62rem;
  font-weight: 600;
  padding: 3px 8px;
  cursor: pointer;
  line-height: 1.2;
}
.cut__chip:hover {
  background: var(--c-bg-2, #f3f3f6);
}
.cut__chip--on {
  background: var(--c-accent, #2e9e5b);
  border-color: var(--c-accent, #2e9e5b);
  color: #fff;
}
.cut__chip--on:hover {
  background: var(--c-accent-deep, #258a50);
}
@media (max-width: 600px) {
  .fade__label {
    display: none;
  }
  .fade__handle {
    width: 22px;
  }
  .fade__handle--start {
    left: -11px;
  }
  .fade__handle--end {
    right: -11px;
  }
  .cut__label {
    display: none;
  }
  .cut__handle {
    width: 22px;
  }
  .cut__handle--start {
    left: -11px;
  }
  .cut__handle--end {
    right: -11px;
  }
}
</style>
