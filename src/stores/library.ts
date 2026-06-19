import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as idb from '@/db/idb'
import type { BundledSongManifestEntry, SectionMarker, Song, SongTag, TrackSource } from '@/types'
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
   * Returns the updated song, or undefined if the song was not found.
   */
  async function updateSong(id: string, patch: Partial<Pick<Song, 'tag' | 'markers' | 'title'>>) {
    const song = getById(id)
    if (!song) return undefined
    const next: Song = { ...song, ...patch }
    await idb.putSong(next)
    songs.value = songs.value.map((s) => (s.id === id ? next : s))
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
    fetchBundledManifest,
    importBundled,
  }
})
