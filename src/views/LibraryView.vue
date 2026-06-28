<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Database, Download, Music, Pause, Play, Plus, Search, Trash2, Upload } from '@lucide/vue'
import { useLibraryStore } from '@/stores/library'
import { useServicesStore } from '@/stores/services'
import { usePlayerStore } from '@/stores/player'
import type { Song, SongTag } from '@/types'
import {
  buildBackup,
  downloadBackup,
  parseBackup,
  pickBackupFile,
  restoreBackup,
} from '@/utils/backup'
import SongImporter from '@/components/SongImporter.vue'
import BundledLoader from '@/components/BundledLoader.vue'

const library = useLibraryStore()
const services = useServicesStore()
const player = usePlayerStore()

const importerOpen = ref(false)
const bundledOpen = ref(false)
const confirmingId = ref<string | null>(null)
const query = ref('')
const tagFilter = ref<SongTag | 'all'>('all')
const backupBusy = ref(false)
const backupMessage = ref('')

onMounted(() => {
  void library.init()
})

function onSaved() {
  importerOpen.value = false
}

function importBundled(titles: string[]) {
  void library.importBundled(titles).then(() => {
    bundledOpen.value = false
  })
}

function preview(song: Song) {
  player.playSingle(song)
}

function remove(song: Song) {
  void library.removeSong(song.id).then(() => {
    confirmingId.value = null
  })
}

async function exportBackup() {
  if (backupBusy.value) return
  backupBusy.value = true
  backupMessage.value = ''
  try {
    const backup = await buildBackup()
    downloadBackup(backup)
    backupMessage.value = `Exported ${backup.songs.length} songs and ${backup.services.length} services.`
  } catch (err) {
    backupMessage.value = err instanceof Error ? err.message : 'Export failed.'
  } finally {
    backupBusy.value = false
  }
}

async function importBackup() {
  if (backupBusy.value) return
  const file = await pickBackupFile()
  if (!file) return
  backupBusy.value = true
  backupMessage.value = ''
  try {
    const text = await file.text()
    const backup = parseBackup(text)
    const mode = window.confirm(
      `Replace your entire library with this backup?\n\n` +
        `OK = Replace everything\nCancel = Merge (incoming wins on conflicts)`,
    )
      ? 'replace'
      : 'merge'
    const result = await restoreBackup(backup, mode)
    await Promise.all([library.reload(), services.reload()])
    backupMessage.value = `Imported ${result.songs} songs and ${result.services} services (${mode}).`
  } catch (err) {
    backupMessage.value = err instanceof Error ? err.message : 'Import failed.'
  } finally {
    backupBusy.value = false
  }
}

const filtered = computed<Song[]>(() => {
  const q = query.value.trim().toLowerCase()
  return library.songs.filter((s) => {
    if (tagFilter.value !== 'all' && s.tag !== tagFilter.value) return false
    if (!q) return true
    return s.title.toLowerCase().includes(q)
  })
})

const counts = computed(() => {
  let n = 0
  let o = 0
  for (const s of library.songs) {
    if (s.tag === 'new') n++
    else if (s.tag === 'old') o++
  }
  return { new: n, old: o }
})
</script>

