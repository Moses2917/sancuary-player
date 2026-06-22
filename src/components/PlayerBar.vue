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
  <section class="pod surface" :class="{ 'pod--empty': !hasSong }">
    <header class="pod__head">
      <div class="pod__art" :class="{ 'pod__art--playing': player.isPlaying }">
        <Music :size="20" :stroke-width="1.5" />
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
        <Expand :size="16" :stroke-width="1.75" />
      </button>
    </header>

    <div class="pod__main">
      <div class="pod__transport">
        <button
          class="icon-btn"
          :disabled="!player.hasPrev"
          title="Previous"
          @click="player.prev()"
        >
          <SkipBack :size="18" :stroke-width="1.75" />
        </button>
        <button
          v-if="!player.isPlaying"
          class="icon-btn icon-btn--lg icon-btn--primary pod__play"
          :disabled="!hasSong"
          title="Play"
          @click="player.play()"
        >
          <Play :size="20" :stroke-width="2" style="margin-left: 2px" />
        </button>
        <button
          v-else
          class="icon-btn icon-btn--lg icon-btn--primary pod__play"
          title="Pause"
          @click="player.pause()"
        >
          <Pause :size="20" :stroke-width="2" />
        </button>
        <button
          class="icon-btn"
          :disabled="!player.hasNext"
          title="Next"
          @click="player.next()"
        >
          <SkipForward :size="18" :stroke-width="1.75" />
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
          :height="44"
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

    <div class="pod__tools">
      <button
        class="tool"
        :class="{ 'tool--on': !!player.loop }"
        :disabled="!hasSong"
        :title="loopLabel"
        @click="player.toggleLoop()"
      >
        <Repeat :size="13" :stroke-width="2" /> <span>Loop</span>
      </button>
      <button
        class="tool tool--letter"
        :class="{ 'tool--on': !!player.loop }"
        :disabled="!hasSong || player.duration <= 0"
        title="Set loop start (A) at playhead"
        @click="player.setLoopStart()"
      >
        A
      </button>
      <button
        class="tool tool--letter"
        :class="{ 'tool--on': !!player.loop }"
        :disabled="!hasSong || player.duration <= 0"
        title="Set loop end (B) at playhead"
        @click="player.setLoopEnd()"
      >
        B
      </button>
      <span class="tool__sep" aria-hidden="true" />
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
        <Flag :size="13" :stroke-width="2" /> <span>{{ placeCueMode ? 'Placing…' : 'Cue' }}</span>
      </button>
      <button
        class="tool"
        :disabled="!hasSong || player.duration <= 0"
        title="Drop a fade-out region at the playhead (drag the gray box to reposition)"
        @click="addFadeHere"
      >
        <ScissorsLineDashed :size="13" :stroke-width="2" /> <span>Fade</span>
      </button>
    </div>

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
          <Volume2 :size="13" :stroke-width="2" />
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
  </section>
</template>

<style scoped>
/* Solid white card with a soft shadow, hangs below the header. */
.pod {
  position: sticky;
  top: calc(var(--header-h) + var(--sp-4));
  z-index: 25;
  width: 100%;
  max-width: 920px;
  margin: 0 auto var(--sp-6);
  padding: var(--sp-4) var(--sp-5);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  border-radius: var(--r-xl);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  box-shadow: var(--sh-md);
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
  border-radius: var(--r-md);
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f0f0f3, #e3e3e8);
  color: var(--c-text-muted);
  position: relative;
  transition: color var(--dur) var(--ease);
}
.pod__art--playing {
  color: var(--c-accent);
}
.pod__art--playing::after {
  content: '';
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--c-accent);
  border: 2px solid var(--c-surface-raised);
}
.pod__meta {
  min-width: 0;
  cursor: pointer;
}
.pod__title {
  font-weight: 650;
  font-size: 1.05rem;
  letter-spacing: -0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--c-text);
}
.pod__service {
  font-size: 0.8rem;
  color: var(--c-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}
.pod__expand {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
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
  gap: var(--sp-1);
}
.pod__play {
  margin: 0 6px;
}
.pod__seek {
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
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
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--c-text-muted);
  letter-spacing: -0.005em;
  padding: 0 2px;
}

/* TOOLS */
.pod__tools {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  align-items: center;
  padding-top: var(--sp-3);
  border-top: 1px solid var(--c-border);
}
.tool {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: var(--r-pill);
  border: none;
  background: transparent;
  color: var(--c-text-muted);
  font-size: 0.74rem;
  font-weight: 550;
  letter-spacing: -0.005em;
  transition:
    background var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}
.tool:hover:not(:disabled) {
  background: var(--c-bg-2);
  color: var(--c-text);
}
.tool--letter {
  font-weight: 650;
  font-size: 0.78rem;
  padding: 5px 9px;
  letter-spacing: 0;
}
.tool--on {
  background: var(--c-accent);
  color: #fff;
}
.tool--on:hover {
  background: var(--c-accent-deep);
  color: #fff;
}
.tool:disabled {
  opacity: 0.32;
  cursor: not-allowed;
}
.tool__sep {
  width: 1px;
  height: 14px;
  background: var(--c-border);
  margin: 0 4px;
}

/* MIXERS */
.pod__mix {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp-5);
  align-items: center;
  padding-top: var(--sp-3);
  border-top: 1px solid var(--c-border);
}
.mix {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.mix--dim {
  opacity: 0.5;
}
.mix__tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--c-text-muted);
  background: transparent;
  border: none;
  padding: 0;
  text-transform: uppercase;
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
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--c);
}
.mix__slider {
  width: 100%;
}

/* Empty (no song) state */
.pod--empty {
  opacity: 0.96;
}
.pod--empty .pod__transport .icon-btn,
.pod--empty .pod__tools,
.pod--empty .pod__mix {
  opacity: 0.4;
}

/* Responsive */
@media (max-width: 720px) {
  .pod {
    top: var(--header-h);
    padding: var(--sp-3) var(--sp-4);
    border-radius: var(--r-lg);
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
