<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Upload, X } from '@lucide/vue'
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

function pickPiano() {
  pianoInput.value?.click()
}
function pickChoir() {
  choirInput.value?.click()
}

function onPianoChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) piano.value = f
}
function onChoirChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) choir.value = f
}

function dropPiano(e: DragEvent) {
  const f = e.dataTransfer?.files?.[0]
  if (f && f.type.startsWith('audio')) piano.value = f
}
function dropChoir(e: DragEvent) {
  const f = e.dataTransfer?.files?.[0]
  if (f && f.type.startsWith('audio')) choir.value = f
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
    error.value = err instanceof Error ? err.message : 'Could not save song'
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
        accept="audio/*"
        class="hidden-input"
        @change="onPianoChange"
      />
      <input
        ref="choirInput"
        type="file"
        accept="audio/*"
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
  background: rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sp-5);
}
.modal {
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  overflow: auto;
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  border-radius: var(--r-xl);
  box-shadow: var(--sh-lg);
}
.modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-5) var(--sp-5) var(--sp-3);
}
.modal__head h2 {
  font-size: 1.45rem;
  font-weight: 700;
  letter-spacing: -0.025em;
}
.modal__body {
  padding: 0 var(--sp-5) var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}
.drops {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.drop {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border-radius: var(--r-md);
  border: 1.5px dashed var(--c-border-strong);
  background: var(--c-bg-1);
  color: var(--c-text-soft);
  text-align: left;
  width: 100%;
  transition:
    border-color var(--dur-fast) var(--ease),
    background var(--dur-fast) var(--ease);
}
.drop:hover {
  border-color: var(--c);
  background: var(--c-bg-2);
}
.drop--filled {
  border-style: solid;
  border-color: var(--c);
  background: color-mix(in srgb, var(--c) 7%, var(--c-bg-1));
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
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-5) var(--sp-5);
  border-top: 1px solid var(--c-border);
}

.tag-pick {
  display: inline-flex;
  gap: 2px;
  flex-wrap: wrap;
  padding: 3px;
  background: var(--c-bg-2);
  border-radius: var(--r-pill);
}
.tag-pick__opt {
  padding: 5px 14px;
  border-radius: var(--r-pill);
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
