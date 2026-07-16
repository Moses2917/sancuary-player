<script setup lang="ts">
import { ref, watch } from 'vue'
import { X } from '@lucide/vue'

const props = defineProps<{ open: boolean; defaultDate?: string }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', payload: { name: string; date: string }): void
}>()

const name = ref('')
const date = ref('')

watch(
  () => props.open,
  (open) => {
    if (open) {
      name.value = ''
      date.value = props.defaultDate ?? ''
    }
  },
)

function submit() {
  if (!name.value.trim()) return
  emit('submit', { name: name.value, date: date.value })
}
</script>

<template>
  <transition name="modal">
    <div v-if="open" class="overlay" @click.self="emit('close')">
      <div class="modal surface" role="dialog" aria-modal="true">
        <header class="modal__head">
          <h2>New service</h2>
          <button class="icon-btn" @click="emit('close')" aria-label="Close">
            <X :size="20" />
          </button>
        </header>
        <div class="modal__body">
          <div class="field">
            <label class="field__label">Name</label>
            <input
              v-model="name"
              class="input"
              type="text"
              placeholder="e.g. Sunday Morning"
              autofocus
              @keydown.enter="submit"
            />
          </div>
          <div class="field">
            <label class="field__label">Date (optional)</label>
            <input
              v-model="date"
              class="input"
              type="date"
              aria-label="Service date"
            />
          </div>
        </div>
        <footer class="modal__foot">
          <button class="btn btn--ghost" @click="emit('close')">Cancel</button>
          <button class="btn btn--primary" :disabled="!name.trim()" @click="submit">Create</button>
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
  max-width: 430px;
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
.modal__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px 18px;
  border-top: 1px solid var(--c-border);
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
