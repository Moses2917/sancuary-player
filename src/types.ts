export interface TrackSource {
  /** When imported via file picker, we store the File blob in IndexedDB. */
  blob?: Blob
  /** Original file name, for display. */
  name: string
  /** Object URL generated at runtime from the blob, or a bundled path. */
  url?: string
  /** MIME type hint if known. */
  type?: string
}

export interface Song {
  id: string
  title: string
  piano: TrackSource
  choir: TrackSource
  /** True when audio is served from public/audio rather than a stored blob. */
  bundled: boolean
  createdAt: number
}

export interface PlaylistItem {
  /** Stable id within the playlist. */
  id: string
  songId: string
  /** 0..1 default volumes captured per service item. */
  pianoVolume: number
  choirVolume: number
}

export interface Service {
  id: string
  name: string
  /** Optional free-form date string, e.g. "June 22" or "2026-06-22". */
  date?: string
  items: PlaylistItem[]
  createdAt: number
}

export interface AppSettings {
  id: 'app'
  masterVolume: number
  lastServiceId?: string
}

export interface BundledSongManifestEntry {
  title: string
  piano: string
  choir: string
}
