<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, X } from '@lucide/vue'
import type { Song } from '@/types'

const props = defineProps<{
  open: boolean
  songs: Song[]
  excludeIds?: string[]
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'add', songs: Song[]): void
}>()

const search = ref('')
const selected = ref<Set<string>>(new Set())

watch(
  () => props.open,
  (open) => {
    if (open) {
      search.value = ''
      selected.value = new Set()
    }
  },
)

const filtered = computed(() => {
  const exclude = new Set(props.excludeIds ?? [])
  const q = search.value.trim().toLowerCase()
  return props.songs.filter((s) => {
    if (exclude.has(s.id)) return false
    if (!q) return true
    return s.title.toLowerCase().includes(q)
  })
})

function toggle(song: Song) {
  const next = new Set(selected.value)
  if (next.has(song.id)) next.delete(song.id)
  else next.add(song.id)
  selected.value = next
}

function confirm() {
  const chosen = props.songs.filter((s) => selected.value.has(s.id))
  if (chosen.length) emit('add', chosen)
}
</script>

<template>
  <transition name="modal">
    <div v-if="open" class="overlay" @click.self="emit('close')">
      <div class="modal surface" role="dialog" aria-modal="true">
        <header class="modal__head">
          <h2>Add songs</h2>
          <button class="icon-btn" @click="emit('close')" aria-label="Close">
            <X :size="20" />
          </button>
        </header>
        <div class="modal__body">
          <input v-model="search" class="input" type="search" placeholder="Search library…" />
          <ul v-if="filtered.length" class="picker">
            <li v-for="song in filtered" :key="song.id">
              <button
                class="pick"
                :class="{ 'pick--on': selected.has(song.id) }"
                @click="toggle(song)"
              >
                <span class="pick__check" :class="{ 'pick__check--on': selected.has(song.id) }">
                  <Check v-if="selected.has(song.id)" :size="12" :stroke-width="3" />
                </span>
                <span class="pick__title">{{ song.title }}</span>
              </button>
            </li>
          </ul>
          <div v-else class="empty"><p>No songs match.</p></div>
        </div>
        <footer class="modal__foot">
          <span class="count">{{ selected.size }} selected</span>
          <div class="actions">
            <button class="btn btn--ghost" @click="emit('close')">Cancel</button>
            <button class="btn btn--primary" :disabled="selected.size === 0" @click="confirm">
              Add {{ selected.size > 0 ? selected.size : '' }}
            </button>
          </div>
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
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  border-radius: var(--r-xl);
  box-shadow: var(--sh-lg);
  overflow: hidden;
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
  padding: 0 var(--sp-5) var(--sp-3);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  overflow: hidden;
}
.picker {
  overflow-y: auto;
  max-height: 50vh;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-right: 4px;
}
.pick {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border-radius: var(--r-md);
  border: 1px solid transparent;
  background: transparent;
  color: var(--c-text-soft);
  text-align: left;
  transition:
    background var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}
.pick:hover {
  background: var(--c-bg-1);
}
.pick--on {
  background: var(--c-accent-glow);
  border-color: rgba(232, 71, 76, 0.22);
  color: var(--c-text);
}
.pick__check {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 5px;
  border: 1.5px solid var(--c-border-strong);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  transition:
    background var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease);
}
.pick__check--on {
  background: var(--c-accent);
  border-color: var(--c-accent);
}
.pick__title {
  font-weight: 550;
  font-size: 1rem;
  letter-spacing: -0.015em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.modal__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-3) var(--sp-5) var(--sp-5);
  border-top: 1px solid var(--c-border);
}
.count {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--c-text-muted);
}
.actions {
  display: flex;
  gap: var(--sp-3);
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
