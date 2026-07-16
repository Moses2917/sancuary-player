<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useServicesStore } from '@/stores/services'
import { useLibraryStore } from '@/stores/library'
import { usePlayerStore } from '@/stores/player'
import { ArrowLeft, Calendar, Ellipsis, Music, Pencil, Play, Plus, Printer, Upload } from '@lucide/vue'
import SongPicker from '@/components/SongPicker.vue'
import SongImporter from '@/components/SongImporter.vue'
import PlaylistRow from '@/components/PlaylistRow.vue'
import { formatDate } from '@/utils'
import type { Song } from '@/types'

const props = defineProps<{ id: string }>()

const router = useRouter()
const services = useServicesStore()
const library = useLibraryStore()
const player = usePlayerStore()

const pickerOpen = ref(false)
const creatorOpen = ref(false)
const editingMeta = ref(false)
const moreActionsOpen = ref(false)
const metaName = ref('')
const metaDate = ref('')

const dragFromIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

onMounted(async () => {
  await Promise.all([services.init(), library.init()])
  syncMetaFields()
})

watch(
  () => props.id,
  () => syncMetaFields(),
)

function syncMetaFields() {
  const svc = current.value
  metaName.value = svc?.name ?? ''
  metaDate.value = svc?.date ?? ''
}

const current = computed(() => services.getById(props.id))
const items = computed(() => current.value?.items ?? [])

/** Resolve song for each item; missing songs (deleted) are filtered out for display safety. */
const resolved = computed(() =>
  items.value
    .map((item) => ({ item, song: library.getById(item.songId) }))
    .filter(
      (r): r is { item: (typeof r)['item']; song: NonNullable<(typeof r)['song']> } => !!r.song,
    ),
)

const isThisServiceLoaded = computed(() => player.service?.id === props.id)
const currentItem = computed(() => (isThisServiceLoaded.value ? player.current?.item : null))

function playAll(startIndex = 0) {
  if (!current.value || resolved.value.length === 0) return
  void player.load(current.value, library.songs, startIndex, true)
}

function playFrom(index: number) {
  if (isThisServiceLoaded.value && currentItem.value?.id === resolved.value[index]?.item.id) {
    player.toggle()
    return
  }
  playAll(index)
}

function addSongs(songs: Song[]) {
  if (!current.value) return
  void services.addItems(current.value.id, songs).then(() => {
    pickerOpen.value = false
  })
}

/**
 * After a brand-new song is created from within the service editor, resolve
 * it through the library (so the store has it) and append it to this setlist.
 */
function onSongCreated(payload: { id: string }) {
  if (!current.value) return
  creatorOpen.value = false
  moreActionsOpen.value = false
  const song = library.getById(payload.id)
  if (!song) return
  void services.addItems(current.value.id, [song])
}

function setPiano(itemId: string, value: number) {
  if (!current.value) return
  void services.updateItem(current.value.id, itemId, { pianoVolume: value })
  if (currentItem.value?.id === itemId) player.setPiano(value)
}
function setChoir(itemId: string, value: number) {
  if (!current.value) return
  void services.updateItem(current.value.id, itemId, { choirVolume: value })
  if (currentItem.value?.id === itemId) player.setChoir(value)
}

function removeItem(itemId: string) {
  if (!current.value) return
  void services.removeItem(current.value.id, itemId)
}

function saveMeta() {
  if (!current.value) return
  void services
    .rename(current.value.id, { name: metaName.value, date: metaDate.value })
    .then(() => {
      editingMeta.value = false
    })
}

