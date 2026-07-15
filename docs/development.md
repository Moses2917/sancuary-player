# Development

## Prerequisites

- Node 22.18+ or 24.12+
- [Bun](https://bun.sh)
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

## Tests

```sh
bun run test:unit -- --run
bun run test:e2e
```

Vitest uses a small in-memory adapter instead of launching Tauri. It also
stubs audio elements, animation frames, and Web Audio APIs. Desktop persistence
is implemented only by the Rust SQLite layer.

## Conventions

- Use Vue 3 `<script setup lang="ts">` and Pinia setup stores.
- Persist application data through `src/db/sqlite.ts` and
  `src-tauri/src/database.rs`.
- Imported audio belongs in SQLite BLOBs. Do not add browser persistence,
  cloud storage, or a media-files directory for it.
- Keep frontend calls restricted to local Tauri commands; do not introduce
  network dependencies.
