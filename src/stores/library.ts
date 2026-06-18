import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as idb from '@/db/idb'
import type { Song, TrackSource } from '@/types'
import { uid } from '@/utils'

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

  async function addSong(input: {
    title: string
    piano: File
    choir: File
  }): Promise<Song> {
    const song: Song = {
      id: uid('song'),
      title: input.title.trim() || 'Untitled',
      piano: buildTrack(input.piano),
      choir: buildTrack(input.choir),
      bundled: false,
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

  return {
    songs,
    ready,
    loading,
    init,
    getById,
    addSong,
    addBundledSongs,
    removeSong,
  }
})
