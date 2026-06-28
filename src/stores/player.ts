import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import type {
  CutCurve,
  CutRegion,
  FadeRegion,
  PlaylistItem,
  SectionMarker,
  Service,
  Song,
} from '@/types'
import { formatTime } from '@/utils'
import { useLibraryStore } from './library'

interface ActiveItem {
  item: PlaylistItem
  song: Song
}

/* ---------- Tunable constants ---------- */
/** Linear volume clamp helper. */
const SAFE_VOLUME = (v: number) => Math.max(0, Math.min(1, v))

/**
 * Map normalized fade-in progress (0→1) to a gain value (0→1) using one of
 * the DaVinci-style crossfade curves. `equalPower` (sin) keeps perceived
 * power constant across a splice and is the default; `linear` is constant
 * gain; `ease` is a smoothstep S-curve; `fast` is exponential (slow start).
 * A fade-out at progress q reuses this as gain(p) with p = 1 − q.
 */
function cutGain(curve: CutCurve, p: number): number {
  const c = Math.max(0, Math.min(1, p))
  switch (curve) {
    case 'linear':
      return c
    case 'ease':
      return c * c * (3 - 2 * c)
    case 'fast':
      return c * c
    case 'equalPower':
    default:
      return Math.sin((c * Math.PI) / 2)
  }
}
/** Seconds of piano/choir drift before we re-sync the laggard. */
const DRIFT_THRESHOLD_SEC = 0.08
/** Debounce window for the "both tracks ended → advance" check. */
const ENDED_DEBOUNCE_MS = 120
/** Default fade region length when one is dropped from the toolbar. */
const DEFAULT_FADE_LEN_SEC = 8
/** Default length (s) of a cut region dropped from the toolbar. */
const DEFAULT_CUT_LEN_SEC = 16
/** Default per-side smoothing ramp for a cut splice, in milliseconds. 0 = hard cut. */
const DEFAULT_CUT_FADE_MS = 120
/** Maximum smoothing ramp offered in the UI, in milliseconds. */
const MAX_CUT_FADE_MS = 500
/** Default fade curve for a cut splice (constant power — the smoothest). */
const DEFAULT_CUT_CURVE: CutCurve = 'equalPower'
/** Panic-stop ramp duration (fade-to-zero before pausing). */
const PANIC_FADE_MS = 450
/** Default volumes. */
const DEFAULT_MASTER_VOLUME = 0.9
const DEFAULT_PIANO_VOLUME = 1
/** Choir default is half — supports the piano rather than matching it. */
const DEFAULT_CHOIR_VOLUME = 0.5
/** How often (ms) we persist the resume-position marker while playing. */
const POSITION_SAVE_INTERVAL_MS = 5000
/** Solo target. */
type SoloTarget = 'piano' | 'choir' | null

/** True if this browser supports routing an <audio> element to a specific output device. */
export function supportsAudioOutputRouting(): boolean {
  if (typeof HTMLMediaElement === 'undefined') return false
  return (
    typeof (HTMLMediaElement.prototype as { setSinkId?: unknown }).setSinkId === 'function'
  )
}

/**
 * Dual-track locked-sync player.
 * Two underlying <audio> elements (piano + choir) are driven together;
 * per-track .volume provides independent gain, with a master multiplier.
 *
 * Each track can be routed to a separate audio output device via setSinkId
 * (Chrome/Edge/Firefox 136+; Safari ignores the calls gracefully).
 */
