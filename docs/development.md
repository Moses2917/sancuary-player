# Development

## Prerequisites

- Node 22.18+ or 24.12+
- [Bun](https://bun.sh) 1.3.10+ for the relay
- Rust plus the Tauri host dependencies for the target OS

Windows development requires Microsoft C++ Build Tools and WebView2. macOS
requires Xcode command line tools. Linux requires WebKitGTK 4.1 development
packages. See the Tauri prerequisite guide for the full host-specific list.

## Install

```sh
bun install
```

## Desktop development

```sh
bun run tauri:dev
```

Tauri starts Vite at port 1420 and opens the native desktop window with hot
reload. The frontend communicates with Rust only through the commands in
`src-tauri/src/lib.rs`.

## Build

```sh
bun run tauri:build
```

This creates the Vue production assets, embeds them in the Tauri executable,
and produces the configured native bundles. Run builds on matching OS runners:
Windows for MSI/NSIS, macOS for app/DMG, and Linux for deb/rpm/AppImage.

Use `bun run build` to type-check and build just the frontend.

## Browser and remote development

Run `bun run relay` and `bun run dev` in separate terminals. Vite serves Player and
Remote Control (`/remote`) from the same site and proxies `/relay` to port 8787.
Keep `VITE_RELAY_URL` unset for this local proxy; use the public HTTPS/WSS addresses
in `.env.local` for production builds. Do not commit local environment files.

See [remote-control.md](./remote-control.md) for pairing, hosted deployment, and
browser autoplay/background limitations. Local native playback needs no relay.

## Tests

```sh
bun run test:unit -- --run
bun run test:e2e
bun run test:remote
bun run type-check:relay
```

Vitest uses fake IndexedDB for browser persistence and stubs audio elements,
animation frames, and Web Audio APIs instead of launching Tauri. Bridge tests run
against the shared player store in browser and mocked Tauri environments; native
SQLite persistence remains implemented by Rust. The separate remote Playwright
configuration starts a real Bun relay and covers Chromium and iPhone-sized WebKit.
Run it on a development machine without production relay URLs/services on its ports.

## Conventions

- Use Vue 3 `<script setup lang="ts">` and Pinia setup stores.
- Persist application data through `src/db/sqlite.ts` and
  the platform implementations: `src/db/browser.ts` for IndexedDB and
  `src-tauri/src/database.rs` for native SQLite.
- Imported audio stays local: SQLite BLOBs in Tauri, IndexedDB Blobs in browsers.
  Do not upload audio to the relay or introduce a media-files directory.
- Keep remote playback dispatch in the Tauri-independent shared bridge and
  protocol in `src/remote/`. Do not create another audio engine on the controller.
- Network access is opt-in for remote hosting; preserve native offline playback.
