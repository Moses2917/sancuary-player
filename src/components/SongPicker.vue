<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Song } from '@/types'
import Icon from './Icon.vue'

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
            <Icon name="x" :size="20" />
          </button>
        </header>
        <div class="modal__body">
          <input
            v-model="search"
            class="input"
            type="search"
            placeholder="Search library…"
          />
          <ul v-if="filtered.length" class="picker">
            <li
              v-for="song in filtered"
              :key="song.id"
            >
              <button
                class="pick"
                :class="{ 'pick--on': selected.has(song.id) }"
                @click="toggle(song)"
              >
                <span class="pick__check" :class="{ 'pick__check--on': selected.has(song.id) }">
                  <Icon v-if="selected.has(song.id)" name="check" :size="12" :stroke-width="3" />
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
  max-height: 80vh;
  display: flex;
  flex-direction: column;
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
  gap: var(--sp-1);
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
    border-color var(--dur-fast) var(--ease);
}
.pick:hover {
  background: var(--c-bg-2);
}
.pick--on {
  background: var(--c-bg-3);
  border-color: var(--c-accent);
  color: var(--c-text);
}
.pick__check {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  border: 2px solid var(--c-border-strong);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #1a1208;
  transition:
    background var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease);
}
.pick__check--on {
  background: var(--c-accent);
  border-color: var(--c-accent);
}
.pick__title {
  font-weight: 500;
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