export const usePlayerStore = defineStore('player', () => {
  /* ---------- non-reactive audio elements ---------- */
  let pianoEl: HTMLAudioElement | null = null
  let choirEl: HTMLAudioElement | null = null
  let currentPianoUrl: string | null = null
  let currentChoirUrl: string | null = null
  let driftGuard = false
  let stopTimeout: ReturnType<typeof setTimeout> | null = null
  /** Active panic-stop ramp; tracks an increasing id so a new panic cancels the previous. */
  let panicToken = 0
  /** Resume-position autosave timer; only runs while playing and resume is enabled. */
  let positionSaveTimer: ReturnType<typeof setInterval> | null = null
  /** Pending piano/choir sinkIds to apply once the elements exist. */
  let pendingPianoSink: string | undefined
  let pendingChoirSink: string | undefined
  /** RAF id for the cut-splice dip engine; null when not running. */
  let cutRafId: number | null = null
  /** Active fade-in ramp after a splice; null when idle. */
  let spliceState: { startedWall: number; curve: CutCurve; fadeSec: number } | null = null

  function ensureElements() {
    if (pianoEl) return
    pianoEl = new Audio()
    choirEl = new Audio()
    pianoEl.preload = 'auto'
    choirEl.preload = 'auto'
    for (const el of [pianoEl, choirEl]) {
      el.addEventListener('loadedmetadata', syncMetadata)
      el.addEventListener('timeupdate', onTimeUpdate)
      el.addEventListener('ended', onEnded)
      el.addEventListener('play', () => {
        isPlaying.value = pianoEl!.paused === false || choirEl!.paused === false
      })
      el.addEventListener('pause', () => {
        isPlaying.value = !(pianoEl!.paused && choirEl!.paused)
      })
      el.addEventListener('error', onError)
    }
    // Apply any sinks that were requested before the elements existed.
    void applySink(pianoEl, pendingPianoSink)
    void applySink(choirEl, pendingChoirSink)
  }

  /** Tear down audio elements and listeners. Safe to call multiple times. */
  function dispose() {
    if (stopTimeout) {
      clearTimeout(stopTimeout)
      stopTimeout = null
    }
    if (positionSaveTimer) {
      clearInterval(positionSaveTimer)
      positionSaveTimer = null
    }
    if (cutRafId !== null) {
      const id = cutRafId
      cutRafId = null
      cancelAnimationFrame(id)
    }
    spliceState = null
    panicToken++ // invalidate any in-flight ramp
    for (const el of [pianoEl, choirEl]) {
      if (!el) continue
      el.pause()
      el.removeEventListener('loadedmetadata', syncMetadata)
      el.removeEventListener('timeupdate', onTimeUpdate)
      el.removeEventListener('ended', onEnded)
      el.removeEventListener('error', onError)
      el.removeAttribute('src')
      el.load()
    }
    pianoEl = null
    choirEl = null
    revokeUrls()
  }

  /* ---------- reactive state ---------- */
  const service = shallowRef<Service | null>(null)
  const queue = shallowRef<ActiveItem[]>([])
  const index = ref(-1)
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)

  const masterVolume = ref(DEFAULT_MASTER_VOLUME)
  const pianoVolume = ref(DEFAULT_PIANO_VOLUME)
  const choirVolume = ref(DEFAULT_CHOIR_VOLUME)
  const pianoMuted = ref(false)
  const choirMuted = ref(false)
  /** Single source of truth for solo state; piano/choir solo are mutually exclusive. */
  const solo = ref<SoloTarget>(null)

  /** Active A↔B loop region in seconds, or null when disabled. */
  const loop = ref<{ start: number; end: number } | null>(null)

  /**
   * Current fade multiplier in 0..1, recomputed on every timeupdate. When
   * playback is inside a fade region, this scales every track's effective
   * volume linearly from 1 at the region start to the region's toVolume
   * (default 0) at its end.
   */
  const fadeMultiplier = ref(1)

  /**
   * Current cut (skip) multiplier in 0..1, driven by the RAF dip engine.
   * While playback is dipping around a cut splice this scales every track's
   * effective volume; it's 1 everywhere else. Combined with `fadeMultiplier`
   * in `applyVolumes` so cut regions and fade regions compose cleanly.
   */
  const cutMultiplier = ref(1)

  const ready = ref(false)
  const isLoading = ref(false)

  /** Last user-facing error (audio load failure, blocked playback, sink error). */
  const error = ref<string | null>(null)

  /** When true, the player records and restores the per-song playhead position. */
  const resumePosition = ref(false)

  /** Current piano/choir sinkIds ('' = system default). */
  const pianoSinkId = ref('')
  const choirSinkId = ref('')

  /** Whether the browser exposes per-element audio output routing. */
  const outputRoutingSupported = ref(supportsAudioOutputRouting())

  /* ---------- derived ---------- */
  const current = computed<ActiveItem | null>(() =>
    index.value >= 0 ? (queue.value[index.value] ?? null) : null,
  )
  const currentSong = computed<Song | null>(() => current.value?.song ?? null)
  /** Markers for the currently playing song, surfaced to the waveform UI. */
  const currentMarkers = computed<SectionMarker[]>(() => currentSong.value?.markers ?? [])
  /** Fades for the currently playing song, surfaced to the waveform UI. */
  const currentFades = computed<FadeRegion[]>(() => currentSong.value?.fades ?? [])
  /** Cut (skip) regions for the currently playing song. */
  const currentCuts = computed<CutRegion[]>(() => currentSong.value?.cuts ?? [])
  const hasNext = computed(() => index.value < queue.value.length - 1)
  const hasPrev = computed(() => index.value > 0)
  const progress = computed(() =>
    duration.value > 0 ? (currentTime.value / duration.value) * 100 : 0,
  )

  // Backward-compatible solo accessors.
  const pianoSolo = computed<boolean>(() => solo.value === 'piano')
  const choirSolo = computed<boolean>(() => solo.value === 'choir')

  /* ---------- error reporting ---------- */
  function setError(message: string | null) {
    error.value = message
  }
  function clearError() {
    error.value = null
  }

  /* ---------- volume application ---------- */
  function applyVolumes() {
    if (!pianoEl || !choirEl) return
    // Fade regions and cut dips compose multiplicatively.
    const m = fadeMultiplier.value * cutMultiplier.value
    const effPiano =
      pianoMuted.value || solo.value === 'choir' ? 0 : pianoVolume.value * masterVolume.value * m
    const effChoir =
      choirMuted.value || solo.value === 'piano' ? 0 : choirVolume.value * masterVolume.value * m
    pianoEl.volume = SAFE_VOLUME(effPiano)
    choirEl.volume = SAFE_VOLUME(effChoir)
  }

  /* ---------- audio output routing ---------- */
  async function applySink(el: HTMLAudioElement | null, sinkId: string | undefined) {
    if (!el) return
    if (!outputRoutingSupported.value) return
    const target = sinkId ?? ''
    // Cast: TS lib targets older browsers; setSinkId exists at runtime when supported.
    type Sinked = { setSinkId: (id: string) => Promise<void> }
    const sinked = el as unknown as Sinked & HTMLAudioElement
    if (typeof sinked.setSinkId !== 'function') return
    try {
      await sinked.setSinkId(target)
    } catch (err) {
      setError(
        `Couldn't route audio to the selected output${
          err instanceof Error ? `: ${err.message}` : ''
        }. Falling back to default.`,
      )
    }
  }

  /** Set the piano track's output device; persisted via settings. */
  async function setPianoSink(sinkId: string) {
    pianoSinkId.value = sinkId
    pendingPianoSink = sinkId
    await applySink(pianoEl, sinkId)
  }
  /** Set the choir track's output device; persisted via settings. */
  async function setChoirSink(sinkId: string) {
    choirSinkId.value = sinkId
    pendingChoirSink = sinkId
    await applySink(choirEl, sinkId)
  }

  /**
   * List audiooutput devices. Returns a minimal shape even before permission
   * is granted (labels blank). Call requestOutputPermission() from a user
   * gesture to surface friendly names.
   */
  async function enumerateOutputs(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return []
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      return devices.filter((d) => d.kind === 'audiooutput')
    } catch {
      return []
    }
  }

  /**
   * Triggers the permission prompt that unlocks labeled device descriptions.
   * Must be called from a user-gesture handler (e.g. the outputs panel button).
   * No-ops on browsers that don't expose the API.
   */
  async function requestOutputPermission(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
    } catch {
      // Permission denied — we still get deviceId, just no label. Not fatal.
    }
  }

  /* ---------- source loading ---------- */
  function revokeUrls() {
    if (currentPianoUrl && currentPianoUrl.startsWith('blob:')) URL.revokeObjectURL(currentPianoUrl)
    if (currentChoirUrl && currentChoirUrl.startsWith('blob:')) URL.revokeObjectURL(currentChoirUrl)
    currentPianoUrl = null
    currentChoirUrl = null
  }

  function sourceFor(track: Song['piano']): string | null {
    if (track.url) return track.url
    if (track.blob) {
      const url = URL.createObjectURL(track.blob)
      return url
    }
    return null
  }

  async function loadActive() {
    const active = current.value
    ensureElements()
    if (!pianoEl || !choirEl) return

    const wasPlaying = isPlaying.value
    pianoEl.pause()
    choirEl.pause()
    revokeUrls()
    // A new track shouldn't inherit a leftover cut dip from the previous one.
    spliceState = null
    cutMultiplier.value = 1

    if (!active) {
      pianoEl.removeAttribute('src')
      choirEl.removeAttribute('src')
      pianoEl.load()
      choirEl.load()
      currentTime.value = 0
      duration.value = 0
      ready.value = false
      return
    }

    // Adopt the per-item volumes when present
    pianoVolume.value = active.item.pianoVolume
    choirVolume.value = active.item.choirVolume

    isLoading.value = true
    const pianoUrl = sourceFor(active.song.piano)
    const choirUrl = sourceFor(active.song.choir)
    currentPianoUrl = pianoUrl
    currentChoirUrl = choirUrl

    pianoEl.src = pianoUrl ?? ''
    choirEl.src = choirUrl ?? ''
    pianoEl.load()
    choirEl.load()
    applyVolumes()

    ready.value = false
    currentTime.value = 0

    // Re-apply any pending sinks; setSinkId survives src changes on most
    // browsers but Chrome occasionally loses it across load().
    void applySink(pianoEl, pendingPianoSink)
    void applySink(choirEl, pendingChoirSink)

    // Restore saved playhead position when rehearsal mode is on.
    if (resumePosition.value && typeof active.song.position === 'number') {
      const pos = Math.max(0, Math.min(active.song.position, duration.value || Infinity))
      if (Number.isFinite(pos) && pos > 0.5) {
        pianoEl.currentTime = pos
        if (choirEl) choirEl.currentTime = pos
        currentTime.value = pos
      }
    }

    if (wasPlaying) {
      await play()
    }
    isLoading.value = false
  }

  /* ---------- events ---------- */
  function syncMetadata() {
    const pd = pianoEl?.duration ?? 0
    const cd = choirEl?.duration ?? 0
    const d = Math.max(Number.isFinite(pd) ? pd : 0, Number.isFinite(cd) ? cd : 0)
    if (d > 0) duration.value = d
    ready.value = d > 0
  }

  function onTimeUpdate() {
    if (!pianoEl) return
    const t = pianoEl.currentTime
    currentTime.value = t

    // Recompute the fade multiplier whenever playback crosses a fade region.
    updateFadeMultiplier(t)

    // A↔B loop: if we've stepped past the loop end, jump back to the start.
    const lp = loop.value
    if (lp && isPlaying.value && t >= lp.end && lp.end > lp.start) {
      seek(lp.start)
      return
    }

    if (!driftGuard && isPlaying.value && choirEl && choirEl.src) {
      const drift = Math.abs(choirEl.currentTime - t)
      if (drift > DRIFT_THRESHOLD_SEC) {
        driftGuard = true
        try {
          choirEl.currentTime = t
        } catch {
          /* ignore */
        }
        requestAnimationFrame(() => (driftGuard = false))
      }
    }
  }

  /** Compute the current fade multiplier (1 outside any fade region). */
  function updateFadeMultiplier(t: number) {
    const fades = currentFades.value
    if (!fades || fades.length === 0) {
      if (fadeMultiplier.value !== 1) {
        fadeMultiplier.value = 1
        applyVolumes()
      }
      return
    }
    let mult = 1
    for (const f of fades) {
      if (t >= f.start && t <= f.end && f.end > f.start) {
        const progress = (t - f.start) / (f.end - f.start)
        const target = f.toVolume ?? 0
        // Linear from 1 at start → target at end.
        const scale = 1 + (target - 1) * progress
        if (scale < mult) mult = scale
      }
    }
    if (mult !== fadeMultiplier.value) {
      fadeMultiplier.value = mult
      applyVolumes()
    }
  }

  /* ---------- cut (skip) regions ---------- */
  function cutFadeSec(cut: CutRegion): number {
    return Math.max(0, Math.min(MAX_CUT_FADE_MS, cut.fadeMs ?? DEFAULT_CUT_FADE_MS)) / 1000
  }
  function cutCurveOf(cut: CutRegion): CutCurve {
    return cut.curve ?? DEFAULT_CUT_CURVE
  }

  /** Set the cut multiplier, applying volumes only when it actually changes. */
  function setCutMult(v: number) {
    if (cutMultiplier.value !== v) {
      cutMultiplier.value = v
      applyVolumes()
    }
  }

  /**
   * Cut-splice dip engine. Runs once per animation frame while playing and
   * the current song has cut regions (tighter than the ~4Hz timeupdate, so
   * the fade-out before the jump is actually audible). Each frame:
   *  - finishing a fade-in after a splice → ramp the multiplier 0→1,
   *  - landed inside a cut region → duck to 0, seek to its end, begin fade-in,
   *  - approaching a cut start within its fade-out window → ramp 1→0,
   *  - otherwise → multiplier stays at 1.
   */
  function cutFrame() {
    if (cutRafId === null) return // stopped between scheduling and firing
    cutRafId = requestAnimationFrame(cutFrame)
    if (!isPlaying.value || !pianoEl) return
    const cuts = currentCuts.value
    if (cuts.length === 0) {
      setCutMult(1)
      return
    }
    const t = pianoEl.currentTime

    // Fade-in after a splice: ramp from silence back to full.
    const sp = spliceState
    if (sp) {
      const elapsed = (performance.now() - sp.startedWall) / 1000
      if (sp.fadeSec <= 0 || elapsed >= sp.fadeSec) {
        spliceState = null
        setCutMult(1)
      } else {
        setCutMult(cutGain(sp.curve, elapsed / sp.fadeSec))
      }
      return
    }

    // Landed inside a cut region (overshot the start): duck now and jump.
    const inside = cuts.find((c) => t >= c.start && t < c.end)
    if (inside) {
      const fadeSec = cutFadeSec(inside)
      setCutMult(0)
      spliceState = { startedWall: performance.now(), curve: cutCurveOf(inside), fadeSec }
      void seek(inside.end)
      return
    }

    // Approaching a cut start within its fade-out window: ramp down.
    const approaching = cuts.find((c) => {
      const fs = cutFadeSec(c)
      return fs > 0 && t >= c.start - fs && t < c.start
    })
    if (approaching) {
      const fs = cutFadeSec(approaching)
      const q = (t - (approaching.start - fs)) / fs // 0 at window start → 1 at cut
      setCutMult(cutGain(cutCurveOf(approaching), 1 - q))
      return
    }

    setCutMult(1)
  }

  /** Start or stop the dip engine based on whether it's needed right now. */
  function syncCutWatcher() {
    const want = isPlaying.value && currentCuts.value.length > 0
    if (want && cutRafId === null) {
      cutRafId = requestAnimationFrame(cutFrame)
    } else if (!want && cutRafId !== null) {
      const id = cutRafId
      cutRafId = null
      cancelAnimationFrame(id)
      spliceState = null
      setCutMult(1)
    }
  }

  function onEnded() {
    if (stopTimeout) clearTimeout(stopTimeout)
    // Wait a tick; both may fire ended
    stopTimeout = setTimeout(() => {
      const pEnded = pianoEl?.ended || pianoEl?.paused
      const cEnded = !choirEl?.src || choirEl?.ended || choirEl?.paused
      if (pEnded && cEnded) {
        void saveCurrentPosition()
        if (hasNext.value) next(true)
        else {
          isPlaying.value = false
        }
      }
    }, ENDED_DEBOUNCE_MS)
  }

  function onError(e: Event) {
    const el = e.target as HTMLAudioElement
    const mediaErr = el?.error
    setError(
      `Audio failed to load${
        mediaErr ? ` (code ${mediaErr.code})` : ''
      }. Check the file is accessible and try re-importing.`,
    )
    console.warn('Audio error', mediaErr)
  }

  /* ---------- resume position ---------- */
  async function saveCurrentPosition() {
    if (!resumePosition.value) return
    const song = currentSong.value
    if (!song) return
    const library = useLibraryStore()
    const t = currentTime.value
    if (!Number.isFinite(t) || t <= 0.5) return
    await library.updateSong(song.id, { position: t })
  }

  function startPositionSaver() {
    if (positionSaveTimer) clearInterval(positionSaveTimer)
    if (!resumePosition.value) return
    positionSaveTimer = setInterval(() => {
      void saveCurrentPosition()
    }, POSITION_SAVE_INTERVAL_MS)
  }

  function stopPositionSaver() {
    if (positionSaveTimer) {
      clearInterval(positionSaveTimer)
      positionSaveTimer = null
    }
  }

  function setResumePosition(enabled: boolean) {
    resumePosition.value = enabled
    if (enabled) startPositionSaver()
    else stopPositionSaver()
  }

  /* ---------- transport ---------- */
  async function play() {
    ensureElements()
    if (!pianoEl || !choirEl) return
    if (!current.value) return
    applyVolumes()
    let pianoErr: unknown = null
    let choirErr: unknown = null
    const tasks: Promise<unknown>[] = []
    if (pianoEl.src) {
      tasks.push(
        pianoEl.play().catch((e) => {
          pianoErr = e
        }),
      )
    }
    if (choirEl.src) {
      tasks.push(
        choirEl.play().catch((e) => {
          choirErr = e
        }),
      )
    }
    await Promise.all(tasks)
    // Reflect actual element state regardless of errors.
    isPlaying.value = pianoEl.paused === false || choirEl.paused === false
    if (pianoErr && choirErr) {
      // Total failure: typically browser autoplay policy or no user gesture.
      setError('Playback was blocked by the browser. Click play again to start audio.')
    } else if (pianoErr || choirErr) {
      // Partial failure: one track couldn't start (e.g. missing src, codec error).
      setError('One of the tracks failed to start. Check the file and try again.')
    } else {
      clearError()
      startPositionSaver()
    }
  }

  function pause() {
    pianoEl?.pause()
    choirEl?.pause()
    isPlaying.value = false
    stopPositionSaver()
    void saveCurrentPosition()
  }

  function toggle() {
    if (isPlaying.value) pause()
    else play()
  }

  function stop() {
    pause()
    if (pianoEl) pianoEl.currentTime = 0
    if (choirEl) choirEl.currentTime = 0
    currentTime.value = 0
  }

  /**
   * Panic stop: smooth fade-out then pause+rewind. Avoids an abrupt cut
   * when the operator needs to silence the room immediately.
   */
  async function panicStop() {
    ensureElements()
    if (!pianoEl || !choirEl) return
    const token = ++panicToken
    const startWall = performance.now()
    const startMult = fadeMultiplier.value
    return new Promise<void>((resolve) => {
      const step = () => {
        if (token !== panicToken) return resolve() // superseded
        const elapsed = performance.now() - startWall
        const k = Math.min(1, elapsed / PANIC_FADE_MS)
        fadeMultiplier.value = startMult * (1 - k)
        applyVolumes()
        if (k < 1) {
          requestAnimationFrame(step)
        } else {
          pause()
          if (pianoEl) pianoEl.currentTime = 0
          if (choirEl) choirEl.currentTime = 0
          currentTime.value = 0
          fadeMultiplier.value = 1
          applyVolumes()
          resolve()
        }
      }
      requestAnimationFrame(step)
    })
  }

  async function seek(time: number) {
    if (!pianoEl) return
    // Don't allow manual seeks to land inside a removed region — jump to its
    // end. Also cancel any in-flight splice fade-in so we don't ramp on a
    // position the user just abandoned.
    spliceState = null
    const target = resolveCutClamp(time)
    driftGuard = true
    pianoEl.currentTime = target
    if (choirEl && choirEl.src) choirEl.currentTime = target
    currentTime.value = target
    setCutMult(1)
    requestAnimationFrame(() => (driftGuard = false))
  }

  /** If `time` falls inside a cut region, snap it to that region's end. */
  function resolveCutClamp(time: number): number {
    const cuts = currentCuts.value
    for (const c of cuts) {
      if (time >= c.start && time < c.end) return c.end
    }
    return time
  }

  async function next(auto = false) {
    if (!hasNext.value) return
    index.value++
    await loadActive()
    if (auto || isPlaying.value) await play()
  }

  async function prev() {
    if (!hasPrev.value) return
    index.value--
    await loadActive()
    if (isPlaying.value) await play()
  }

  /* ---------- playlist binding ---------- */
  /**
   * Load a service playlist and (optionally) start playing from `startIndex`.
   * Resolves songs from the provided map (caller has already fetched them).
   */
  async function load(svc: Service, songs: Song[], startIndex = 0, autoplay = true) {
    ensureElements()
    const map = new Map(songs.map((s) => [s.id, s]))
    const items: ActiveItem[] = svc.items
      .map((it) => {
        const song = map.get(it.songId)
        return song ? { item: it, song } : null
      })
      .filter((x): x is ActiveItem => x !== null)

    service.value = svc
    queue.value = items
    index.value = items.length ? Math.max(0, Math.min(startIndex, items.length - 1)) : -1
    loop.value = null
    await loadActive()
    if (autoplay && current.value) await play()
  }

  function clear() {
    pause()
    queue.value = []
    index.value = -1
    service.value = null
    loop.value = null
    void loadActive()
  }

  function playSingle(song: Song) {
    const fakeItem: PlaylistItem = {
      id: 'preview',
      songId: song.id,
      pianoVolume: pianoVolume.value,
      choirVolume: choirVolume.value,
    }
    const svc: Service = {
      id: 'preview',
      name: song.title,
      items: [fakeItem],
      createdAt: Date.now(),
    }
    void load(svc, [song], 0, true)
  }

  /* ---------- volume setters ---------- */
  function setMaster(v: number) {
    masterVolume.value = SAFE_VOLUME(v)
    applyVolumes()
  }
  function setPiano(v: number) {
    pianoVolume.value = SAFE_VOLUME(v)
    applyVolumes()
  }
  function setChoir(v: number) {
    choirVolume.value = SAFE_VOLUME(v)
    applyVolumes()
  }
  function togglePianoMute() {
    pianoMuted.value = !pianoMuted.value
    applyVolumes()
  }
  function toggleChoirMute() {
    choirMuted.value = !choirMuted.value
    applyVolumes()
  }
  function togglePianoSolo() {
    solo.value = solo.value === 'piano' ? null : 'piano'
    applyVolumes()
  }
  function toggleChoirSolo() {
    solo.value = solo.value === 'choir' ? null : 'choir'
    applyVolumes()
  }
  /** Mute both tracks at once. */
  function muteAll() {
    pianoMuted.value = true
    choirMuted.value = true
    applyVolumes()
  }

  /* ---------- A↔B loop ---------- */
  /** Anchor the loop start (A) to the current playhead. */
  function setLoopStart() {
    const t = currentTime.value
    const fallbackEnd = Number.isFinite(duration.value) ? duration.value : t + 1
    loop.value = { start: t, end: loop.value?.end ?? Math.max(t + 1, fallbackEnd) }
  }
  /** Anchor the loop end (B) to the current playhead. */
  function setLoopEnd() {
    if (!loop.value) {
      loop.value = { start: 0, end: currentTime.value }
      return
    }
    const end = currentTime.value
    loop.value = { start: Math.min(loop.value.start, end), end }
  }
  function toggleLoop() {
    if (loop.value) loop.value = null
    else if (duration.value > 0) loop.value = { start: 0, end: duration.value }
  }
  function clearLoop() {
    loop.value = null
  }

  /* ---------- cue markers ---------- */
  /** After a library edit, refresh the in-queue song reference so derived
   *  computeds (currentMarkers, etc.) pick up the new state. */
  function refreshActiveSong() {
    const active = current.value
    if (!active) return
    const library = useLibraryStore()
    const updated = library.getById(active.song.id)
    if (!updated || updated === active.song) return
    queue.value = queue.value.map((item) =>
      item.song.id === updated.id ? { item: item.item, song: updated } : item,
    )
  }

  /** Drop a named cue on the current song at the playhead. Persists to idb. */
  async function addMarkerHere(label?: string) {
    const song = currentSong.value
    if (!song) return
    const library = useLibraryStore()
    await library.addMarker(song.id, currentTime.value, label)
    refreshActiveSong()
  }
  /** Drop a named cue on the current song at an arbitrary time. Persists to idb. */
  async function addMarkerAt(time: number, label?: string) {
    const song = currentSong.value
    if (!song) return
    const library = useLibraryStore()
    await library.addMarker(song.id, time, label)
    refreshActiveSong()
  }
  async function removeMarker(markerId: string) {
    const song = currentSong.value
    if (!song) return
    const library = useLibraryStore()
    await library.removeMarker(song.id, markerId)
    refreshActiveSong()
  }

  /* ---------- fade regions ---------- */
  /** Drop a fade region starting at the playhead with the given duration (s). */
  async function addFadeHere(durationSeconds = DEFAULT_FADE_LEN_SEC) {
    const song = currentSong.value
    if (!song) return
    const start = currentTime.value
    const end = Math.min(
      start + durationSeconds,
      duration.value || start + durationSeconds,
    )
    const library = useLibraryStore()
    await library.addFade(song.id, { start, end, toVolume: 0 })
    refreshActiveSong()
  }
  async function updateFade(fadeId: string, patch: Partial<FadeRegion>) {
    const song = currentSong.value
    if (!song) return
    const library = useLibraryStore()
    await library.updateFade(song.id, fadeId, patch)
    refreshActiveSong()
  }
  async function removeFade(fadeId: string) {
    const song = currentSong.value
    if (!song) return
    const library = useLibraryStore()
    await library.removeFade(song.id, fadeId)
    refreshActiveSong()
  }

  /* ---------- cut (skip) regions ---------- */
  /**
   * Drop a cut region starting at the playhead with the default length and
   * the default smoothing. Drag the right edge on the waveform to set the
   * real cut end. Persists to idb.
   */
  async function addCutHere(durationSeconds = DEFAULT_CUT_LEN_SEC) {
    const song = currentSong.value
    if (!song) return
    const start = currentTime.value
    const end = Math.min(
      start + durationSeconds,
      duration.value || start + durationSeconds,
    )
    const library = useLibraryStore()
    await library.addCut(song.id, {
      start,
      end,
      fadeMs: DEFAULT_CUT_FADE_MS,
      curve: DEFAULT_CUT_CURVE,
    })
    refreshActiveSong()
    syncCutWatcher()
  }
  async function updateCut(cutId: string, patch: Partial<CutRegion>) {
    const song = currentSong.value
    if (!song) return
    const library = useLibraryStore()
    await library.updateCut(song.id, cutId, patch)
    refreshActiveSong()
  }
  async function removeCut(cutId: string) {
    const song = currentSong.value
    if (!song) return
    const library = useLibraryStore()
    await library.removeCut(song.id, cutId)
    refreshActiveSong()
    syncCutWatcher()
  }

  // Keep the dip engine running only while playing and cuts exist.
  watch([isPlaying, currentCuts], () => syncCutWatcher())

  const currentTimeFormatted = computed(() => formatTime(currentTime.value))
  const durationFormatted = computed(() => formatTime(duration.value))

  return {
    /* state */
    service,
    queue,
    index,
    isPlaying,
    isLoading,
    ready,
    currentTime,
    duration,
    masterVolume,
    pianoVolume,
    choirVolume,
    pianoMuted,
    choirMuted,
    pianoSolo,
    choirSolo,
    loop,
    fadeMultiplier,
    cutMultiplier,
    error,
    resumePosition,
    pianoSinkId,
    choirSinkId,
    outputRoutingSupported,
    /* derived */
    current,
    currentSong,
    currentMarkers,
    currentFades,
    currentCuts,
    hasNext,
    hasPrev,
    progress,
    currentTimeFormatted,
    durationFormatted,
    /* transport */
    play,
    pause,
    toggle,
    stop,
    panicStop,
    seek,
    next,
    prev,
    /* loop */
    setLoopStart,
    setLoopEnd,
    toggleLoop,
    clearLoop,
    /* markers */
    addMarkerHere,
    addMarkerAt,
    removeMarker,
    /* fades */
    addFadeHere,
    updateFade,
    removeFade,
    /* cuts */
    addCutHere,
    updateCut,
    removeCut,
    /* playlist */
    load,
    clear,
    playSingle,
    /* volume */
    setMaster,
    setPiano,
    setChoir,
    togglePianoMute,
    toggleChoirMute,
    togglePianoSolo,
    toggleChoirSolo,
    muteAll,
    /* outputs */
    setPianoSink,
    setChoirSink,
    enumerateOutputs,
    requestOutputPermission,
    /* resume position */
    setResumePosition,
    saveCurrentPosition,
    /* error reporting */
    setError,
    clearError,
    /* lifecycle */
    dispose,
  }
})
