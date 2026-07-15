import * as sqlite from '@/db/sqlite'
import type { AppSettings, Service, Song, TrackSource } from '@/types'

/**
 * Library backup format.
 *
 * Blobs are inlined as base64 data URLs so a single JSON file is fully
 * portable — no separate media archive required. URL-backed (bundled)
 * tracks keep their url and skip the blob field entirely.
 */
export const BACKUP_MAGIC = 'sanctuary-player'
export const BACKUP_VERSION = 1

interface SerializableTrack {
  name: string
  type?: string
  url?: string
  /** Base64-encoded audio payload, present only for blob-backed tracks. */
  blobBase64?: string
}

interface SerializableSong extends Omit<Song, 'piano' | 'choir'> {
  piano: SerializableTrack
  choir: SerializableTrack
}

export interface BackupFile {
  app: typeof BACKUP_MAGIC
  version: typeof BACKUP_VERSION
  exportedAt: number
  songs: SerializableSong[]
  services: Service[]
  settings: AppSettings
}

/* ---------- blob <-> base64 ---------- */

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export async function blobToBase64(blob: Blob): Promise<string> {
  // Blob.arrayBuffer() is the modern API, but some environments (notably
  // fake-indexeddb in tests) return blobs without it. Fall back to the
  // universally-supported Response body reader.
  let buf: ArrayBuffer
  if (typeof blob.arrayBuffer === 'function') {
    buf = await blob.arrayBuffer()
  } else {
    buf = await new Response(blob).arrayBuffer()
  }
  return bytesToBase64(new Uint8Array(buf))
}

export function base64ToBlob(b64: string, type = 'application/octet-stream'): Blob {
  // Cast around the Uint8Array<ArrayBufferLike> -> BlobPart variance quirk
  // in the DOM typings (buffer may conceptually be a SharedArrayBuffer).
  return new Blob([base64ToBytes(b64) as unknown as BlobPart], { type })
}

/* ---------- serialization ---------- */

async function serializeTrack(track: TrackSource): Promise<SerializableTrack> {
  const out: SerializableTrack = { name: track.name, type: track.type, url: track.url }
  if (track.blob) {
    out.blobBase64 = await blobToBase64(track.blob)
    if (!out.type) out.type = track.blob.type
  }
  return out
}

function deserializeTrack(track: SerializableTrack): TrackSource {
  const out: TrackSource = { name: track.name, type: track.type }
  if (track.blobBase64) {
    out.blob = base64ToBlob(track.blobBase64, track.type || 'application/octet-stream')
  } else {
    out.url = track.url
  }
  return out
}

export async function buildBackup(): Promise<BackupFile> {
  const { songs, services, settings } = await sqlite.dumpAll()
  const serialSongs: SerializableSong[] = []
  for (const song of songs) {
    serialSongs.push({
      ...song,
      piano: await serializeTrack(song.piano),
      choir: await serializeTrack(song.choir),
    })
  }
  return {
    app: BACKUP_MAGIC,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    songs: serialSongs,
    services,
    settings,
  }
}

export interface RestoreResult {
  songs: number
  services: number
}

export function parseBackup(text: string): BackupFile {
  const data = JSON.parse(text) as Partial<BackupFile>
  if (data.app !== BACKUP_MAGIC) {
    throw new Error('This file is not a Sanctuary Player backup.')
  }
  if (typeof data.version !== 'number') {
    throw new Error('Backup is missing a version field.')
  }
  if (!Array.isArray(data.songs) || !Array.isArray(data.services)) {
    throw new Error('Backup is missing songs or services.')
  }
  return data as BackupFile
}

/**
 * Restore a backup. If `mode` is 'replace', every existing record is wiped
 * first; if 'merge', records are upserted by id (incoming wins on conflict).
 */
export async function restoreBackup(
  backup: BackupFile,
  mode: 'replace' | 'merge' = 'merge',
): Promise<RestoreResult> {
  const songs: Song[] = backup.songs.map((s) => ({
    ...s,
    piano: deserializeTrack(s.piano),
    choir: deserializeTrack(s.choir),
  }))
  const payload = { songs, services: backup.services, settings: backup.settings }
  if (mode === 'replace') {
    await sqlite.restoreAll(payload)
  } else {
    await sqlite.mergeAll(payload)
  }
  return { songs: songs.length, services: backup.services.length }
}

/* ---------- file helpers ---------- */

export function downloadBackup(backup: BackupFile): void {
  const date = new Date(backup.exportedAt).toISOString().slice(0, 10)
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sanctuary-player-backup-${date}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the click has time to register.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function pickBackupFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    // If the user cancels, the file picker never fires change; we can't
    // detect that reliably, so resolve null only after they pick something.
    input.click()
  })
}