/** Open the browser print dialog with a clean numbered setlist layout. */
function printSetlist() {
  const svc = current.value
  if (!svc) return
  moreActionsOpen.value = false
  const prevFlag = document.body.getAttribute('data-print')
  document.body.setAttribute('data-print', 'setlist')
  // Restore the flag after the print dialog closes regardless of outcome.
  const cleanup = () => {
    if (prevFlag === null) document.body.removeAttribute('data-print')
    else document.body.setAttribute('data-print', prevFlag)
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  window.print()
}

/* drag-and-drop */
function onDragStart(index: number) {
  dragFromIndex.value = index
}
function onDragEnter(index: number) {
  if (dragFromIndex.value === null) return
  dragOverIndex.value = index
}
function onDrop(index: number) {
  const from = dragFromIndex.value
  if (from === null || from === index || !current.value) {
    resetDrag()
    return
  }
  void services.reorder(current.value.id, from, index)
  resetDrag()
}
function resetDrag() {
  dragFromIndex.value = null
  dragOverIndex.value = null
}

const serviceNotFound = computed(() => services.ready && !current.value)
</script>

<template>
  <section v-if="serviceNotFound" class="empty">
    <h3>Service not found</h3>
    <p>This service may have been deleted.</p>
    <button class="btn btn--primary" @click="router.push({ name: 'services' })">
      Back to services
    </button>
  </section>

  <section v-else-if="current">
    <button class="back" @click="router.push({ name: 'services' })">
      <ArrowLeft :size="14" :stroke-width="1.75" /> All services
    </button>

    <header class="head">
      <div class="head__main">
        <template v-if="!editingMeta">
          <div class="head__meta">
            <span class="head__date">
              <Calendar :size="12" :stroke-width="1.75" />
              {{ formatDate(current.date) || 'No date set' }}
            </span>
            <button class="head__edit" title="Edit" @click="editingMeta = true">
              <Pencil :size="13" :stroke-width="1.6" />
            </button>
          </div>
          <h1 class="head__title">{{ current.name }}</h1>
        </template>
        <div v-else class="head__edit-form">
          <input v-model="metaName" class="input" placeholder="Service name" />
          <input v-model="metaDate" class="input" type="date" aria-label="Service date" />
          <div class="head__edit-actions">
            <button
              class="btn btn--ghost btn--sm"
              @click="(syncMetaFields(), (editingMeta = false))"
            >
              Cancel
            </button>
            <button class="btn btn--primary btn--sm" @click="saveMeta">Save</button>
          </div>
        </div>
      </div>
      <div class="head__actions">
        <button class="btn" @click="pickerOpen = true">
          <Plus :size="14" :stroke-width="2" /> Add songs
        </button>
        <div class="service-more">
          <button
            class="icon-btn"
            :class="{ 'icon-btn--active': moreActionsOpen }"
            :aria-expanded="moreActionsOpen"
            title="Service actions"
            @click="moreActionsOpen = !moreActionsOpen"
          >
            <Ellipsis :size="18" :stroke-width="2" />
          </button>
          <div v-if="moreActionsOpen" class="service-menu" role="menu">
            <button role="menuitem" @click="moreActionsOpen = false; creatorOpen = true">
              <Upload :size="15" :stroke-width="1.75" /> Create a new song
            </button>
            <button
              :disabled="resolved.length === 0"
              role="menuitem"
              @click="printSetlist"
            >
              <Printer :size="15" :stroke-width="1.75" /> Print set list
            </button>
          </div>
        </div>
        <button
          class="btn btn--primary"
          :disabled="resolved.length === 0"
          @click="playAll(0)"
        >
          <Play :size="14" :stroke-width="2" />
          {{ isThisServiceLoaded && player.isPlaying ? 'Playing…' : 'Play service' }}
        </button>
      </div>
    </header>

    <div v-if="resolved.length === 0" class="empty">
      <div class="empty__icon"><Music :size="32" :stroke-width="1.25" /></div>
      <h3>Empty playlist</h3>
      <p>Add songs from your library to build this service's set list.</p>
      <div class="empty__actions">
        <button class="btn btn--primary" @click="pickerOpen = true">
          <Plus :size="14" :stroke-width="2" /> Add songs
        </button>
        <button class="btn" @click="creatorOpen = true">
          <Upload :size="14" :stroke-width="1.6" /> Create new
        </button>
      </div>
    </div>

    <ul v-else class="list">
      <PlaylistRow
        v-for="(entry, idx) in resolved"
        :key="entry.item.id"
        :item="entry.item"
        :song="entry.song"
        :index="idx"
        :is-current="currentItem?.id === entry.item.id"
        :is-playing="player.isPlaying"
        :dragging="dragFromIndex === idx"
        :drag-over="dragOverIndex === idx && dragFromIndex !== idx"
        @play="playFrom(idx)"
        @remove="removeItem(entry.item.id)"
        @update:piano="setPiano(entry.item.id, $event)"
        @update:choir="setChoir(entry.item.id, $event)"
        @dragstart="onDragStart(idx)"
        @dragenter="onDragEnter(idx)"
        @dragend="resetDrag"
        @drop="onDrop(idx)"
      />
    </ul>

    <SongPicker
      :open="pickerOpen"
      :songs="library.songs"
      :exclude-ids="items.map((i) => i.songId)"
      @close="pickerOpen = false"
      @add="addSongs"
    />
    <SongImporter
      :open="creatorOpen"
      @close="creatorOpen = false"
      @saved-song="onSongCreated"
    />

    <!-- Hidden on screen; revealed only when body[data-print="setlist"]. -->
    <div class="print-region" aria-hidden="true">
      <div class="print-setlist">
        <h1 class="print-setlist__title">{{ current.name }}</h1>
        <div class="print-setlist__count">{{ resolved.length }} songs</div>
        <ol class="print-setlist__rows">
          <li
            v-for="(entry, idx) in resolved"
            :key="entry.item.id"
            class="print-setlist__row"
          >
            <span class="print-setlist__num">{{ idx + 1 }}.</span>
            <span class="print-setlist__title-cell">{{ entry.song.title }}</span>
            <span
              v-if="entry.song.tag"
              class="print-setlist__tag"
              :class="`print-setlist__tag--${entry.song.tag}`"
            >
              {{ entry.song.tag }}
            </span>
            <span class="print-setlist__notes" />
          </li>
        </ol>
      </div>
    </div>
  </section>
</template>

<style scoped>
.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  color: var(--c-text-soft);
  font-size: 0.84rem;
  font-weight: 550;
  letter-spacing: -0.005em;
  margin-bottom: var(--sp-5);
  padding: 4px 0;
  transition: color var(--dur-fast) var(--ease);
}
.back:hover {
  color: var(--c-accent-deep);
}

