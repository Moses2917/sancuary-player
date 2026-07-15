# Sanctuary Player

A dual-track instrumental player for worship services. Each song has separate
piano and choir stems that play in lockstep with independent volume control,
so a music director can rehearse either part or balance them live during a
service.

Sanctuary Player is a Tauri 2 desktop application for Windows, macOS, and
Linux. Songs, services, and settings live in a native SQLite database in the
application data directory. Imported piano and choir tracks are SQLite BLOBs;
they are never copied to a media-files directory and never leave the device.

The bundled example pair under `public/audio/` is packaged as an application
asset. The desktop app has no cloud, updater, or network dependency after it
is installed.

## Quick start

```sh
bun install
bun run tauri:dev
```

This launches the Vite frontend inside the native desktop shell. Add a song
(pick a piano file and a choir file), then press play.

## Desktop builds

```sh
bun run tauri:build
```

Build each platform on a matching host or native CI runner:

- Windows: MSI or NSIS installer with an offline WebView2 installer included.
- macOS: `.app` and DMG on macOS with Xcode installed.
- Linux: Debian, RPM, and AppImage; the AppImage bundles the media framework.

## Highlights

- Dual-track playback with independent piano / choir / master volumes
- Per-track audio output routing — send piano to the room, choir to in-ears
- Per-service setlists with drag-and-drop ordering and per-item mix presets
- Real waveform seek bar computed from the decoded audio
- Section markers (cues) you can drop anywhere on the timeline
- A-B loop and draggable fade-out regions with on-waveform ramp preview
- Cut (skip) regions that jump over a span on both stems, with a smooth
  DaVinci-style transition picker (curve + fade length)
- Panic stop (fade-out-and-stop) for moments that need to go silent now
- Optional per-song resume position for rehearsal pickup
- New / Old tag on songs with library filtering
- Search for services by name, date, or song title
- Library backup (export / import JSON with blobs inlined as base64)
- Print-friendly setlist (saves cleanly as PDF)
- Full-screen "Now Playing" view for projection
- OS-level media controls (lock screen, Bluetooth, macOS Now Playing)
- Native SQLite storage with imported audio retained as BLOBs
- Bundled demo audio packaged with the app

## Documentation

- [docs/architecture.md](./docs/architecture.md) - data model, stores, components
- [docs/features.md](./docs/features.md) - how to use each feature
- [docs/deployment.md](./docs/deployment.md) - legacy web deployment notes
- [docs/development.md](./docs/development.md) - dev workflow, tests, lint

## Tech stack

Vue 3 + Vite + TypeScript frontend, Pinia state, and a Tauri 2/Rust backend
using bundled SQLite. Icons from [lucide](https://lucide.dev). Tests use Vitest
(unit, including fuzz) and Playwright (frontend e2e).

## License

Private. See the repository owner for permissions.
