import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { PlaylistItem, Service, Song } from '@/types'
import { formatTime } from '@/utils'

interface ActiveItem {
  item: PlaylistItem
  song: Song
}

const SAFE_VOLUME = (v: number) => Math.max(0, Math.min(1, v))

/**
 * Dual-track locked-sync player.
 * Two underlying <audio> elements (piano + choir) are driven together;
 * per-track .volume provides independent gain, with a master multiplier.
 */
export const usePlayerStore = defineStore('player', () => {
  /* ---------- non-reactive audio elements ---------- */
  let pianoEl: HTMLAudioElement | null = null
  let choirEl: HTMLAudioElement | null = null
  let currentPianoUrl: string | null = null
  let currentChoirUrl: string | null = null
  let driftGuard = false
  let stopTimeout: ReturnType<typeof setTimeout> | null = null

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
  }

  /* ---------- reactive state ---------- */
  const service = shallowRef<Service | null>(null)
  const queue = shallowRef<ActiveItem[]>([])
  const index = ref(-1)
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)

  const masterVolume = ref(0.9)
  const pianoVolume = ref(1)
  const choirVolume = ref(1)
  const pianoMuted = ref(false)
  const choirMuted = ref(false)
  const pianoSolo = ref(false)
  const choirSolo = ref(false)

  const ready = ref(false)
  const isLoading = ref(false)

  /* ---------- derived ---------- */
  const current = computed<ActiveItem | null>(
    () => (index.value >= 0 ? queue.value[index.value] ?? null : null),
  )
  const currentSong = computed<Song | null>(() => current.value?.song ?? null)
  const hasNext = computed(() => index.value < queue.value.length - 1)
  const hasPrev = computed(() => index.value > 0)
  const progress = computed(() =>
    duration.value > 0 ? (currentTime.value / duration.value) * 100 : 0,
  )

  /* ---------- volume application ---------- */
  function applyVolumes() {
    if (!pianoEl || !choirEl) return
    const effPiano =
      pianoMuted.value || choirSolo.value ? 0 : pianoVolume.value * masterVolume.value
    const effChoir =
      choirMuted.value || pianoSolo.value ? 0 : choirVolume.value * masterVolume.value
    pianoEl.volume = SAFE_VOLUME(effPiano)
    choirEl.volume = SAFE_VOLUME(effChoir)
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

    if (wasPlaying) {
      await play()
    }
    isLoading.value = false
  }

  /* ---------- events ---------- */
  function syncMetadata() {
    const pd = pianoEl?.duration ?? 0
    const cd = choirEl?.duration ?? 0
    const d = Math.max(
      Number.isFinite(pd) ? pd : 0,
      Number.isFinite(cd) ? cd : 0,
    )
    if (d > 0) duration.value = d
    ready.value = d > 0
  }

  function onTimeUpdate() {
    if (!pianoEl) return
    const t = pianoEl.currentTime
    currentTime.value = t

    if (!driftGuard && isPlaying.value && choirEl && choirEl.src) {
      const drift = Math.abs(choirEl.currentTime - t)
      if (drift > 0.08) {
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

  function onEnded() {
    if (stopTimeout) clearTimeout(stopTimeout)
    // Wait a tick; both may fire ended
    stopTimeout = setTimeout(() => {
      const pEnded = pianoEl?.ended || pianoEl?.paused
      const cEnded = !choirEl?.src || choirEl?.ended || choirEl?.paused
      if (pEnded && cEnded) {
        if (hasNext.value) next(true)
        else {
          isPlaying.value = false
        }
      }
    }, 120)
  }

  function onError(e: Event) {
    const el = e.target as HTMLAudioElement
    console.warn('Audio error', el?.error)
  }

  /* ---------- transport ---------- */
  async function play() {
    ensureElements()
    if (!pianoEl || !choirEl) return
    if (!current.value) return
    applyVolumes()
    const tasks: Promise<unknown>[] = []
    if (pianoEl.src) tasks.push(pianoEl.play().catch(() => undefined))
    if (choirEl.src) tasks.push(choirEl.play().catch(() => undefined))
    await Promise.all(tasks)
    isPlaying.value = true
  }

  function pause() {
    pianoEl?.pause()
    choirEl?.pause()
    isPlaying.value = false
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

  async function seek(time: number) {
    if (!pianoEl) return
    driftGuard = true
    pianoEl.currentTime = time
    if (choirEl && choirEl.src) choirEl.currentTime = time
    currentTime.value = time
    requestAnimationFrame(() => (driftGuard = false))
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
  async function load(
    svc: Service,
    songs: Song[],
    startIndex = 0,
    autoplay = true,
  ) {
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
    await loadActive()
    if (autoplay && current.value) await play()
  }

  function clear() {
    pause()
    queue.value = []
    index.value = -1
    service.value = null
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
    pianoSolo.value = !pianoSolo.value
    if (pianoSolo.value) choirSolo.value = false
    applyVolumes()
  }
  function toggleChoirSolo() {
    choirSolo.value = !choirSolo.value
    if (choirSolo.value) pianoSolo.value = false
    applyVolumes()
  }

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
    /* derived */
    current,
    currentSong,
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
    seek,
    next,
    prev,
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
  }
})
