<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Expand,
  Flag,
  Music,
  Pause,
  Play,
  Repeat,
  ScissorsLineDashed,
  SkipBack,
  SkipForward,
  Volume2,
} from '@lucide/vue'
import { usePlayerStore } from '@/stores/player'
import { computePeaks } from '@/utils/waveform'
import { formatTime } from '@/utils'
import VolumeSlider from './VolumeSlider.vue'
import Waveform from './Waveform.vue'

const router = useRouter()
const player = usePlayerStore()

const hasSong = computed(() => !!player.currentSong)

const peaks = ref<number[]>([])
const peaksLoading = ref(false)
/** When true, clicking the waveform drops a cue at the clicked position. */
const placeCueMode = ref(false)

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

function onSeek(v: number) {
  if (Number.isFinite(player.duration)) player.seek(v)
}

function onMarkerSeek(m: { time: number }) {
  onSeek(m.time)
}

async function addMarkerHere() {
  if (!player.currentSong) return
  const label = window.prompt('Marker label (optional)', '') ?? ''
  await player.addMarkerHere(label)
}

async function addMarkerAt(time: number) {
  if (!player.currentSong) return
  const label = window.prompt(`Marker label at ${formatTime(time)} (optional)`, '') ?? ''
  await player.addMarkerAt(time, label)
  // Exit place-cue mode after a successful drop so the user doesn't
  // accidentally spam cues on subsequent seeks.
  placeCueMode.value = false
}

function togglePlaceCueMode() {
  placeCueMode.value = !placeCueMode.value
}

function onFadeUpdate(id: string, patch: { start?: number; end?: number }) {
  void player.updateFade(id, patch)
}
function onFadeRemove(id: string) {
  void player.removeFade(id)
}
function addFadeHere() {
  void player.addFadeHere(8)
}

function gotoService() {
  const svc = player.service
  if (svc && svc.id !== 'preview') {
    router.push({ name: 'service-detail', params: { id: svc.id } })
  }
}

function openNowPlaying() {
  router.push({ name: 'now-playing' })
}

const loopLabel = computed(() => {
  if (!player.loop) return 'Loop off'
  const { start, end } = player.loop
  return `Loop ${formatTime(start)} → ${formatTime(end)}`
})
</script>

