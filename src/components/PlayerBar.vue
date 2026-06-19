<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Expand, Flag, Music, Pause, Play, Repeat, SkipBack, SkipForward, Volume2 } from '@lucide/vue'
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

const loopLabel = computed(() => {
  if (!player.loop) return 'Loop off'
  const { start, end } = player.loop
  return `Loop ${formatTime(start)} → ${formatTime(end)}`
})

function gotoService() {
  const svc = player.service
  if (svc && svc.id !== 'preview') {
    router.push({ name: 'service-detail', params: { id: svc.id } })
  }
}

function openNowPlaying() {
  router.push({ name: 'now-playing' })
}
</script>

<template>
  <div class="player-bar" :class="{ 'player-bar--empty': !hasSong }">
    <div class="player-bar__inner">
      <!-- now playing -->
      <div class="np">
        <div class="np__art" :class="{ 'np__art--playing': player.isPlaying }">
          <Music :size="22" />
        </div>
        <div class="np__meta" @click="gotoService">
          <div class="np__title" :title="player.currentSong?.title">
            {{ player.currentSong?.title ?? 'Nothing playing' }}
          </div>
          <div class="np__sub" :title="player.service?.name">
            {{ player.service?.name ?? 'Select a song to begin' }}
          </div>
        </div>
        <button
          v-if="hasSong"
          class="icon-btn np__expand"
          title="Open full-screen Now Playing"
          @click="openNowPlaying"
        >
          <Expand :size="16" />
        </button>
      </div>

      <!-- transport + seek -->
      <div class="transport">
        <div class="transport__controls">
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
            class="icon-btn icon-btn--lg icon-btn--primary"
            :disabled="!hasSong"
            title="Play"
            @click="player.play()"
          >
            <Play :size="22" />
          </button>
          <button
            v-else
            class="icon-btn icon-btn--lg icon-btn--primary"
            title="Pause"
            @click="player.pause()"
          >
            <Pause :size="22" />
          </button>
          <button class="icon-btn" :disabled="!player.hasNext" title="Next" @click="player.next()">
            <SkipForward :size="20" />
          </button>
        </div>
        <div class="seek">
          <span class="seek__time">{{ player.currentTimeFormatted }}</span>
          <div class="seek__bar">
            <Waveform
              :peaks="peaks"
              :duration="player.duration || 0"
              :current="player.currentTime"
              :is-playing="player.isPlaying"
              :markers="player.currentMarkers"
              :loop="player.loop"
              :disabled="!hasSong"
              :height="56"
              accent="var(--c-accent)"
              @seek="onSeek"
              @marker-seek="onMarkerSeek"
              @add-cue="addMarkerHere"
            />
            <div v-if="peaksLoading" class="seek__hint">Analysing audio…</div>
          </div>
          <div class="seek__tools">
            <button
              class="tool"
              :class="{ 'tool--on': !!player.loop }"
              :disabled="!hasSong"
              :title="loopLabel"
              @click="player.toggleLoop()"
            >
              <Repeat :size="14" />
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
              :disabled="!hasSong || player.currentTime <= 0"
              title="Drop a marker at the playhead"
              @click="addMarkerHere"
            >
              <Flag :size="14" />
            </button>
          </div>
          <span class="seek__time">{{ player.durationFormatted }}</span>
        </div>
      </div>

      <!-- mixers -->
      <div class="mixers">
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
            @update:model-value="player.setChoir"
          />
        </div>
        <div class="master">
          <Volume2 :size="18" />
          <VolumeSlider
            class="master__slider"
            :model-value="player.masterVolume"
            @update:model-value="player.setMaster"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  background: linear-gradient(180deg, rgba(11, 16, 32, 0.7), rgba(11, 16, 32, 0.96));
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid var(--c-border);
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.4);
}
.player-bar__inner {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--sp-3) var(--sp-5);
  height: var(--player-h);
  display: grid;
  grid-template-columns: 1.1fr 1.6fr 1.3fr;
  gap: var(--sp-5);
  align-items: center;
}

/* now playing */
.np {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
}
.np__art {
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  border-radius: var(--r-md);
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
.np__art--playing {
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
.np__meta {
  min-width: 0;
  cursor: pointer;
}
.np__title {
  font-weight: 600;
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.np__sub {
  font-size: 0.78rem;
  color: var(--c-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.np__expand {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  opacity: 0.7;
}
.np__expand:hover {
  opacity: 1;
}

/* transport */
.transport {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.transport__controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-3);
}
.transport__controls .icon-btn[disabled] {
  opacity: 0.35;
  cursor: not-allowed;
}
.transport__controls .icon-btn--primary {
  transition:
    background var(--dur-fast) var(--ease),
    box-shadow var(--dur) var(--ease),
    transform var(--dur-fast) var(--ease-spring);
}
.seek {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.seek__time {
  font-variant-numeric: tabular-nums;
  font-size: 0.72rem;
  color: var(--c-text-muted);
  min-width: 38px;
  text-align: center;
}
.seek__tools {
  display: inline-flex;
  gap: 2px;
  align-items: center;
}
.tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  border-radius: var(--r-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--c-text-muted);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  transition:
    background var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease);
}
.tool:hover:not(:disabled) {
  background: var(--c-bg-3);
  color: var(--c-text);
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
.seek__bar {
  flex: 1;
  position: relative;
}
.seek__hint {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.65rem;
  color: var(--c-text-muted);
  pointer-events: none;
}

/* mixers */
.mixers {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: var(--sp-4);
  align-items: center;
}
.mix {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
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
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
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
.master {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  color: var(--c-text-muted);
  width: 110px;
}
.master__slider {
  flex: 1;
}

.player-bar--empty .transport__controls,
.player-bar--empty .seek,
.player-bar--empty .mixers {
  opacity: 0.5;
  pointer-events: none;
}

/* Responsive */
@media (max-width: 920px) {
  .player-bar__inner {
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    height: auto;
    min-height: var(--player-h);
    gap: var(--sp-3);
  }
  .np {
    grid-row: 1;
    grid-column: 1;
  }
  .mixers {
    grid-row: 1;
    grid-column: 2;
    grid-template-columns: auto auto;
    gap: var(--sp-3);
  }
  .master {
    display: none;
  }
  .transport {
    grid-row: 2;
    grid-column: 1 / -1;
  }
}
@media (max-width: 600px) {
  .player-bar__inner {
    padding: var(--sp-3);
  }
  .mix__slider {
    display: none;
  }
  .mixers {
    gap: var(--sp-2);
  }
}
</style>
