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
    <button class="np-exit" title="Exit full screen" @click="exit">Exit</button>

    <div v-if="!hasSong" class="np-empty">
      <h1>Nothing is playing</h1>
      <p>Start a service or song from the main view to project it here.</p>
    </div>

    <div v-else class="np-stage">
      <div class="np-meta">
        <div class="np-tag">{{ player.service?.name ?? 'Preview' }}</div>
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
          :height="120"
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
          <SkipBack :size="36" />
        </button>
        <button class="np-btn np-btn--play" :title="player.isPlaying ? 'Pause' : 'Play'" @click="player.toggle()">
          <component :is="player.isPlaying ? Pause : Play" :size="64" />
        </button>
        <button
          class="np-btn"
          :disabled="!player.hasNext"
          title="Next"
          @click="player.next()"
        >
          <SkipForward :size="36" />
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
  background: radial-gradient(
    ellipse at center,
    var(--c-bg-1) 0%,
    var(--c-bg-0) 70%
  );
  color: var(--c-text);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sp-7);
  overflow: hidden;
}
.np-screen::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 60% 40% at 30% 20%, var(--c-accent-glow), transparent 60%),
    radial-gradient(ellipse 50% 40% at 80% 80%, rgba(127, 179, 255, 0.1), transparent 60%);
  pointer-events: none;
  opacity: 0.6;
}
.np-exit {
  position: absolute;
  top: var(--sp-4);
  right: var(--sp-4);
  z-index: 2;
  background: rgba(0, 0, 0, 0.4);
  color: var(--c-text-soft);
  border: 1px solid var(--c-border);
  padding: var(--sp-2) var(--sp-4);
  border-radius: var(--r-pill);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition:
    color var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease);
}
.np-exit:hover {
  color: var(--c-text);
  border-color: var(--c-accent);
}

.np-empty {
  text-align: center;
  z-index: 1;
}
.np-empty h1 {
  font-size: 4rem;
  margin-bottom: var(--sp-3);
}
.np-empty p {
  color: var(--c-text-muted);
  font-size: 1.2rem;
}

.np-stage {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 1100px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-7);
}
.np-meta {
  text-align: center;
}
.np-tag {
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--c-accent);
  margin-bottom: var(--sp-3);
}
.np-title {
  font-family: var(--font-display);
  font-size: clamp(3rem, 8vw, 6rem);
  font-weight: 700;
  line-height: 1.05;
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
  font-size: 1.4rem;
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
  padding: var(--sp-4);
  transition:
    color var(--dur-fast) var(--ease),
    background var(--dur-fast) var(--ease),
    transform var(--dur-fast) var(--ease-spring);
}
.np-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--c-text);
  transform: scale(1.05);
}
.np-btn:active {
  transform: scale(0.95);
}
.np-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  transform: none;
}
.np-btn--play {
  background: linear-gradient(135deg, var(--c-accent), var(--c-accent-deep));
  color: #1a1208;
  box-shadow: var(--sh-glow);
}
.np-btn--play:hover {
  background: linear-gradient(135deg, var(--c-accent-soft), var(--c-accent));
  box-shadow: 0 0 60px var(--c-accent-glow);
  color: #1a1208;
}

.np-upnext {
  position: absolute;
  bottom: var(--sp-5);
  right: var(--sp-5);
  text-align: right;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--c-border);
  border-radius: var(--r-md);
  padding: var(--sp-3) var(--sp-4);
  backdrop-filter: blur(10px);
}
.np-upnext__label {
  display: block;
  font-size: 0.7rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--c-text-muted);
  margin-bottom: 4px;
}
.np-upnext__title {
  display: block;
  font-family: var(--font-display);
  font-size: 1.4rem;
  color: var(--c-text);
}

@media (max-width: 600px) {
  .np-empty h1 {
    font-size: 2.4rem;
  }
  .np-btn {
    padding: var(--sp-2);
  }
}
</style>