<template>
  <div class="pod surface" :class="{ 'pod--empty': !hasSong }">
    <!-- HEAD: song title + service + expand -->
    <div class="pod__head">
      <div class="pod__art" :class="{ 'pod__art--playing': player.isPlaying }">
        <Music :size="20" />
      </div>
      <div class="pod__meta" @click="gotoService">
        <div class="pod__title" :title="player.currentSong?.title">
          {{ player.currentSong?.title ?? 'Nothing playing' }}
        </div>
        <div class="pod__service" :title="player.service?.name">
          {{ player.service?.name ?? 'Select a song to begin' }}
        </div>
      </div>
      <button
        v-if="hasSong"
        class="icon-btn pod__expand"
        title="Open full-screen Now Playing"
        @click="openNowPlaying"
      >
        <Expand :size="18" />
      </button>
    </div>

    <!-- MAIN: transport + thick waveform -->
    <div class="pod__main">
      <div class="pod__transport">
        <button
          class="icon-btn"
          :disabled="!player.hasPrev"
          title="Previous"
          @click="player.prev()"
        >
          <SkipBack :size="20" />
        </button>
        <button
          v-if="!player.isPlaying"
          class="icon-btn icon-btn--lg icon-btn--primary pod__play"
          :disabled="!hasSong"
          title="Play"
          @click="player.play()"
        >
          <Play :size="24" />
        </button>
        <button
          v-else
          class="icon-btn icon-btn--lg icon-btn--primary pod__play"
          title="Pause"
          @click="player.pause()"
        >
          <Pause :size="24" />
        </button>
        <button
          class="icon-btn"
          :disabled="!player.hasNext"
          title="Next"
          @click="player.next()"
        >
          <SkipForward :size="20" />
        </button>
      </div>

      <div class="pod__seek">
        <Waveform
          :peaks="peaks"
          :duration="player.duration || 0"
          :current="player.currentTime"
          :is-playing="player.isPlaying"
          :markers="player.currentMarkers"
          :loop="player.loop"
          :fades="player.currentFades"
          :place-cue-mode="placeCueMode"
          :disabled="!hasSong"
          :height="72"
          accent="var(--c-accent)"
          @seek="onSeek"
          @marker-seek="onMarkerSeek"
          @add-cue="addMarkerHere"
          @add-cue-at="addMarkerAt"
          @update-fade="onFadeUpdate"
          @remove-fade="onFadeRemove"
        />
        <div v-if="peaksLoading" class="pod__hint">Analysing audio…</div>
        <div class="pod__times">
          <span>{{ player.currentTimeFormatted }}</span>
          <span>{{ player.durationFormatted }}</span>
        </div>
      </div>
    </div>

    <!-- TOOLS: loop / markers / fade -->
    <div class="pod__tools">
      <button
        class="tool"
        :class="{ 'tool--on': !!player.loop }"
        :disabled="!hasSong"
        :title="loopLabel"
        @click="player.toggleLoop()"
      >
        <Repeat :size="14" /> <span>Loop</span>
      </button>
      <button
        class="tool"
        :class="{ 'tool--on': !!player.loop }"
        :disabled="!hasSong || player.duration <= 0"
        title="Set loop start (A) at playhead"
        @click="player.setLoopStart()"
      >
        A
      </button>
      <button
        class="tool"
        :class="{ 'tool--on': !!player.loop }"
        :disabled="!hasSong || player.duration <= 0"
        title="Set loop end (B) at playhead"
        @click="player.setLoopEnd()"
      >
        B
      </button>
      <button
        class="tool"
        :class="{ 'tool--on': placeCueMode }"
        :disabled="!hasSong"
        :title="
          placeCueMode
            ? 'Click the waveform to drop a cue (click here to cancel)'
            : 'Toggle: then click anywhere on the waveform to drop a cue'
        "
        @click="togglePlaceCueMode"
      >
        <Flag :size="14" /> <span>{{ placeCueMode ? 'Placing…' : 'Cue' }}</span>
      </button>
      <button
        class="tool"
        :disabled="!hasSong || player.duration <= 0"
        title="Drop a fade-out region at the playhead (drag the gray box to reposition)"
        @click="addFadeHere"
      >
        <ScissorsLineDashed :size="14" /> <span>Fade</span>
      </button>
    </div>

    <!-- MIXERS: piano / choir / master with % readouts -->
    <div class="pod__mix">
      <div class="mix" :class="{ 'mix--dim': player.pianoMuted }">
        <button
          class="mix__tag"
          :class="{ 'mix__tag--muted': player.pianoMuted }"
          :title="player.pianoMuted ? 'Unmute piano' : 'Mute piano'"
          @click="player.togglePianoMute()"
        >
          <span class="mix__dot" style="--c: var(--c-piano)"></span>
          Piano
        </button>
        <VolumeSlider
          class="mix__slider"
          :model-value="player.pianoVolume"
          accent="--c-piano"
          :disabled="player.pianoMuted"
          show-value
          @update:model-value="player.setPiano"
        />
      </div>
      <div class="mix" :class="{ 'mix--dim': player.choirMuted }">
        <button
          class="mix__tag"
          :class="{ 'mix__tag--muted': player.choirMuted }"
          :title="player.choirMuted ? 'Unmute choir' : 'Mute choir'"
          @click="player.toggleChoirMute()"
        >
          <span class="mix__dot" style="--c: var(--c-choir)"></span>
          Choir
        </button>
        <VolumeSlider
          class="mix__slider"
          :model-value="player.choirVolume"
          accent="--c-choir"
          :disabled="player.choirMuted"
          show-value
          @update:model-value="player.setChoir"
        />
      </div>
      <div class="mix mix--master">
        <span class="mix__tag mix__tag--static">
          <Volume2 :size="14" />
          Master
        </span>
        <VolumeSlider
          class="mix__slider"
          :model-value="player.masterVolume"
          show-value
          @update:model-value="player.setMaster"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Floating squircle "pod" — sticks to the top of the main column so it
   sits above the page title, horizontally centered. */