<template>
  <section>
    <div class="section-title">
      <h1>Library</h1>
      <div class="section-title__actions">
        <button class="btn" :disabled="backupBusy" @click="exportBackup" title="Download a backup">
          <Download :size="14" :stroke-width="1.75" /> <span class="hide-sm">Export</span>
        </button>
        <button class="btn" :disabled="backupBusy" @click="importBackup" title="Restore a backup">
          <Database :size="14" :stroke-width="1.75" /> <span class="hide-sm">Restore</span>
        </button>
        <button class="btn" @click="bundledOpen = true">
          <Upload :size="14" :stroke-width="1.75" /> <span class="hide-sm">Bundled</span>
        </button>
        <button class="btn btn--primary" @click="importerOpen = true">
          <Plus :size="14" :stroke-width="2" /> Add song
        </button>
      </div>
    </div>

    <p v-if="backupMessage" class="backup-msg">{{ backupMessage }}</p>

    <div v-if="!library.loading && library.songs.length > 0" class="filters">
      <div class="search">
        <Search :size="15" :stroke-width="1.75" />
        <input
          v-model="query"
          type="search"
          class="search__input"
          placeholder="Search songs…"
          aria-label="Search songs"
        />
      </div>
      <div class="tags" role="tablist" aria-label="Filter by tag">
        <button
          class="chip"
          :class="{ 'chip--on': tagFilter === 'all' }"
          role="tab"
          :aria-selected="tagFilter === 'all'"
          @click="tagFilter = 'all'"
        >
          All
          <span class="chip__count">{{ library.songs.length }}</span>
        </button>
        <button
          v-if="counts.new > 0"
          class="chip"
          :class="{ 'chip--on': tagFilter === 'new' }"
          role="tab"
          :aria-selected="tagFilter === 'new'"
          @click="tagFilter = 'new'"
        >
          New
          <span class="chip__count">{{ counts.new }}</span>
        </button>
        <button
          v-if="counts.old > 0"
          class="chip"
          :class="{ 'chip--on': tagFilter === 'old' }"
          role="tab"
          :aria-selected="tagFilter === 'old'"
          @click="tagFilter = 'old'"
        >
          Old
          <span class="chip__count">{{ counts.old }}</span>
        </button>
      </div>
    </div>

    <div v-if="library.loading" class="empty"><p>Loading library…</p></div>

    <div v-else-if="library.songs.length === 0" class="empty">
      <div class="empty__icon"><Music :size="32" :stroke-width="1.25" /></div>
      <h3>No songs yet</h3>
      <p>
        Add your first song by selecting a piano track and a choir track. They'll be stored locally
        in your browser.
      </p>
      <button class="btn btn--primary" @click="importerOpen = true">
        <Plus :size="14" :stroke-width="2" /> Add your first song
      </button>
    </div>

    <div v-else-if="filtered.length === 0" class="empty">
      <p>No songs match your filter.</p>
      <button class="btn btn--ghost btn--sm" @click="(query = ''), (tagFilter = 'all')">
        Clear filters
      </button>
    </div>

    <ul v-else class="songs">
      <li v-for="song in filtered" :key="song.id" class="song">
        <button class="song__art" :title="`Play ${song.title}`" @click="preview(song)">
          <Music :size="18" :stroke-width="1.5" />
          <span class="song__play"><Play :size="16" :stroke-width="2" style="margin-left: 2px" /></span>
        </button>
        <div class="song__meta">
          <div class="song__title" :title="song.title">{{ song.title }}</div>
          <div class="song__sub">
            <span class="dot" style="--c: var(--c-piano)"></span>Piano
            <span class="sep">·</span>
            <span class="dot" style="--c: var(--c-choir)"></span>Choir
            <template v-if="song.bundled">
              <span class="sep">·</span>
              <span class="muted">bundled</span>
            </template>
          </div>
        </div>
        <span v-if="song.tag" class="tag" :class="`tag--${song.tag}`">{{ song.tag }}</span>
        <div class="song__actions">
          <button
            class="icon-btn"
            :title="player.currentSong?.id === song.id ? 'Now playing' : 'Preview'"
            @click="preview(song)"
          >
            <component
              :is="player.currentSong?.id === song.id && player.isPlaying ? Pause : Play"
              :size="16"
              :stroke-width="2"
            />
          </button>
          <button
            v-if="confirmingId !== song.id"
            class="icon-btn icon-btn--danger"
            title="Remove"
            @click="confirmingId = song.id"
          >
            <Trash2 :size="15" :stroke-width="1.75" />
          </button>
          <template v-else>
            <button class="btn btn--danger btn--sm" @click="remove(song)">Delete</button>
            <button class="btn btn--ghost btn--sm" @click="confirmingId = null">Cancel</button>
          </template>
        </div>
      </li>
    </ul>

    <SongImporter :open="importerOpen" @close="importerOpen = false" @saved="onSaved" />
    <BundledLoader :open="bundledOpen" @close="bundledOpen = false" @import="importBundled" />
  </section>
