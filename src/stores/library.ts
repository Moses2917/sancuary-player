import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as idb from '@/db/idb'
import type {
  BundledSongManifestEntry,
  CutRegion,
  FadeRegion,
  SectionMarker,
  Song,
  SongTag,
  TrackSource,
} from '@/types'
import { uid } from '@/utils'

interface FetchedManifest {
  entries: BundledSongManifestEntry[]
  existingTitles: Set<string>
}

export const useLibraryStore = defineStore('library', () => {
  const songs = ref<Song[]>([])
  const ready = ref(false)
  const loading = ref(false)

  async function init() {
    if (ready.value) return
    loading.value = true
    songs.value = await idb.getAllSongs()
    ready.value = true
    loading.value = false
  }

  /** Force a re-read from idb — used after restoring a backup. */
  async function reload() {
    songs.value = await idb.getAllSongs()
  }

  function getById(id: string): Song | undefined {
    return songs.value.find((s) => s.id === id)
  }

  function buildTrack(file: File): TrackSource {
    return {
      blob: file,
      name: file.name,
      type: file.type,
    }
  }

  function stripExt(name: string): string {
    return name.replace(/\.[^/.]+$/, '')
  }

  async function addSong(input: {
    title: string
    piano: File
    choir: File
    tag?: SongTag
  }): Promise<Song> {
    // Derive a title from the piano filename when none is provided so every
    // caller (component + store API) gets consistent behaviour.
    const title = input.title.trim() || stripExt(input.piano.name) || 'Untitled'
    const song: Song = {
      id: uid('song'),
      title,
      piano: buildTrack(input.piano),
      choir: buildTrack(input.choir),
      bundled: false,
      tag: input.tag,
      createdAt: Date.now(),
    }
    await idb.putSong(song)
    songs.value = [...songs.value, song]
    return song
  }

  async function addBundledSongs(
    entries: { title: string; pianoUrl: string; choirUrl: string }[],
  ): Promise<Song[]> {
    const created: Song[] = []
    for (const entry of entries) {
      const song: Song = {
        id: uid('song'),
        title: entry.title,
        piano: { name: entry.pianoUrl.split('/').pop() ?? 'piano', url: entry.pianoUrl },
        choir: { name: entry.choirUrl.split('/').pop() ?? 'choir', url: entry.choirUrl },
        bundled: true,
        createdAt: Date.now(),
      }
      await idb.putSong(song)
      created.push(song)
    }
    songs.value = [...songs.value, ...created]
    return created
  }

  async function removeSong(id: string) {
    await idb.deleteSong(id)
    songs.value = songs.value.filter((s) => s.id !== id)
  }

  /**
   * Patch a song's mutable metadata (tag, markers, etc.) and persist it.
   *
   * The in-memory `songs` array is updated BEFORE awaiting the IndexedDB
   * write. Because async functions run synchronously up to their first
   * `await`, a caller that fires this without awaiting (e.g. an edit
   * happening during a waveform drag) still sees the new value in memory
   * immediately, so the UI can re-render instantly while the (potentially
   * multi-MB, blob-carrying) record persists in the background.
   *
   * Returns the updated song, or undefined if the song was not found.
   */
  async function updateSong(
    id: string,
    patch: Partial<Pick<Song, 'tag' | 'markers' | 'fades' | 'cuts' | 'title' | 'position'>>,
  ) {
    const song = getById(id)
    if (!song) return undefined
    const next: Song = { ...song, ...patch }
    songs.value = songs.value.map((s) => (s.id === id ? next : s))
    await idb.putSong(next)
    return next
  }

  /** Convenience: add a cue marker to a song at `time`. */
  async function addMarker(id: string, time: number, label?: string) {
    const song = getById(id)
    if (!song) return undefined
    const marker: SectionMarker = { id: uid('m'), time, label: label?.trim() || undefined }
    const markers = [...(song.markers ?? []), marker].sort((a, b) => a.time - b.time)
    return updateSong(id, { markers })
  }

  /** Convenience: remove a cue marker by id. */
  async function removeMarker(id: string, markerId: string) {
    const song = getById(id)
    if (!song || !song.markers) return undefined
    const markers = song.markers.filter((m) => m.id !== markerId)
    return updateSong(id, { markers })
  }

  /** Add a fade region to a song. */
  async function addFade(id: string, fade: Omit<FadeRegion, 'id'>) {
    const song = getById(id)
    if (!song) return undefined
    const region: FadeRegion = { id: uid('fade'), ...fade }
    const fades = [...(song.fades ?? []), region].sort((a, b) => a.start - b.start)
    const updated = await updateSong(id, { fades })
    return updated ? region : undefined
  }

  /** Remove a fade region by id. */
  async function removeFade(id: string, fadeId: string) {
    const song = getById(id)
    if (!song || !song.fades) return undefined
    const fades = song.fades.filter((f) => f.id !== fadeId)
    return updateSong(id, { fades })
  }

  /** Patch a fade region's start/end/toVolume. */
  async function updateFade(id: string, fadeId: string, patch: Partial<FadeRegion>) {
    const song = getById(id)
    if (!song || !song.fades) return undefined
    let nextFades = song.fades.map((f) => (f.id === fadeId ? { ...f, ...patch } : f))
    nextFades = [...nextFades].sort((a, b) => a.start - b.start)
    return updateSong(id, { fades: nextFades })
  }

  /** Add a cut (skip) region to a song. */
  async function addCut(id: string, cut: Omit<CutRegion, 'id'>) {
    const song = getById(id)
    if (!song) return undefined
    const region: CutRegion = { id: uid('cut'), ...cut }
    const cuts = [...(song.cuts ?? []), region].sort((a, b) => a.start - b.start)
    const updated = await updateSong(id, { cuts })
    return updated ? region : undefined
  }

  /** Remove a cut region by id. */
  async function removeCut(id: string, cutId: string) {
    const song = getById(id)
    if (!song || !song.cuts) return undefined
    const cuts = song.cuts.filter((c) => c.id !== cutId)
    return updateSong(id, { cuts })
  }

  /** Patch a cut region's start/end/fadeMs/curve. */
  async function updateCut(id: string, cutId: string, patch: Partial<CutRegion>) {
    const song = getById(id)
    if (!song || !song.cuts) return undefined
    let nextCuts = song.cuts.map((c) => (c.id === cutId ? { ...c, ...patch } : c))
    nextCuts = [...nextCuts].sort((a, b) => a.start - b.start)
    return updateSong(id, { cuts: nextCuts })
  }

  /** Fetch the manifest and report which entries aren't already imported. */
  async function fetchBundledManifest(): Promise<FetchedManifest> {
    const res = await fetch('/audio/manifest.json', { cache: 'no-cache' })
    if (!res.ok) {
      throw new Error(`Could not load manifest (HTTP ${res.status})`)
    }
    const entries = (await res.json()) as BundledSongManifestEntry[]
    const existingTitles = new Set(songs.value.filter((s) => s.bundled).map((s) => s.title))
    return { entries, existingTitles }
  }

  /** Import selected bundled entries (by title) into the library. */
  async function importBundled(titles: string[]): Promise<Song[]> {
    const { entries } = await fetchBundledManifest()
    const chosen = entries.filter((e) => titles.includes(e.title))
    if (chosen.length === 0) return []
    const created: Song[] = chosen.map((entry) => ({
      id: uid('song'),
      title: entry.title,
      piano: { name: entry.piano.split('/').pop() ?? 'piano', url: entry.piano },
      choir: { name: entry.choir.split('/').pop() ?? 'choir', url: entry.choir },
      bundled: true,
      createdAt: Date.now(),
    }))
    for (const song of created) await idb.putSong(song)
    songs.value = [...songs.value, ...created]
    return created
  }

  return {
    songs,
    ready,
    loading,
    init,
    reload,
    getById,
    addSong,
    addBundledSongs,
    removeSong,
    updateSong,
    addMarker,
    removeMarker,
    addFade,
    removeFade,
    updateFade,
    addCut,
    removeCut,
    updateCut,
    fetchBundledManifest,
    importBundled,
  }
})
