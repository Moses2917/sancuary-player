<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', payload: { title: string; piano: File; choir: File }): void
}>()

const title = ref('')
const piano = ref<File | null>(null)
const choir = ref<File | null>(null)
const error = ref('')
const saving = ref(false)

watch(
  () => props.open,
  (open) => {
    if (open) {
      title.value = ''
      piano.value = null
      choir.value = null
      error.value = ''
      saving.value = false
    }
  },
)

const canSubmit = computed(() => !!piano.value && !!choir.value && !saving.value)

function pickPiano() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'audio/*'
  input.onchange = () => {
    const f = input.files?.[0]
    if (f) piano.value = f
  }
  input.click()
}
function pickChoir() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'audio/*'
  input.onchange = () => {
    const f = input.files?.[0]
    if (f) choir.value = f
  }
  input.click()
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
  // Auto-title from piano filename if left blank
  const finalTitle = title.value.trim() || stripExt(piano.value.name)
  try {
    await emit('submit', {
      title: finalTitle,
      piano: piano.value,
      choir: choir.value,
    })
    // Parent will close on success; if we get here without throw, assume ok
    saving.value = false
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not save song'
    saving.value = false
  }
}

function stripExt(name: string): string {
  return name.replace(/\.[^/.]+$/, '')
}
</script>

<template>
  <transition name="modal">
    <div v-if="open" class="overlay" @click.self="emit('close')">
      <div class="modal surface" role="dialog" aria-modal="true">
        <header class="modal__head">
          <h2>Add Song</h2>
          <button class="icon-btn" @click="emit('close')" aria-label="Close">
            <AppIcon name="x" :size="20" />
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

          <div class="drops">
            <button
              class="drop"
              :class="{ 'drop--filled': piano }"
              style="--c: var(--c-piano)"
              @click="pickPiano"
              @dragover.prevent
              @drop.prevent="dropPiano"
            >
              <AppIcon name="upload" :size="22" />
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
              <AppIcon name="upload" :size="22" />
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
            Files are stored locally in your browser (IndexedDB). They never leave this device.
          </p>
        </div>

        <footer class="modal__foot">
          <button class="btn btn--ghost" @click="emit('close')">Cancel</button>
          <button class="btn btn--primary" :disabled="!canSubmit" @click="submit">
            {{ saving ? 'Saving…' : 'Save song' }}
          </button>
        </footer>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(5, 8, 18, 0.66);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
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
  box-shadow: var(--sh-lg);
}
.modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-5) var(--sp-5) var(--sp-3);
}
.modal__head h2 {
  font-size: 1.4rem;
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
  background: color-mix(in srgb, var(--c) 10%, var(--c-bg-1));
  color: var(--c-text);
}
.drop__label {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.drop__tag {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--c);
}
.drop__name {
  font-size: 0.92rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--dur) var(--ease);
}
.modal-enter-active .modal,
.modal-leave-active .modal {
  transition:
    transform var(--dur) var(--ease),
    opacity var(--dur) var(--ease);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal,
.modal-leave-to .modal {
  transform: translateY(12px) scale(0.98);
  opacity: 0;
}
</style>
