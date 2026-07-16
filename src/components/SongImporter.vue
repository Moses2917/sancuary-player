<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Upload, X } from '@lucide/vue'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import { useLibraryStore } from '@/stores/library'
import type { SongTag } from '@/types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
  (e: 'saved-song', song: { id: string }): void
}>()

const library = useLibraryStore()

const title = ref('')
const tag = ref<SongTag | ''>('')
const piano = ref<File | null>(null)
const choir = ref<File | null>(null)
const error = ref('')
const saving = ref(false)
const audioExtensions = [
  'aac',
  'aif',
  'aiff',
  'flac',
  'm4a',
  'mp3',
  'ogg',
  'oga',
  'opus',
  'wav',
  'wave',
  'webm',
]
const audioAccept = audioExtensions.map((extension) => `.${extension}`).join(',')
const audioExtension = new RegExp(`\\.(${audioExtensions.join('|')})$`, 'i')

// Persistent hidden file inputs attached to the DOM so the change event
// fires reliably across browsers (detached inputs created via
// document.createElement are flaky and can silently never fire).
const pianoInput = ref<HTMLInputElement | null>(null)
const choirInput = ref<HTMLInputElement | null>(null)

watch(
  () => props.open,
  (open) => {
    if (open) reset()
  },
)

function reset() {
  title.value = ''
  tag.value = ''
  piano.value = null
  choir.value = null
  error.value = ''
  saving.value = false
  if (pianoInput.value) pianoInput.value.value = ''
  if (choirInput.value) choirInput.value.value = ''
}

const canSubmit = computed(() => !!piano.value && !!choir.value && !saving.value)

function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() || 'audio'
}

function audioMimeType(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase()
  const mimeTypes: Record<string, string> = {
    aac: 'audio/aac',
    aif: 'audio/aiff',
    aiff: 'audio/aiff',
    flac: 'audio/flac',
    m4a: 'audio/mp4',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    opus: 'audio/opus',
    wav: 'audio/wav',
    wave: 'audio/wav',
    webm: 'audio/webm',
  }
  return mimeTypes[extension ?? ''] ?? 'application/octet-stream'
}

async function fileFromDesktopPath(path: string): Promise<File> {
  const name = fileNameFromPath(path)
  const data = await readFile(path)
  return new File([data], name, { type: audioMimeType(name) })
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message
  }
  return typeof error === 'string' ? error : fallback
}

async function pickTrack(kind: 'piano' | 'choir') {
  if (!isDesktopApp()) {
    const input = kind === 'piano' ? pianoInput : choirInput
    input.value?.click()
    return
  }

  try {
    const path = await openFileDialog({
      title: `Choose ${kind} audio file`,
      multiple: false,
      directory: false,
      filters: [{ name: 'Audio files', extensions: audioExtensions }],
    })
    if (!path) return
    assignTrack(kind, await fileFromDesktopPath(path))
  } catch (err) {
    error.value = errorMessage(err, 'Could not read the selected audio file.')
  }
}

function pickPiano() {
  void pickTrack('piano')
}
function pickChoir() {
  void pickTrack('choir')
}

function isAudioFile(file: File) {
  return file.type.startsWith('audio/') || audioExtension.test(file.name)
}

function assignTrack(kind: 'piano' | 'choir', file: File) {
  if (!isAudioFile(file)) {
    error.value = 'Choose an audio file (for example WAV, MP3, M4A, FLAC, or OGG).'
    return
  }
  error.value = ''
  if (kind === 'piano') piano.value = file
  else choir.value = file
}

function onPianoChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) assignTrack('piano', f)
}
function onChoirChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) assignTrack('choir', f)
}

function dropPiano(e: DragEvent) {
  const f = e.dataTransfer?.files?.[0]
  if (f) assignTrack('piano', f)
}
function dropChoir(e: DragEvent) {
  const f = e.dataTransfer?.files?.[0]
  if (f) assignTrack('choir', f)
}

async function submit() {
  if (!piano.value || !choir.value) return
  saving.value = true
  error.value = ''
  try {
    const song = await library.addSong({
      title: title.value,
      piano: piano.value,
      choir: choir.value,
      tag: tag.value || undefined,
    })
    emit('saved-song', { id: song.id })
    emit('saved')
  } catch (err) {
    error.value = errorMessage(err, 'Could not save song')
    saving.value = false
  }
}
</script>