.pod {
  position: sticky;
  top: calc(var(--header-h) + var(--sp-3));
  z-index: 25;
  width: 100%;
  max-width: 880px;
  margin: 0 auto var(--sp-5);
  padding: var(--sp-4) var(--sp-5);
  border-radius: 28px;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow:
    0 18px 50px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

/* HEAD */
.pod__head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
}
.pod__art {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--c-bg-2), var(--c-bg-3));
  color: var(--c-accent);
  border: 1px solid var(--c-border);
  transition:
    color var(--dur) var(--ease),
    border-color var(--dur) var(--ease);
}
.pod__art--playing {
  animation: breathe 3s var(--ease) infinite;
  color: var(--c-accent-soft);
  border-color: var(--c-accent);
}
@keyframes breathe {
  0%,
  100% {
    box-shadow: 0 0 0 0 var(--c-accent-glow);
    transform: scale(1);
  }
  50% {
    box-shadow: 0 0 22px 4px var(--c-accent-glow);
    transform: scale(1.04);
  }
}
.pod__meta {
  min-width: 0;
  cursor: pointer;
}
.pod__title {
  font-weight: 700;
  font-size: 1.05rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pod__service {
  font-size: 0.78rem;
  color: var(--c-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pod__expand {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  opacity: 0.65;
}
.pod__expand:hover {
  opacity: 1;
}

/* MAIN: transport + waveform */
.pod__main {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: var(--sp-4);
}
.pod__transport {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.pod__play {
  width: 56px;
  height: 56px;
}
.pod__seek {
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}
.pod__hint {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.65rem;
  color: var(--c-text-muted);
  pointer-events: none;
}
.pod__times {
  display: flex;
  justify-content: space-between;
  font-variant-numeric: tabular-nums;
  font-size: 0.74rem;
  color: var(--c-text-muted);
  padding: 0 4px;
}

/* TOOLS */
.pod__tools {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  align-items: center;
  justify-content: center;
  padding: var(--sp-1) 0;
  border-top: 1px solid var(--c-border);
  border-bottom: 1px solid var(--c-border);
}
.tool {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--r-pill);
  border: 1px solid var(--c-border);
  background: transparent;
  color: var(--c-text-soft);
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  transition:
    background var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease),
    transform var(--dur-fast) var(--ease-out);
}
.tool:hover:not(:disabled) {
  background: var(--c-bg-3);
  color: var(--c-text);
  transform: translateY(-1px);
}
.tool:active:not(:disabled) {
  transform: translateY(0) scale(0.97);
}
.tool--on {
  background: color-mix(in srgb, var(--c-success) 22%, transparent);
  border-color: var(--c-success);
  color: var(--c-success);
}
.tool:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* MIXERS */
.pod__mix {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp-4);
  align-items: center;
}
.mix {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.mix--dim {
  opacity: 0.55;
}
.mix__tag {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  align-self: flex-start;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--c-text-soft);
  background: transparent;
  border: none;
  padding: 0;
  transition: color var(--dur-fast) var(--ease);
}
.mix__tag:hover {
  color: var(--c-text);
}
.mix__tag--static {
  cursor: default;
}
.mix__tag--muted {
  color: var(--c-danger);
  text-decoration: line-through;
}
.mix__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--c);
  box-shadow: 0 0 8px var(--c);
}
.mix__slider {
  width: 100%;
}

/* Empty (no song) state — visually recede without hiding controls */
.pod--empty {
  opacity: 0.92;
}
.pod--empty .pod__transport .icon-btn,
.pod--empty .pod__tools,
.pod--empty .pod__mix {
  opacity: 0.5;
}

/* Responsive */
@media (max-width: 720px) {
  .pod {
    top: var(--header-h);
    border-radius: 22px;
    padding: var(--sp-3) var(--sp-4);
  }
  .pod__main {
    grid-template-columns: 1fr;
    gap: var(--sp-2);
  }
  .pod__transport {
    justify-content: center;
  }
  .pod__mix {
    grid-template-columns: 1fr;
    gap: var(--sp-2);
  }
  .pod__expand {
    display: none;
  }
}
</style>
