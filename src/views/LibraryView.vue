<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useLibraryStore } from '@/stores/library'
import { usePlayerStore } from '@/stores/player'
import type { Song, SongTag } from '@/types'
import AppIcon from '@/components/AppIcon.vue'
import SongImporter from '@/components/SongImporter.vue'
import BundledLoader from '@/components/BundledLoader.vue'

const library = useLibraryStore()
const player = usePlayerStore()

const importerOpen = ref(false)
const bundledOpen = ref(false)
const confirmingId = ref<string | null>(null)
const query = ref('')
const tagFilter = ref<SongTag | 'all'>('all')

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
        <button class="btn" @click="bundledOpen = true">
          <AppIcon name="upload" :size="16" /> Load bundled
        </button>
        <button class="btn btn--primary" @click="importerOpen = true">
          <AppIcon name="plus" :size="16" /> Add song
        </button>
      </div>
    </div>

    <div v-if="!library.loading && library.songs.length > 0" class="filters">
      <div class="search">
        <AppIcon name="search" :size="16" />
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
        </button>
        <button
          v-if="counts.new > 0"
          class="chip chip--new"
          :class="{ 'chip--on': tagFilter === 'new' }"
          role="tab"
          :aria-selected="tagFilter === 'new'"
          @click="tagFilter = 'new'"
        >
          <span class="chip__dot" style="--c: var(--c-success)"></span> New
          <span class="chip__count">{{ counts.new }}</span>
        </button>
        <button
          v-if="counts.old > 0"
          class="chip chip--old"
          :class="{ 'chip--on': tagFilter === 'old' }"
          role="tab"
          :aria-selected="tagFilter === 'old'"
          @click="tagFilter = 'old'"
        >
          <span class="chip__dot" style="--c: var(--c-piano)"></span> Old
          <span class="chip__count">{{ counts.old }}</span>
        </button>
      </div>
    </div>

    <div v-if="library.loading" class="empty"><p>Loading library…</p></div>

    <div v-else-if="library.songs.length === 0" class="empty surface">
      <div class="empty__art"><AppIcon name="music" :size="36" /></div>
      <h3>No songs yet</h3>
      <p>
        Add your first song by selecting a piano track and a choir track. They'll be stored locally
        in your browser.
      </p>
      <button class="btn btn--primary" @click="importerOpen = true">
        <AppIcon name="plus" :size="16" /> Add your first song
      </button>
    </div>

    <div v-else-if="filtered.length === 0" class="empty">
      <p>No songs match your filter.</p>
      <button class="btn btn--ghost btn--sm" @click="(query = ''), (tagFilter = 'all')">
        Clear filters
      </button>
    </div>

    <ul v-else class="songs">
      <li v-for="song in filtered" :key="song.id" class="song surface">
        <button class="song__art" :title="`Play ${song.title}`" @click="preview(song)">
          <AppIcon name="music" :size="22" />
          <span class="song__play"><AppIcon name="play" :size="20" /></span>
        </button>
        <div class="song__meta">
          <div class="song__title" :title="song.title">{{ song.title }}</div>
          <div class="song__tracks">
            <span class="track-tag" style="--c: var(--c-piano)">
              <AppIcon name="music" :size="11" /> Piano
            </span>
            <span class="track-tag" style="--c: var(--c-choir)">
              <AppIcon name="music" :size="11" /> Choir
            </span>
            <span v-if="song.bundled" class="song__bundled">bundled</span>
            <span
              v-if="song.tag"
              class="tag-badge"
              :class="`tag-badge--${song.tag}`"
              :title="`Tagged ${song.tag}`"
            >
              {{ song.tag }}
            </span>
          </div>
        </div>
        <div class="song__actions">
          <button
            class="icon-btn"
            :title="player.currentSong?.id === song.id ? 'Now playing' : 'Preview'"
            @click="preview(song)"
          >
            <AppIcon
              :name="player.currentSong?.id === song.id && player.isPlaying ? 'pause' : 'play'"
              :size="18"
            />
          </button>
          <button
            v-if="confirmingId !== song.id"
            class="icon-btn icon-btn--danger"
            title="Remove"
            @click="confirmingId = song.id"
          >
            <AppIcon name="trash" :size="18" />
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

.songs {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.song {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  padding: var(--sp-3) var(--sp-4);
  transition:
    border-color var(--dur-fast) var(--ease),
    transform var(--dur-fast) var(--ease);
}
.song:hover {
  border-color: var(--c-border-strong);
  transform: translateY(-1px);
}
.song__art {
  position: relative;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-md);
  background: linear-gradient(135deg, var(--c-bg-2), var(--c-bg-3));
  color: var(--c-accent);
  border: 1px solid var(--c-border);
  transition: color var(--dur-fast) var(--ease);
}
.song__play {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(11, 16, 32, 0.7);
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease);
}
.song__art:hover .song__play {
  opacity: 1;
}
.song__meta {
  flex: 1;
  min-width: 0;
}
.song__title {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.song__tracks {
  display: flex;
  gap: var(--sp-2);
  margin-top: 2px;
  align-items: center;
}
.track-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--c);
  background: color-mix(in srgb, var(--c) 14%, transparent);
  padding: 2px 8px;
  border-radius: var(--r-pill);
}
.song__bundled {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--c-text-muted);
}
.song__actions {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
}
.btn--sm {
  padding: var(--sp-1) var(--sp-3);
  font-size: 0.8rem;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--sp-4);
}
.search {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 0 var(--sp-3);
  background: var(--c-bg-1);
  border: 1px solid var(--c-border);
  border-radius: var(--r-md);
  color: var(--c-text-muted);
  min-width: 220px;
  flex: 1;
  max-width: 360px;
  transition: border-color var(--dur-fast) var(--ease);
}
.search:focus-within {
  border-color: var(--c-accent);
}
.search__input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--c-text);
  padding: var(--sp-3) 0;
}
.search__input::placeholder {
  color: var(--c-text-muted);
}

.tags {
  display: inline-flex;
  gap: var(--sp-2);
  flex-wrap: wrap;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-pill);
  border: 1px solid var(--c-border);
  background: transparent;
  color: var(--c-text-soft);
  font-size: 0.82rem;
  font-weight: 600;
  transition:
    background var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}
.chip:hover {
  border-color: var(--c-border-strong);
  color: var(--c-text);
}
.chip--on {
  background: var(--c-bg-3);
  border-color: var(--c-text-soft);
  color: var(--c-text);
}
.chip--new.chip--on {
  background: color-mix(in srgb, var(--c-success) 18%, transparent);
  border-color: var(--c-success);
  color: var(--c-success);
}
.chip--old.chip--on {
  background: color-mix(in srgb, var(--c-piano) 18%, transparent);
  border-color: var(--c-piano);
  color: var(--c-piano);
}
.chip__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--c);
  box-shadow: 0 0 8px var(--c);
}
.chip__count {
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}

.tag-badge {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: var(--r-pill);
}
.tag-badge--new {
  color: var(--c-success);
  background: color-mix(in srgb, var(--c-success) 18%, transparent);
}
.tag-badge--old {
  color: var(--c-piano);
  background: color-mix(in srgb, var(--c-piano) 18%, transparent);
}
</style>
