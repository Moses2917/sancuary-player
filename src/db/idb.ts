import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { AppSettings, Service, Song } from '@/types'

interface SanctuaryDB extends DBSchema {
  songs: {
    key: string
    value: Song
    indexes: { 'by-createdAt': number }
  }
  services: {
    key: string
    value: Service
    indexes: { 'by-createdAt': number }
  }
  settings: {
    key: 'app'
    value: AppSettings
  }
}

const DB_NAME = 'sanctuary-player'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<SanctuaryDB>> | null = null

export function getDB(): Promise<IDBPDatabase<SanctuaryDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SanctuaryDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('songs')) {
          const songs = db.createObjectStore('songs', { keyPath: 'id' })
          songs.createIndex('by-createdAt', 'createdAt')
        }
        if (!db.objectStoreNames.contains('services')) {
          const services = db.createObjectStore('services', { keyPath: 'id' })
          services.createIndex('by-createdAt', 'createdAt')
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}

/* ---------------- Songs ---------------- */

export async function putSong(song: Song): Promise<void> {
  const db = await getDB()
  await db.put('songs', song)
}

export async function getAllSongs(): Promise<Song[]> {
  const db = await getDB()
  const songs = await db.getAllFromIndex('songs', 'by-createdAt')
  return songs.sort((a, b) => a.createdAt - b.createdAt)
}

export async function getSong(id: string): Promise<Song | undefined> {
  const db = await getDB()
  return db.get('songs', id)
}

export async function deleteSong(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('songs', id)
}

/* ---------------- Services ---------------- */

export async function putService(service: Service): Promise<void> {
  const db = await getDB()
  await db.put('services', service)
}

export async function getAllServices(): Promise<Service[]> {
  const db = await getDB()
  const services = await db.getAllFromIndex('services', 'by-createdAt')
  return services.sort((a, b) => a.createdAt - b.createdAt)
}

export async function getService(id: string): Promise<Service | undefined> {
  const db = await getDB()
  return db.get('services', id)
}

export async function deleteService(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('services', id)
}

/* ---------------- Settings ---------------- */

const DEFAULT_SETTINGS: AppSettings = {
  id: 'app',
  masterVolume: 0.9,
}

export async function getSettings(): Promise<AppSettings> {
  const db = await getDB()
  const stored = await db.get('settings', 'app')
  return stored ?? DEFAULT_SETTINGS
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const db = await getDB()
  const current = await getSettings()
  const next: AppSettings = { ...current, ...patch, id: 'app' }
  await db.put('settings', next)
  return next
}
