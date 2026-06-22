<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, X } from '@lucide/vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'import', titles: string[]): void
}>()

interface Row {
  title: string
  alreadyImported: boolean
  checked: boolean
}

const rows = ref<Row[]>([])
const error = ref('')
const loading = ref(false)

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    error.value = ''
    rows.value = []
    loading.value = true
    try {
      const { useLibraryStore } = await import('@/stores/library')
      const lib = useLibraryStore()
      const { entries, existingTitles } = await lib.fetchBundledManifest()
      rows.value = entries.map((e) => ({
        title: e.title,
        alreadyImported: existingTitles.has(e.title),
        checked: !existingTitles.has(e.title),
      }))
    } catch (err) {
      error.value =
        err instanceof Error
          ? err.message
          : 'Could not read bundled manifest. See public/audio/README.md.'
    } finally {
      loading.value = false
    }
  },
)

const selected = computed(() => rows.value.filter((r) => r.checked && !r.alreadyImported))

function toggle(row: Row) {
  if (row.alreadyImported) return
  row.checked = !row.checked
}

function confirm() {
  emit(
    'import',
    selected.value.map((r) => r.title),
  )
}
</script>

<template>
  <transition name="modal">
    <div v-if="open" class="overlay" @click.self="emit('close')">
      <div class="modal surface" role="dialog" aria-modal="true">
        <header class="modal__head">
          <div>
            <h2>Load bundled songs</h2>
            <p class="modal__sub">From <code>public/audio/manifest.json</code></p>
          </div>
          <button class="icon-btn" @click="emit('close')" aria-label="Close">
            <X :size="20" />
          </button>
        </header>

        <div class="modal__body">
          <div v-if="loading" class="empty"><p>Reading manifest…</p></div>
          <div v-else-if="error" class="empty">
            <h3>Manifest unavailable</h3>
            <p>{{ error }}</p>
          </div>
          <div v-else-if="rows.length === 0" class="empty">
            <p>No bundled songs declared.</p>
          </div>
          <ul v-else class="rows">
            <li v-for="row in rows" :key="row.title">
              <button
                class="row"
                :class="{ 'row--on': row.checked, 'row--dim': row.alreadyImported }"
                :disabled="row.alreadyImported"
                @click="toggle(row)"
              >
                <span class="check" :class="{ 'check--on': row.checked || row.alreadyImported }">
                  <Check :size="12" :stroke-width="3" />
                </span>
                <span class="title">{{ row.title }}</span>
                <span v-if="row.alreadyImported" class="badge">imported</span>
              </button>
            </li>
          </ul>
        </div>

        <footer class="modal__foot">
          <span class="count">{{ selected.length }} selected</span>
          <div class="actions">
            <button class="btn btn--ghost" @click="emit('close')">Cancel</button>
            <button class="btn btn--primary" :disabled="selected.length === 0" @click="confirm">
              Import {{ selected.length > 0 ? selected.length : '' }}
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
  max-width: 480px;
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
  align-items: flex-start;
  justify-content: space-between;
  padding: var(--sp-5) var(--sp-5) var(--sp-3);
}
.modal__head h2 {
  font-size: 1.45rem;
  font-weight: 700;
  letter-spacing: -0.025em;
}
.modal__sub {
  margin-top: 4px;
  font-size: 0.8rem;
  color: var(--c-text-muted);
}
.modal__sub code {
  background: var(--c-bg-2);
  padding: 1px 6px;
  border-radius: var(--r-sm);
  font-size: 0.74rem;
  font-family: var(--font-mono);
}
.modal__body {
  padding: 0 var(--sp-5) var(--sp-3);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.rows {
  overflow-y: auto;
  max-height: 50vh;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.row {
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
.row:hover:not(:disabled) {
  background: var(--c-bg-1);
}
.row--on {
  background: var(--c-accent-glow);
  border-color: rgba(232, 71, 76, 0.22);
  color: var(--c-text);
}
.row--dim {
  opacity: 0.55;
  cursor: not-allowed;
}
.check {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 5px;
  border: 1.5px solid var(--c-border-strong);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: transparent;
  transition:
    background var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}
.check--on {
  background: var(--c-accent);
  border-color: var(--c-accent);
  color: #fff;
}
.title {
  flex: 1;
  font-weight: 550;
  font-size: 1rem;
  letter-spacing: -0.015em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.badge {
  font-size: 0.62rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--c-text-muted);
  background: var(--c-bg-2);
  padding: 3px 9px;
  border-radius: var(--r-pill);
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