</template>

<style scoped>
.empty__icon {
  width: 68px;
  height: 68px;
  margin: 0 auto var(--sp-4);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-md);
  background: var(--c-bg-2);
  color: var(--c-text-muted);
}

.songs {
  display: flex;
  flex-direction: column;
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  border-radius: var(--r-lg);
  overflow: hidden;
}
.song {
  display: grid;
  grid-template-columns: 44px 1fr auto auto;
  align-items: center;
  gap: var(--sp-4);
  padding: var(--sp-3) var(--sp-4);
  border-bottom: 1px solid var(--c-border);
  transition: background var(--dur-fast) var(--ease);
}
.song:last-child {
  border-bottom: none;
}
.song:hover {
  background: var(--c-bg-1);
}
.song__art {
  position: relative;
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-md);
  background: linear-gradient(135deg, #f0f0f3, #e3e3e8);
  color: var(--c-text-muted);
  border: none;
  transition: color var(--dur-fast) var(--ease);
}
.song__play {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--c-accent);
  color: #fff;
  opacity: 0;
  border-radius: inherit;
  transition: opacity var(--dur-fast) var(--ease);
}
.song__art:hover .song__play {
  opacity: 1;
}
.song__meta {
  min-width: 0;
}
.song__title {
  font-weight: 600;
  font-size: 1rem;
  letter-spacing: -0.015em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--c-text);
}
.song__sub {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.76rem;
  color: var(--c-text-muted);
  margin-top: 2px;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--c);
}
.sep {
  opacity: 0.45;
}
.song__actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
.btn--sm {
  height: 28px;
  padding: 0 12px;
  font-size: 0.78rem;
}

.tag {
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 3px 9px;
  border-radius: var(--r-pill);
  color: var(--c-text-muted);
  background: var(--c-bg-2);
}
.tag--new {
  color: var(--c-success);
  background: rgba(46, 158, 91, 0.12);
}
.tag--old {
  color: var(--c-text-soft);
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--sp-5);
}
.search {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 0 14px;
  background: var(--c-bg-2);
  border: 1px solid transparent;
  border-radius: var(--r-pill);
  color: var(--c-text-muted);
  min-width: 220px;
  flex: 1;
  max-width: 360px;
  height: 36px;
  transition:
    background var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease),
    box-shadow var(--dur-fast) var(--ease);
}
.search:focus-within {
  background: var(--c-surface-raised);
  border-color: var(--c-border-strong);
  box-shadow: var(--sh-sm);
}
.search__input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--c-text);
}
.search__input::placeholder {
  color: var(--c-text-muted);
}

.tags {
  display: inline-flex;
  gap: 2px;
  flex-wrap: wrap;
  padding: 3px;
  background: var(--c-bg-2);
  border-radius: var(--r-pill);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 5px 12px;
  border-radius: var(--r-pill);
  border: none;
  background: transparent;
  color: var(--c-text-muted);
  font-size: 0.8rem;
  font-weight: 550;
  letter-spacing: -0.005em;
  transition:
    background var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}
.chip:hover {
  color: var(--c-text);
}
.chip--on {
  background: var(--c-surface-raised);
  color: var(--c-text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
.chip__count {
  font-variant-numeric: tabular-nums;
  font-size: 0.72rem;
  opacity: 0.6;
  font-weight: 500;
}

.backup-msg {
  font-size: 0.82rem;
  color: var(--c-text-muted);
  background: var(--c-bg-1);
  border: 1px solid var(--c-border);
  border-radius: var(--r-md);
  padding: var(--sp-2) var(--sp-3);
  margin-bottom: var(--sp-4);
}
.hide-sm {
  /* visible by default; media query below collapses on small screens */
}
@media (max-width: 720px) {
  .hide-sm {
    display: none;
  }
  .filters {
    flex-direction: column;
    align-items: stretch;
  }
  .search {
    max-width: none;
  }
  .song {
    grid-template-columns: 42px 1fr auto;
  }
  .tag {
    display: none;
  }
}
</style>
