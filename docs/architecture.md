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
  (`'new' | 'old'`), an optional list of `SectionMarker`s, an optional list
  of `FadeRegion`s, and an optional list of `CutRegion`s.
- **`Service`** - a named occasion (e.g. "Sunday Morning") with an ordered
  list of `PlaylistItem`s.
- **`PlaylistItem`** - references a `songId` plus captured `pianoVolume`
  and `choirVolume` defaults for that slot in the setlist.
- **`SectionMarker`** - `{ id, time, label? }` in seconds.
- **`FadeRegion`** - `{ id, start, end, toVolume? }`. Volume scales linearly
  from 1 at `start` to `toVolume` (default 0) at `end`.
- **`CutRegion`** - `{ id, start, end, fadeMs?, curve? }`. The audio between
  `start` and `end` is removed: playback jumps from `start` to `end`. A
  short volume dip around the splice, shaped by `curve`
  (`'linear' | 'equalPower' | 'ease' | 'fast'`, default `equalPower`) over
  `fadeMs` per side (default 120; 0 = hard cut), masks the join.

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
- per-track `pianoVolume`, `choirVolume`, `pianoMuted`, `choirMuted`
- `solo` (`'piano' | 'choir' | null`); `pianoSolo` / `choirSolo` are
  backward-compat derived getters
- `masterVolume` multiplier
- `loop` (A-B region) and `fadeMultiplier` (recomputed on every timeupdate)
- `pianoSinkId`, `choirSinkId`, `outputRoutingSupported`
- `resumePosition` flag and per-song `position` (stored on the Song)
- `error` banner message (null when healthy)
- derived `currentSong`, `currentMarkers`, `currentFades`, `currentCuts`

Notable behaviours:
- `onTimeUpdate` enforces drift correction (nudges the choir element back
  into sync with piano if drift exceeds 80ms), applies the active loop, and
  recomputes the fade multiplier.
- Cut (skip) regions are driven by a separate rAF "dip engine" that only
  runs while playing and the current song has cuts. Each frame it either
  ramps the cut multiplier down as the playhead approaches a cut start,
  ducks to silence + seeks both elements to the cut end + begins a fade-in
  when the playhead lands inside a cut, or ramps back up after a splice.
  The cut multiplier composes with the fade multiplier in `applyVolumes`.
  Manual seeks are clamped out of removed spans.
- `load(svc, songs, startIndex, autoplay)` resolves a service's items
  against the library, builds the queue, and starts playback. If
  `resumePosition` is on and the song has a saved `position`, the playhead
  is restored here.
- `setPianoSink` / `setChoirSink` call `HTMLMediaElement.setSinkId` on the
  underlying elements and fall back silently where unsupported.
- `panicStop` ramps `fadeMultiplier` to zero over ~450 ms via RAF, then
  pauses and rewinds. A token guards against overlapping ramps.
- `play` distinguishes total vs partial play() failures and surfaces a
  user-facing `error` instead of swallowing rejections.
- `seek`, `next`, `prev`, `playSingle` are the transport entry points.
- Cue, fade, and cut edits go through the library store, then `refreshActiveSong`
  swaps the in-queue song reference so derived computeds see the new state.
- `dispose()` tears down listeners and audio elements (used by tests and
  any future hot-reload paths).

### `useLibraryStore` (`src/stores/library.ts`)

CRUD over the songs store. Provides `addSong`, `addBundledSongs`,
`updateSong`, plus convenience wrappers `addMarker` / `removeMarker` /
`addFade` / `removeFade` / `updateFade` / `addCut` / `removeCut` /
`updateCut`. Also handles the bundled-track manifest flow
(`fetchBundledManifest`, `importBundled`).

### `useServicesStore` (`src/stores/services.ts`)

CRUD over the services store: `create`, `rename`, `remove`, `addItems`,
`reorder`, `updateItem`, `removeItem`. New items default to pianoVolume 1
and choirVolume 0.5 (choir supports rather than matches the piano).

### `useSettingsStore` (`src/stores/settings.ts`)

Loads and persists app settings (debounced writes): `masterVolume`,
`pianoSinkId`, `choirSinkId`, `resumePosition`.

## Components

- **`PlayerBar.vue`** - the floating squircle pod at the top of the main
  column. Houses transport (incl. panic stop), the waveform, loop / cue /
  fade / outputs tools, the three volume mixers, and a dismissible error
  banner. Sticky-positioned so it stays visible while the page scrolls.
- **`AudioOutputs.vue`** - popover panel for routing piano and choir to
  separate audio output devices, plus the resume-position rehearsal
  toggle. Hidden on browsers without `setSinkId` support.
- **`Waveform.vue`** - canvas renderer for the decoded peaks plus
  interactive overlays (markers, draggable fade regions with a visible
  ramp gradient, and draggable cut regions with a transition picker).
  Pointer events bind to `window` during a drag so the user can scrub
  outside the canvas. A RAF loop interpolates the playhead between
  `<audio>` timeupdates for smooth 60fps motion.
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

- **`useKeyboardShortcuts`** - Space toggles play, Arrow keys seek ±5 s
  (Shift = track skip), M/P/C mute, L loops, F drops a fade, 1-9 jump to
  cue markers, Escape stops. Ignored while typing in an input.
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
