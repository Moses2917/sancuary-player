<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useServicesStore } from '@/stores/services'
import { useLibraryStore } from '@/stores/library'
import { usePlayerStore } from '@/stores/player'
import Icon from '@/components/Icon.vue'
import SongPicker from '@/components/SongPicker.vue'
import PlaylistRow from '@/components/PlaylistRow.vue'
import { formatDate } from '@/utils'
import type { Song } from '@/types'

const props = defineProps<{ id: string }>()

const router = useRouter()
const services = useServicesStore()
const library = useLibraryStore()
const player = usePlayerStore()

const pickerOpen = ref(false)
const editingMeta = ref(false)
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
    .filter((r): r is { item: (typeof r)['item']; song: NonNullable<(typeof r)['song']> } => !!r.song),
)

const isThisServiceLoaded = computed(
  () => player.service?.id === props.id,
)
const currentItem = computed(() => (isThisServiceLoaded.value ? player.current?.item : null))

function playAll(startIndex = 0) {
  if (!current.value || resolved.value.length === 0) return
  void player.load(
    current.value,
    library.songs,
    startIndex,
    true,
  )
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
  void services.rename(current.value.id, { name: metaName.value, date: metaDate.value }).then(() => {
    editingMeta.value = false
  })
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

const serviceNotFound = computed(
  () => services.ready && !current.value,
)
</script>

<template>
  <section v-if="serviceNotFound" class="empty surface">
    <h3>Service not found</h3>
    <p>This service may have been deleted.</p>
    <button class="btn btn--primary" @click="router.push({ name: 'services' })">
      Back to services
    </button>
  </section>

  <section v-else-if="current">
    <button class="back" @click="router.push({ name: 'services' })">
      <Icon name="arrow-left" :size="16" /> All services
    </button>

    <header class="head">
      <div class="head__main">
        <template v-if="!editingMeta">
          <div class="head__meta">
            <span class="head__date">
              <Icon name="calendar" :size="14" />
              {{ formatDate(current.date) || 'No date set' }}
            </span>
            <button class="head__edit" title="Edit" @click="editingMeta = true">
              <Icon name="edit" :size="14" />
            </button>
          </div>
          <h1 class="head__title">{{ current.name }}</h1>
        </template>
        <div v-else class="head__edit-form">
          <input v-model="metaName" class="input" placeholder="Service name" />
          <input v-model="metaDate" class="input" placeholder="Date (free-form)" />
          <div class="head__edit-actions">
            <button class="btn btn--ghost btn--sm" @click="syncMetaFields(), (editingMeta = false)">Cancel</button>
            <button class="btn btn--primary btn--sm" @click="saveMeta">Save</button>
          </div>
        </div>
      </div>
      <div class="head__actions">
        <button
          class="btn btn--primary"
          :disabled="resolved.length === 0"
          @click="playAll(0)"
        >
          <Icon name="play" :size="16" />
          {{ isThisServiceLoaded && player.isPlaying ? 'Playing…' : 'Play service' }}
        </button>
        <button class="btn" @click="pickerOpen = true">
          <Icon name="plus" :size="16" /> Add songs
        </button>
      </div>
    </header>

    <div v-if="resolved.length === 0" class="empty surface">
      <div class="empty__art"><Icon name="music" :size="36" /></div>
      <h3>Empty playlist</h3>
      <p>Add songs from your library to build this service's set list.</p>
      <button class="btn btn--primary" @click="pickerOpen = true">
        <Icon name="plus" :size="16" /> Add songs
      </button>
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
  </section>
</template>

<style scoped>
.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  color: var(--c-text-muted);
  font-size: 0.85rem;
  margin-bottom: var(--sp-4);
  padding: 4px 0;
  transition: color var(--dur-fast) var(--ease);
}
.back:hover {
  color: var(--c-text);
}

.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--sp-5);
  margin-bottom: var(--sp-6);
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
  font-size: 0.85rem;
  margin-bottom: var(--sp-2);
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
}
.head__edit:hover {
  color: var(--c-accent);
}
.head__title {
  font-size: 2.4rem;
  line-height: 1.1;
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
  gap: var(--sp-3);
  flex-shrink: 0;
}

.empty__art {
  width: 64px;
  height: 64px;
  margin: 0 auto var(--sp-3);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-lg);
  background: linear-gradient(135deg, var(--c-bg-2), var(--c-bg-3));
  color: var(--c-accent);
  border: 1px solid var(--c-border);
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.btn--sm {
  padding: var(--sp-1) var(--sp-3);
  font-size: 0.8rem;
  align-self: flex-start;
}

@media (max-width: 600px) {
  .head__title {
    font-size: 1.8rem;
  }
  .head__actions {
    width: 100%;
  }
  .head__actions .btn {
    flex: 1;
  }
}
</style>
