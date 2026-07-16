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
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: rgba(250, 250, 252, 0.96);
  border: 1px solid var(--c-border);
  border-radius: 13px;
  box-shadow: var(--sh-lg);
  overflow: hidden;
}
.modal__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 18px 20px 12px;
}
.modal__head h2 {
  font-size: 1.08rem;
  font-weight: 650;
  letter-spacing: -0.02em;
}
.modal__sub {
  margin-top: 4px;
  font-size: 0.8rem;
  color: var(--c-text-muted);
}
.modal__sub code {
  background: rgba(118, 118, 128, .12);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.74rem;
  font-family: var(--font-mono);
}
.modal__body {
  padding: 0 20px 12px;
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
  gap: 10px;
  padding: 9px 10px;
  border-radius: 7px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--c-text-soft);
  text-align: left;
  transition:
    background var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease);
}
.row:hover:not(:disabled) {
  background: rgba(0, 0, 0, .045);
}
.row--on {
  background: rgba(250, 45, 72, .09);
  border-color: rgba(250, 45, 72, .18);
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
  border-radius: 50%;
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
  background: rgba(118, 118, 128, .12);
  padding: 3px 9px;
  border-radius: 5px;
}
.modal__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px 18px;
  border-top: 1px solid var(--c-border);
}
.count {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--c-text-muted);
}
.actions {
  display: flex;
  gap: 8px;
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
