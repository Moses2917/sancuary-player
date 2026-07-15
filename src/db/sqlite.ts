import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import type { AppSettings, Service, Song, TrackSource } from '@/types'
import { uid } from '@/utils'

type StoreName = 'songs' | 'services' | 'settings'

const DEFAULT_SETTINGS: AppSettings = {
  id: 'app',
  masterVolume: 0.9,
}

const memory = {
  songs: new Map<string, Song>(),
  services: new Map<string, Service>(),
  settings: new Map<string, AppSettings>(),
}
const MEMORY_KEY = 'sanctuary-player-test-storage'
let memoryLoaded = false

function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function loadMemory(): void {
  if (memoryLoaded || typeof localStorage === 'undefined') return
  memoryLoaded = true
  try {
    const saved = JSON.parse(localStorage.getItem(MEMORY_KEY) ?? '{}') as {
      songs?: Song[]
      services?: Service[]
      settings?: AppSettings
    }
    for (const song of saved.songs ?? []) memory.songs.set(song.id, song)
    for (const service of saved.services ?? []) memory.services.set(service.id, service)
    if (saved.settings) memory.settings.set('app', saved.settings)
  } catch {
    localStorage.removeItem(MEMORY_KEY)
  }
}

function saveMemory(): void {
  if (typeof localStorage === 'undefined') return
  const songs = [...memory.songs.values()].map(songForStorage)
  localStorage.setItem(
    MEMORY_KEY,
    JSON.stringify({ songs, services: [...memory.services.values()], settings: memory.settings.get('app') }),
  )
}

function requireDesktop(): void {
  if (!isDesktopApp()) {
    throw new Error('Sanctuary Player storage is available only in the desktop app.')
  }
}

function clone<T>(value: T): T {
  if (value instanceof Blob || (typeof File !== 'undefined' && value instanceof File)) return value
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) out[key] = clone(item)
    return out as T
  }
  return value
}

function mediaUrl(songId: string, track: 'piano' | 'choir'): string {
  return convertFileSrc(`${songId}/${track}`, 'sanctuary-media')
}

function hydrateSong(song: Song): Song {
  const hydrated = clone(song)
  if (!hydrated.bundled) {
    hydrated.piano = { ...hydrated.piano, url: mediaUrl(hydrated.id, 'piano') }
    hydrated.choir = { ...hydrated.choir, url: mediaUrl(hydrated.id, 'choir') }
  }
  return hydrated
}

function songForStorage(song: Song): Song {
  const stored = clone(song)
  for (const track of [stored.piano, stored.choir]) {
    delete track.blob
    if (!stored.bundled) delete track.url
  }
  return stored
}

async function stageAudio(uploadId: string, kind: 'piano' | 'choir', track: TrackSource) {
  if (!track.blob) return
  const data = new Uint8Array(await track.blob.arrayBuffer())
  await invoke<void>('stage_audio', data, {
    headers: {
      'X-Sanctuary-Upload-Id': uploadId,
      'X-Sanctuary-Track': kind,
      'X-Sanctuary-Mime': track.type || track.blob.type || 'application/octet-stream',
    },
  })
}

async function readAudioBlob(songId: string, track: 'piano' | 'choir', type?: string): Promise<Blob> {
  const data = await invoke<ArrayBuffer | Uint8Array>('read_audio_blob', { songId, track })
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  return new Blob([bytes as unknown as BlobPart], { type: type || 'application/octet-stream' })
}

export async function getDB(): Promise<{ clear: (store: StoreName) => Promise<void> }> {
  if (isDesktopApp()) {
    throw new Error('Direct database access is not available in the desktop app.')
  }
  return {
    async clear(store) {
      loadMemory()
      memory[store].clear()
      saveMemory()
    },
  }
}

export async function putSong(song: Song): Promise<void> {
  if (!isDesktopApp()) {
    loadMemory()
    memory.songs.set(song.id, clone(song))
    saveMemory()
    return
  }
  const uploadId = song.bundled || (!song.piano.blob && !song.choir.blob) ? undefined : uid('upload')
  if (uploadId) {
    if (!song.piano.blob || !song.choir.blob) {
      throw new Error('Both piano and choir tracks are required.')
    }
    await stageAudio(uploadId, 'piano', song.piano)
    await stageAudio(uploadId, 'choir', song.choir)
  }
  await invoke<void>('put_song', { song: songForStorage(song), uploadId })
}

