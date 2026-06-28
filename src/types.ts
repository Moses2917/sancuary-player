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

/**
 * Free-form, neutral "New / Old" label. Treated purely as a coloured badge
 * and a filter facet — no semantic meaning is enforced.
 */
export type SongTag = 'new' | 'old'

/** A named cue point on a song's timeline, e.g. "Intro" or "Verse 1". */
export interface SectionMarker {
  id: string
  /** Seconds from the start of the track. */
  time: number
  label?: string
}

/**
 * A fade-out region on a song's timeline. While playback is inside the
 * region, every track's effective volume is scaled linearly from its
 * normal value (at `start`) down to `toVolume` (at `end`).
 */
export interface FadeRegion {
  id: string
  /** Seconds from the start of the track. */
  start: number
  /** Seconds from the start of the track; must be > start. */
  end: number
  /** Target volume multiplier at `end`. Default 0 = full fade-out. */
  toVolume?: number
}

/**
 * Fade curve shape used by the cut-region splice ramp. Mirrors the common
 * crossfade options found in NLEs (DaVinci Resolve / Fairlight): linear
 * (constant gain), equal-power (constant power, the smoothest default),
 * ease (S-curve), and fast (exponential).
 */
export type CutCurve = 'linear' | 'equalPower' | 'ease' | 'fast'

/**
 * A cut (skip) region on a song's timeline. The audio between `start` and
 * `end` is removed from playback: when the playhead reaches `start` it
 * jumps to `end`. A short volume "dip" (fade out → jump → fade in) shaped
 * by `curve` over `fadeMs` per side masks the splice so it's inaudible.
 * Applied to every track in lockstep (the player already drives them together).
 */
export interface CutRegion {
  id: string
  /** Seconds from the start of the track; the last moment kept before the jump. */
  start: number
  /** Seconds from the start of the track; where playback resumes. Must be > start. */
  end: number
  /** Smoothing ramp length in milliseconds, applied to each side of the dip. 0 = hard cut. */
  fadeMs?: number
  /** Fade curve shape for the dip. Defaults to equalPower. */
  curve?: CutCurve
}

export interface Song {
  id: string
  title: string
  piano: TrackSource
  choir: TrackSource
  /** True when audio is served from public/audio rather than a stored blob. */
  bundled: boolean
  /** Optional neutral tag rendered as a badge and used as a filter facet. */
  tag?: SongTag
  /** Saved cue points for this song, shown on the waveform. */
  markers?: SectionMarker[]
  /** Saved fade regions for this song, applied during playback. */
  fades?: FadeRegion[]
  /** Saved cut (skip) regions for this song; playback jumps over each one. */
  cuts?: CutRegion[]
  /** Last-known playhead position in seconds; used by "resume position" rehearsal mode. */
  position?: number
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
  /** SinkId (per HTMLMediaElement.setSinkId) for the piano track. '' = system default. */
  pianoSinkId?: string
  /** SinkId for the choir track. '' = system default. */
  choirSinkId?: string
  /** When true, save and restore the per-song playhead position (rehearsal mode). */
  resumePosition?: boolean
}

export interface BundledSongManifestEntry {
  title: string
  piano: string
  choir: string
}