.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--sp-5);
  margin-bottom: 26px;
  padding: 0 0 28px;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  flex-wrap: wrap;
}
.head__main {
  min-width: 0;
  flex: 1;
}
.head__meta {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  color: var(--c-text-muted);
  font-size: 0.74rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: var(--sp-3);
}
.head__date {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.head__edit {
  display: inline-flex;
  align-items: center;
  background: transparent;
  border: none;
  color: var(--c-text-muted);
  padding: 2px;
  border-radius: var(--r-sm);
  transition: color var(--dur-fast) var(--ease);
}
.head__edit:hover {
  color: var(--c-text);
}
.head__title {
  font-size: clamp(2.1rem, 5.4vw, 3.6rem);
  line-height: 1.04;
  font-weight: 720;
  letter-spacing: -0.035em;
  color: var(--c-text);
}
.head__edit-form {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  max-width: 460px;
}
.head__edit-actions {
  display: flex;
  gap: var(--sp-2);
}
.head__actions {
  display: flex;
  gap: var(--sp-2);
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.service-more { position: relative; }
.service-menu { position: absolute; z-index: 20; top: calc(100% + 7px); right: 0; width: 195px; padding: 5px; border: 1px solid var(--c-border); border-radius: 10px; background: rgba(250,250,252,.97); box-shadow: var(--sh-lg); backdrop-filter: blur(18px) saturate(160%); }
.service-menu button { display: flex; align-items: center; width: 100%; gap: 9px; padding: 8px 9px; border: 0; border-radius: 6px; background: transparent; color: var(--c-text); font: inherit; font-size: .81rem; font-weight: 500; text-align: left; }
.service-menu button:hover:not(:disabled) { background: rgba(0,0,0,.06); }
.service-menu button:disabled { opacity: .45; cursor: not-allowed; }

.empty__icon {
  width: 68px;
  height: 68px;
  margin: 0 auto var(--sp-4);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: #e9e9ed;
  color: var(--c-accent);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.btn--sm {
  height: 28px;
  padding: 0 12px;
  font-size: 0.78rem;
  align-self: flex-start;
}
.empty__actions {
  display: inline-flex;
  gap: var(--sp-3);
  justify-content: center;
  margin-top: var(--sp-2);
}
.hide-sm {
  /* visible by default */
}
@media (max-width: 720px) {
  .hide-sm {
    display: none;
  }
}

/* Print region is hidden on screen; only shown by the print stylesheet. */
.print-region {
  display: none;
}

@media (max-width: 600px) {
  .head__title {
    font-size: 1.9rem;
  }
  .head__actions {
    width: 100%;
  }
  .head__actions .btn {
    flex: 1;
  }
}
</style>