export async function getAllSongs(): Promise<Song[]> {
  if (!isDesktopApp()) {
    loadMemory()
    return [...memory.songs.values()]
      .map((song) => clone(song))
      .sort((a, b) => a.createdAt - b.createdAt)
  }
  requireDesktop()
  const songs = await invoke<Song[]>('get_all_songs')
  return songs.map(hydrateSong)
}

export async function getSong(id: string): Promise<Song | undefined> {
  if (!isDesktopApp()) {
    loadMemory()
    return clone(memory.songs.get(id))
  }
  requireDesktop()
  const song = await invoke<Song | null>('get_song', { id })
  return song ? hydrateSong(song) : undefined
}

export async function deleteSong(id: string): Promise<void> {
  if (!isDesktopApp()) {
    loadMemory()
    memory.songs.delete(id)
    saveMemory()
    return
  }
  requireDesktop()
  await invoke<void>('delete_song', { id })
}

export async function putService(service: Service): Promise<void> {
  if (!isDesktopApp()) {
    loadMemory()
    memory.services.set(service.id, clone(service))
    saveMemory()
    return
  }
  requireDesktop()
  await invoke<void>('put_service', { service: clone(service) })
}

export async function getAllServices(): Promise<Service[]> {
  if (!isDesktopApp()) {
    loadMemory()
    return [...memory.services.values()]
      .map((service) => clone(service))
      .sort((a, b) => a.createdAt - b.createdAt)
  }
  requireDesktop()
  return invoke<Service[]>('get_all_services')
}

export async function getService(id: string): Promise<Service | undefined> {
  if (!isDesktopApp()) {
    loadMemory()
    return clone(memory.services.get(id))
  }
  requireDesktop()
  return (await invoke<Service | null>('get_service', { id })) ?? undefined
}

export async function deleteService(id: string): Promise<void> {
  if (!isDesktopApp()) {
    loadMemory()
    memory.services.delete(id)
    saveMemory()
    return
  }
  requireDesktop()
  await invoke<void>('delete_service', { id })
}

export async function getSettings(): Promise<AppSettings> {
  if (!isDesktopApp()) {
    loadMemory()
    return clone(memory.settings.get('app') ?? DEFAULT_SETTINGS)
  }
  requireDesktop()
  return (await invoke<AppSettings | null>('get_settings')) ?? clone(DEFAULT_SETTINGS)
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next: AppSettings = { ...(await getSettings()), ...clone(patch), id: 'app' }
  if (!isDesktopApp()) {
    loadMemory()
    memory.settings.set('app', next)
    saveMemory()
    return clone(next)
  }
  requireDesktop()
  await invoke<void>('save_settings', { settings: next })
  return next
}

export async function dumpAll(): Promise<{
  songs: Song[]
  services: Service[]
  settings: AppSettings
}> {
  const [songs, services, settings] = await Promise.all([
    getAllSongs(),
    getAllServices(),
    getSettings(),
  ])
  if (!isDesktopApp()) return { songs, services, settings }
  const songsWithAudio = await Promise.all(
    songs.map(async (song) => {
      if (song.bundled) return song
      return {
        ...song,
        piano: {
          ...song.piano,
          blob: await readAudioBlob(song.id, 'piano', song.piano.type),
        },
        choir: {
          ...song.choir,
          blob: await readAudioBlob(song.id, 'choir', song.choir.type),
        },
      }
    }),
  )
  return { songs: songsWithAudio, services, settings }
}

export async function restoreAll(input: {
  songs: Song[]
  services: Service[]
  settings?: AppSettings
}): Promise<void> {
  if (!isDesktopApp()) {
    loadMemory()
    memory.songs.clear()
    memory.services.clear()
    memory.settings.clear()
    for (const song of input.songs) memory.songs.set(song.id, clone(song))
    for (const service of input.services) memory.services.set(service.id, clone(service))
    if (input.settings) memory.settings.set('app', clone(input.settings))
    saveMemory()
    return
  }
  requireDesktop()
  await invoke<void>('clear_all')
  for (const song of input.songs) await putSong(song)
  for (const service of input.services) await putService(service)
  if (input.settings) await saveSettings(input.settings)
}

export async function mergeAll(input: {
  songs?: Song[]
  services?: Service[]
  settings?: AppSettings
}): Promise<void> {
  for (const song of input.songs ?? []) await putSong(song)
  for (const service of input.services ?? []) await putService(service)
  if (input.settings) await saveSettings(input.settings)
}
