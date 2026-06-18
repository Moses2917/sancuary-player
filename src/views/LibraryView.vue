<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useLibraryStore } from '@/stores/library'
import { usePlayerStore } from '@/stores/player'
import type { Song } from '@/types'
import Icon from '@/components/Icon.vue'
import SongImporter from '@/components/SongImporter.vue'

const library = useLibraryStore()
const player = usePlayerStore()

const importerOpen = ref(false)
const confirmingId = ref<string | null>(null)

onMounted(() => {
  void library.init()
})

function submit(payload: { title: string; piano: File; choir: File }) {
  void library.addSong(payload).then(() => {
    importerOpen.value = false
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
</script>

<template>
  <section>
    <div class="section-title">
      <h1>Library</h1>
      <div class="section-title__actions">
        <button class="btn btn--primary" @click="importerOpen = true">
          <Icon name="plus" :size="16" /> Add song
        </button>
      </div>
    </div>

    <div v-if="library.loading" class="empty"><p>Loading library…</p></div>

    <div v-else-if="library.songs.length === 0" class="empty surface">
      <div class="empty__art"><Icon name="music" :size="36" /></div>
      <h3>No songs yet</h3>
      <p>
        Add your first song by selecting a piano track and a choir track. They'll be
        stored locally in your browser.
      </p>
      <button class="btn btn--primary" @click="importerOpen = true">
        <Icon name="plus" :size="16" /> Add your first song
      </button>
    </div>

    <ul v-else class="songs">
      <li v-for="song in library.songs" :key="song.id" class="song surface">
        <button class="song__art" :title="`Play ${song.title}`" @click="preview(song)">
          <Icon name="music" :size="22" />
          <span class="song__play"><Icon name="play" :size="20" /></span>
        </button>
        <div class="song__meta">
          <div class="song__title" :title="song.title">{{ song.title }}</div>
          <div class="song__tracks">
            <span class="track-tag" style="--c: var(--c-piano)">
              <Icon name="music" :size="11" /> Piano
            </span>
            <span class="track-tag" style="--c: var(--c-choir)">
              <Icon name="music" :size="11" /> Choir
            </span>
            <span v-if="song.bundled" class="song__bundled">bundled</span>
          </div>
        </div>
        <div class="song__actions">
          <button class="icon-btn" :title="player.currentSong?.id === song.id ? 'Now playing' : 'Preview'" @click="preview(song)">
            <Icon :name="player.currentSong?.id === song.id && player.isPlaying ? 'pause' : 'play'" :size="18" />
          </button>
          <button v-if="confirmingId !== song.id" class="icon-btn icon-btn--danger" title="Remove" @click="confirmingId = song.id">
            <Icon name="trash" :size="18" />
          </button>
          <template v-else>
            <button class="btn btn--danger btn--sm" @click="remove(song)">Delete</button>
            <button class="btn btn--ghost btn--sm" @click="confirmingId = null">Cancel</button>
          </template>
        </div>
      </li>
    </ul>

    <SongImporter :open="importerOpen" @close="importerOpen = false" @submit="submit" />
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
</style>
