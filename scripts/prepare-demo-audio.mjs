import { copyFile, mkdir } from 'node:fs/promises'
const output = new URL('../public/audio/', import.meta.url)

await mkdir(output, { recursive: true })
await Promise.all([
  copyFile(new URL('../e2e/fixtures/piano-2.wav', import.meta.url), new URL('example-hymn-piano.wav', output)),
  copyFile(new URL('../e2e/fixtures/choir-2.wav', import.meta.url), new URL('example-hymn-choir.wav', output)),
])
