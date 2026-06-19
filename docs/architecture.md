# Architecture

This document describes how the codebase is laid out and how the major
pieces fit together.

## Directory layout

```
src/
  assets/        Theme tokens, base styles, print stylesheet, PWA bits
  components/    Reusable UI components
  composables/   useKeyboardShortcuts, useMediaSession
  db/            IndexedDB wrapper (src/db/idb.ts)
  router/        Vue Router config
  stores/        Pinia stores (player, library, services, settings)
  utils/         waveform peak extraction, backup serialize/restore, formatting
  views/         Routed top-level views
  types.ts       Shared TypeScript types (Song, Service, etc.)
```

## Data model

Defined in `src/types.ts`. The shape that matters most:

- **`Song`** - has `piano` and `choir` `TrackSource`s, an optional `tag`
  (`'new' | 'old'`), an optional list of `SectionMarker`s, and an optional
  list of `FadeRegion`s.
- **`Service`** - a named occasion (e.g. "Sunday Morning") with an ordered
  list of `PlaylistItem`s.
- **`PlaylistItem`** - references a `songId` plus captured `pianoVolume`
  and `choirVolume` defaults for that slot in the setlist.
- **`SectionMarker`** - `{ id, time, label? }` in seconds.
- **`FadeRegion`** - `{ id, start, end, toVolume? }`. Volume scales linearly
  from 1 at `start` to `toVolume` (default 0) at `end`.

`TrackSource` is one of two shapes:
- a stored `Blob` (when the user picked a file; lives in IndexedDB), or
- a `url` string (for bundled demo tracks shipped under `public/audio/`).

## Storage layer

`src/db/idb.ts` opens a single database with three object stores: `songs`,
`services`, `settings`. A `deepRaw` helper unwraps Vue reactive proxies
before writing so IndexedDB's structured clone doesn't choke on them.

Public helpers:
- `putSong` / `getAllSongs` / `getSong` / `deleteSong`
- `putService` / `getAllServices` / `getService` / `deleteService`
- `getSettings` / `saveSettings`
- `dumpAll` / `restoreAll` / `mergeAll` (used by backup export/import)

## Pinia stores

### `usePlayerStore` (`src/stores/player.ts`)

The heart of the app. Owns two non-reactive `<audio>` elements (piano and
choir) and drives them together so they stay sample-locked. Key state:

- `service`, `queue`, `index`, `isPlaying`, `currentTime`, `duration`
- per-track `pianoVolume`, `choirVolume`, mute / solo flags
- `masterVolume` multiplier
- `loop` (A-B region) and `fadeMultiplier` (recomputed on every timeupdate)
- derived `currentSong`, `currentMarkers`, `currentFades`

Notable behaviours:
- `onTimeUpdate` enforces drift correction (nudges the choir element back
  into sync with piano if drift exceeds 80ms), applies the active loop, and
  recomputes the fade multiplier.
- `load(svc, songs, startIndex, autoplay)` resolves a service's items
  against the library, builds the queue, and starts playback.
- `seek`, `next`, `prev`, `playSingle` are the transport entry points.
- Cue and fade edits go through the library store, then `refreshActiveSong`
  swaps the in-queue song reference so derived computeds see the new state.

### `useLibraryStore` (`src/stores/library.ts`)

CRUD over the songs store. Provides `addSong`, `addBundledSongs`,
`updateSong`, plus convenience wrappers `addMarker` / `removeMarker` /
`addFade` / `removeFade` / `updateFade`. Also handles the bundled-track
manifest flow (`fetchBundledManifest`, `importBundled`).

### `useServicesStore` (`src/stores/services.ts`)

CRUD over the services store: `create`, `rename`, `remove`, `addItems`,
`reorder`, `updateItem`, `removeItem`. New items default to pianoVolume 1
and choirVolume 0.5 (choir supports rather than matches the piano).

### `useSettingsStore` (`src/stores/settings.ts`)

Loads and persists the master volume (debounced writes).

## Components

- **`PlayerBar.vue`** - the floating squircle pod at the top of the main
  column. Houses transport, the waveform, loop / cue / fade tools, and the
  three volume mixers. Sticky-positioned so it stays visible while the page
  scrolls.
- **`Waveform.vue`** - canvas renderer for the decoded peaks plus
  interactive overlays (markers, draggable fade regions). Pointer events
  bind to `window` during a drag so the user can scrub outside the canvas.
  A RAF loop interpolates the playhead between `<audio>` timeupdates for
  smooth 60fps motion.
- **`VolumeSlider.vue`** - styled range input with optional percentage
  readout.
- **`PlaylistRow.vue`**, **`SongPicker.vue`**, **`SongImporter.vue`**,
  **`BundledLoader.vue`**, **`ServiceEditor.vue`**, **`ServiceCard.vue`** -
  the supporting UI for setlists and library management.

## Views and routes

Defined in `src/router/index.ts`:

- `/services` - grid of service cards with search
- `/services/:id` - setlist editor + playback entry point
- `/library` - song library with tag filter, search, and backup tools
- `/now-playing` - bare full-screen projection view (no app chrome)

The Now Playing route sets `meta.bare: true`, which `App.vue` uses to hide
the header and player pod.

## Composables

- **`useKeyboardShortcuts`** - Space toggles play, Shift+Arrow steps
  tracks, Escape stops.
- **`useMediaSession`** - bridges the player to the OS Media Session API
  (lock screen controls, Bluetooth media buttons). No-ops gracefully when
  the API is unavailable.

## Peak extraction

`src/utils/waveform.ts` decodes the audio via Web Audio's
`decodeAudioData`, downsamples to N buckets by taking the loudest sample in
each bucket, and normalizes to 0..1. Results are cached per song id so
seeking back to the intro doesn't re-decode a 10 MB file.

## Backup format

`src/utils/backup.ts` serializes the entire library to a single JSON file.
Blobs are inlined as base64 so the file is fully portable. The format is
versioned:

```ts
interface BackupFile {
  app: 'sanctuary-player'
  version: 1
  exportedAt: number
  songs: SerializableSong[]
  services: Service[]
  settings: AppSettings
}
```

Restore supports two modes: `replace` (wipe then write) or `merge` (upsert
by id; incoming wins on conflict).
