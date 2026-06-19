# Sanctuary Player

A dual-track instrumental player for worship services. Each song has separate
piano and choir stems that play in lockstep with independent volume control,
so a music director can rehearse either part or balance them live during a
service.

Songs and services are stored entirely in the browser (IndexedDB). Nothing
leaves the device. The app is installable as a PWA and works offline once
loaded.

## Quick start

```sh
bun install
bun dev
```

Open the printed URL, add a song (pick a piano file and a choir file), and
press play.

## Highlights

- Dual-track playback with independent piano / choir / master volumes
- Per-service setlists with drag-and-drop ordering and per-item mix presets
- Real waveform seek bar computed from the decoded audio
- Section markers (cues) you can drop anywhere on the timeline
- A-B loop and draggable fade-out regions
- New / Old tag on songs with library filtering
- Search for services by name, date, or song title
- Library backup (export / import JSON with blobs inlined as base64)
- Print-friendly setlist (saves cleanly as PDF)
- Full-screen "Now Playing" view for projection
- OS-level media controls (lock screen, Bluetooth, macOS Now Playing)
- Installable PWA with offline support

## Documentation

- [docs/architecture.md](./docs/architecture.md) - data model, stores, components
- [docs/features.md](./docs/features.md) - how to use each feature
- [docs/deployment.md](./docs/deployment.md) - nginx, Let's Encrypt, deploy script
- [docs/development.md](./docs/development.md) - dev workflow, tests, lint

## Tech stack

Vue 3 + Vite + TypeScript. State via Pinia. Storage via IndexedDB. Icons
from [lucide](https://lucide.dev). Tests with Vitest (unit, including fuzz)
and Playwright (e2e).

## License

Private. See the repository owner for permissions.