<template>
  <transition name="modal">
    <div v-if="open" class="overlay" @click.self="emit('close')">
      <div class="modal surface" role="dialog" aria-modal="true">
        <header class="modal__head">
          <h2>Add Song</h2>
          <button class="icon-btn" @click="emit('close')" aria-label="Close">
            <X :size="20" />
          </button>
        </header>

        <div class="modal__body">
          <div class="field">
            <label class="field__label">Title</label>
            <input
              v-model="title"
              class="input"
              type="text"
              placeholder="e.g. Amazing Grace (optional — derived from file)"
            />
          </div>

          <div class="field">
            <span class="field__label">Tag (optional)</span>
            <div class="tag-pick" role="radiogroup" aria-label="Song tag">
              <button
                type="button"
                class="tag-pick__opt"
                :class="{ 'tag-pick__opt--on': tag === '' }"
                @click="tag = ''"
              >
                None
              </button>
              <button
                type="button"
                class="tag-pick__opt tag-pick__opt--new"
                :class="{ 'tag-pick__opt--on': tag === 'new' }"
                @click="tag = 'new'"
              >
                New
              </button>
              <button
                type="button"
                class="tag-pick__opt tag-pick__opt--old"
                :class="{ 'tag-pick__opt--on': tag === 'old' }"
                @click="tag = 'old'"
              >
                Old
              </button>
            </div>
          </div>

          <div class="drops">
            <button
              class="drop"
              :class="{ 'drop--filled': piano }"
              style="--c: var(--c-piano)"
              @click="pickPiano"
              @dragover.prevent
              @drop.prevent="dropPiano"
            >
              <Upload :size="22" />
              <div class="drop__label">
                <span class="drop__tag">Piano track</span>
                <span class="drop__name" :title="piano?.name">
                  {{ piano ? piano.name : 'Click or drop audio file' }}
                </span>
              </div>
            </button>

            <button
              class="drop"
              :class="{ 'drop--filled': choir }"
              style="--c: var(--c-choir)"
              @click="pickChoir"
              @dragover.prevent
              @drop.prevent="dropChoir"
            >
              <Upload :size="22" />
              <div class="drop__label">
                <span class="drop__tag">Choir track</span>
                <span class="drop__name" :title="choir?.name">
                  {{ choir ? choir.name : 'Click or drop audio file' }}
                </span>
              </div>
            </button>
          </div>

          <p v-if="error" class="error">{{ error }}</p>
          <p class="hint">
            Files are stored locally in this app's SQLite library. They never leave this device.
          </p>
        </div>

        <footer class="modal__foot">
          <button class="btn btn--ghost" @click="emit('close')">Cancel</button>
          <button class="btn btn--primary" :disabled="!canSubmit" @click="submit">
            {{ saving ? 'Saving…' : 'Save song' }}
          </button>
        </footer>
      </div>

      <!-- Hidden, DOM-attached file inputs (kept across opens so change events fire) -->
      <input
        ref="pianoInput"
        type="file"
        :accept="audioAccept"
        class="hidden-input"
        @change="onPianoChange"
      />
      <input
        ref="choirInput"
        type="file"
        :accept="audioAccept"
        class="hidden-input"
        @change="onChoirChange"
      />
    </div>
  </transition>
</template>

<style scoped>
.hidden-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sp-5);
}
.modal {
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow: auto;
  background: rgba(250, 250, 252, 0.96);
  border: 1px solid var(--c-border);
  border-radius: 13px;
  box-shadow: var(--sh-lg);
}
.modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 12px;
}
.modal__head h2 {
  font-size: 1.08rem;
  font-weight: 650;
  letter-spacing: -0.02em;
}
.modal__body {
  padding: 0 20px 18px;
  display: flex;
  flex-direction: column;
  gap: 15px;
}
.drops {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.drop {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 13px 14px;
  border-radius: 9px;
  border: 1px solid var(--c-border);
  background: rgba(255, 255, 255, 0.68);
  color: var(--c-text-soft);
  text-align: left;
  width: 100%;
  transition:
    border-color var(--dur-fast) var(--ease),
    background var(--dur-fast) var(--ease);
}
.drop:hover {
  border-color: color-mix(in srgb, var(--c) 44%, var(--c-border));
  background: #fff;
}
.drop--filled {
  border-style: solid;
  border-color: var(--c);
  background: color-mix(in srgb, var(--c) 7%, #fff);
  color: var(--c-text);
}
.drop__label {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.drop__tag {
  font-size: 0.66rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--c);
}
.drop__name {
  font-size: 0.92rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
  letter-spacing: -0.01em;
}
.error {
  color: var(--c-danger);
  font-size: 0.85rem;
}
.hint {
  color: var(--c-text-muted);
  font-size: 0.78rem;
}
.modal__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px 18px;
  border-top: 1px solid var(--c-border);
}

.tag-pick {
  display: inline-flex;
  align-self: flex-start;
  width: fit-content;
  gap: 2px;
  flex-wrap: wrap;
  padding: 3px;
  background: var(--c-bg-2);
  border-radius: 7px;
}
.tag-pick__opt {
  padding: 5px 14px;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: var(--c-text-muted);
  font-size: 0.82rem;
  font-weight: 550;
  letter-spacing: -0.005em;
  transition:
    background var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease),
    box-shadow var(--dur-fast) var(--ease);
}
.tag-pick__opt:hover {
  color: var(--c-text);
}
.tag-pick__opt--on {
  background: var(--c-surface-raised);
  color: var(--c-text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--dur) var(--ease);
}
.modal-enter-active .modal,
.modal-leave-active .modal {
  transition:
    transform var(--dur) var(--ease-out),
    opacity var(--dur) var(--ease);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal,
.modal-leave-to .modal {
  transform: translateY(8px) scale(0.985);
  opacity: 0;
}
</style>
