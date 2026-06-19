# Development

Day-to-day workflow, testing, and lint conventions.

## Prerequisites

- Node 22.18+ or 24.12+ (see `engines` in `package.json`)
- [Bun](https://bun.sh) as the package manager and script runner

## Install

```sh
bun install
```

## Dev server

```sh
bun dev
```

Vite serves the app at the printed URL with hot module replacement.

## Build

```sh
bun run build
```

Runs `vue-tsc --build` (type-check) and `vite build` in parallel. Output
lands in `dist/`. The PWA service worker is generated as part of the
build, so `dist/sw.js` and a `workbox-*.js` runtime will appear.

## Type checking

```sh
bun run type-check
```

Standalone `vue-tsc --build`. Useful in CI or before pushing if you only
want types without the full build.

## Tests

### Unit tests (Vitest)

```sh
bun run test:unit           # watch mode
bun run test:unit -- --run  # one-shot
```

Tests live next to the code under `__tests__/` folders. The test
environment is jsdom, with stubs in `src/__tests__/setup.ts` for things
jsdom doesn't provide:

- `fake-indexeddb/auto` for IndexedDB
- A `FakeAudioElement` class mounted as `globalThis.Audio` so the player
  store can be exercised without a real media pipeline
- A microtask-based `requestAnimationFrame` shim
- A minimal `AudioContext` stub for waveform tests

When you add a feature, add unit tests for the new code paths. Aim for at
least one happy-path and one edge-case test per public function.

### Fuzz tests

`src/utils/__tests__/fuzz.spec.ts` runs property-style iterations over the
pure utilities (time formatting, uid, backup parsing, blob round-trips,
peak extraction). Extend it when you add new pure helpers that accept
untrusted input.

### End-to-end tests (Playwright)

```sh
# First time only
npx playwright install

bun run test:e2e
```

Playwright launches a real browser and exercises the built app. It must
run against `bun run build` output, so the script builds first.

## Lint and format

```sh
bun run lint     # oxlint then eslint, both with --fix
bun run format   # prettier on src/
```

The ESLint config turns off `vue/multi-word-component-names` so single-word
component names (Waveform, PlayerBar, etc.) are allowed.

## Project conventions

- **No comments in code unless asked.** The code is meant to be
  self-documenting; if a name needs explaining, rename it.
- **Vue 3 `<script setup lang="ts">`** for all new components.
- **Pinia stores** use the composition (setup) style.
- **Deeply nested reactive objects going into IndexedDB** must be passed
  through `deepRaw` (already wired into the idb helpers) so the structured
  clone doesn't choke on Vue proxies.
- **Icons** come from [`@lucide/vue`](https://lucide.dev/guide/vue). Import
  named icons per component rather than introducing a wrapper.
- **New UI strings** should be plain and short. User-facing copy lives in
  the components; there is no i18n layer.

## Adding a new feature

A typical feature touches these layers:

1. **Types**: add or extend interfaces in `src/types.ts`.
2. **Storage**: if it needs to persist, add helpers in `src/db/idb.ts` and
   surface them in the relevant Pinia store.
3. **Store**: add state, derived computeds, and actions.
4. **Component(s)**: build or extend the UI.
5. **Tests**: unit tests for the store and any new utility; consider fuzz
   coverage for parsing-style functions.
6. **Docs**: update `docs/features.md` (and `docs/architecture.md` if the
   shape changed).

Commit each logical layer separately with a clear message.
