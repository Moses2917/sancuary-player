<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Pause, Play, SkipBack, SkipForward } from '@lucide/vue'
import { usePlayerStore } from '@/stores/player'
import { useLibraryStore } from '@/stores/library'
import { useServicesStore } from '@/stores/services'
import { computePeaks } from '@/utils/waveform'
import Waveform from '@/components/Waveform.vue'

const router = useRouter()
const player = usePlayerStore()
const library = useLibraryStore()
const services = useServicesStore()

const peaks = ref<number[]>([])
const peaksLoading = ref(false)

onMounted(async () => {
  await Promise.all([library.init(), services.init()])
})

async function refreshPeaks() {
  const song = player.currentSong
  if (!song) {
    peaks.value = []
    return
  }
  peaksLoading.value = true
  try {
    peaks.value = await computePeaks(song.id, song.piano)
  } catch {
    peaks.value = []
  } finally {
    peaksLoading.value = false
  }
}

watch(() => player.currentSong?.id, refreshPeaks, { immediate: true })

const hasSong = computed(() => !!player.currentSong)
const upNext = computed(() => {
  if (!player.hasNext) return null
  const nextIdx = player.index + 1
  const item = player.queue[nextIdx]
  if (!item) return null
  return item.song.title
})

function exit() {
  router.back()
}
</script>

<template>
  <div class="np-screen" :class="{ 'np-screen--empty': !hasSong }">
    <button class="np-exit" title="Exit full screen" @click="exit">
      <span aria-hidden="true">×</span> Exit
    </button>

    <div v-if="!hasSong" class="np-empty">
      <p class="np-empty__kicker">Sanctuary</p>
      <h1>Nothing is playing</h1>
      <p class="np-empty__hint">Start a service or song from the main view to project it here.</p>
    </div>

    <div v-else class="np-stage">
      <div class="np-meta">
        <div class="np-kicker">{{ player.service?.name ?? 'Preview' }}</div>
        <h1 class="np-title" :title="player.currentSong?.title">
          {{ player.currentSong?.title }}
        </h1>
      </div>

      <div class="np-wave">
        <Waveform
          :peaks="peaks"
          :duration="player.duration || 0"
          :current="player.currentTime"
          :markers="player.currentMarkers"
          :loop="player.loop"
          :height="96"
          accent="var(--c-accent)"
          @seek="(t) => player.seek(t)"
        />
        <div class="np-times">
          <span>{{ player.currentTimeFormatted }}</span>
          <span>{{ player.durationFormatted }}</span>
        </div>
      </div>

      <div class="np-transport">
        <button
          class="np-btn"
          :disabled="!player.hasPrev"
          title="Previous"
          @click="player.prev()"
        >
          <SkipBack :size="28" :stroke-width="1.5" />
        </button>
        <button
          class="np-btn np-btn--play"
          :title="player.isPlaying ? 'Pause' : 'Play'"
          @click="player.toggle()"
        >
          <component :is="player.isPlaying ? Pause : Play" :size="44" :stroke-width="1.75" />
        </button>
        <button
          class="np-btn"
          :disabled="!player.hasNext"
          title="Next"
          @click="player.next()"
        >
          <SkipForward :size="28" :stroke-width="1.5" />
        </button>
      </div>

      <div v-if="upNext" class="np-upnext">
        <span class="np-upnext__label">Up next</span>
        <span class="np-upnext__title">{{ upNext }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.np-screen {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: var(--c-bg-0);
  color: var(--c-text);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sp-7);
  overflow: hidden;
}
.np-exit {
  position: absolute;
  top: var(--sp-4);
  right: var(--sp-4);
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--c-surface-raised);
  color: var(--c-text-soft);
  border: 1px solid var(--c-border);
  padding: 6px 14px;
  border-radius: var(--r-pill);
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  box-shadow: var(--sh-sm);
  transition:
    color var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease);
}
.np-exit span {
  font-size: 1.1rem;
  line-height: 0.8;
}
.np-exit:hover {
  color: var(--c-text);
  border-color: var(--c-border-strong);
}

.np-empty {
  text-align: center;
  z-index: 1;
}
.np-empty__kicker {
  font-size: 0.78rem;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--c-text-muted);
  margin-bottom: var(--sp-4);
  font-weight: 600;
}
.np-empty h1 {
  font-size: clamp(2.5rem, 6vw, 4.5rem);
  margin-bottom: var(--sp-3);
  font-weight: 500;
  letter-spacing: -0.02em;
}
.np-empty__hint {
  color: var(--c-text-muted);
  font-size: 1.05rem;
}

.np-stage {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 1080px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-7);
}
.np-meta {
  text-align: center;
  max-width: 100%;
}
.np-kicker {
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--c-accent);
  margin-bottom: var(--sp-4);
}
.np-title {
  font-family: var(--font-display);
  font-size: clamp(2.6rem, 8vw, 5.6rem);
  font-weight: 500;
  line-height: 1.05;
  letter-spacing: -0.02em;
  max-width: 100%;
  overflow-wrap: anywhere;
}
.np-wave {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.np-times {
  display: flex;
  justify-content: space-between;
  font-variant-numeric: tabular-nums;
  color: var(--c-text-muted);
  font-size: 1.05rem;
  letter-spacing: 0.02em;
}

.np-transport {
  display: flex;
  align-items: center;
  gap: var(--sp-6);
}
.np-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-pill);
  border: 1px solid transparent;
  background: transparent;
  color: var(--c-text-soft);
  cursor: pointer;
  padding: var(--sp-3);
  transition:
    color var(--dur-fast) var(--ease),
    background var(--dur-fast) var(--ease);
}
.np-btn:hover {
  background: var(--c-bg-3);
  color: var(--c-text);
}
.np-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.np-btn--play {
  background: var(--c-accent);
  color: #fbf9f3;
  padding: var(--sp-5);
}
.np-btn--play:hover {
  background: var(--c-accent-deep);
  color: #fbf9f3;
}

.np-upnext {
  position: absolute;
  bottom: var(--sp-5);
  right: var(--sp-5);
  text-align: right;
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  border-radius: var(--r-md);
  padding: var(--sp-3) var(--sp-4);
  box-shadow: var(--sh-sm);
}
.np-upnext__label {
  display: block;
  font-size: 0.65rem;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--c-text-muted);
  margin-bottom: 4px;
  font-weight: 600;
}
.np-upnext__title {
  display: block;
  font-family: var(--font-display);
  font-size: 1.2rem;
  color: var(--c-text);
}

@media (max-width: 600px) {
  .np-empty h1 {
    font-size: 2.4rem;
  }
  .np-btn {
    padding: var(--sp-2);
  }
  .np-upnext {
    left: var(--sp-4);
    right: var(--sp-4);
    bottom: var(--sp-4);
    text-align: left;
  }
}
</style>
