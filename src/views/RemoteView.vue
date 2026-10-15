<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRemoteControllerStore } from '@/stores/remoteController'
import { formatTime } from '@/utils'
import VolumeSlider from '@/components/VolumeSlider.vue'

const remote = useRemoteControllerStore()
const route = useRoute()
const router = useRouter()
const code = ref('')
const clock = ref(performance.now())
const timer = setInterval(() => {
  clock.value = performance.now()
}, 100)
const state = computed(() => remote.state)
const position = computed(() => {
  if (!state.value) return 0
  const elapsed =
    remote.ready && state.value.isPlaying
      ? Math.min(1, (clock.value - remote.receivedAt) / 1000)
      : 0
  return Math.min(state.value.duration, state.value.position + Math.max(0, elapsed))
})
const busy = computed(() => !remote.ready || remote.pending.length > 0)
const songBusy = computed(
  () => busy.value || !state.value?.song || state.value.status === 'loading',
)
const connectionLabel = computed(() =>
  remote.waiting
    ? 'Waiting for approval on the player'
    : remote.status === 'connected'
      ? remote.fresh
        ? 'Connected to player'
        : 'Reconnecting — waiting for fresh player state'
      : remote.status === 'disconnected'
        ? 'Disconnected'
        : 'Reconnecting',
)
const loopStart = ref(0)
const loopEnd = ref(0)
watch(
  () => state.value?.context.revision,
  () => {
    loopStart.value = 0
    loopEnd.value = 0
  },
)
watch(
  () => state.value?.loop,
  (loop) => {
    if (loop) {
      loopStart.value = loop.start
      loopEnd.value = loop.end
    }
  },
)
onMounted(() => {
  const fromHash = new URLSearchParams(route.hash.slice(1)).get('code')
  const fromQuery = typeof route.query.code === 'string' ? route.query.code : null
  const incoming = fromHash ?? fromQuery
  if (incoming && /^\d{6}$/.test(incoming)) code.value = incoming
  if (route.hash || route.query.code) void router.replace({ path: '/remote' })
  remote.resume()
})
onUnmounted(() => {
  clearInterval(timer)
  remote.disconnect()
})
function pair() {
  if (/^\d{6}$/.test(code.value)) remote.pair(code.value)
}
function seek(delta: number) {
  if (state.value)
    remote.send({
      action: 'seek',
      position: Math.max(0, Math.min(state.value.duration, position.value + delta)),
    })
}
function loop(enable: boolean) {
  remote.send({
    action: 'loop',
    region: enable ? { start: loopStart.value, end: loopEnd.value } : null,
  })
}
function clearLoop() {
  loop(false)
  loopStart.value = 0
  loopEnd.value = 0
}
</script>

<template>
  <section class="remote">
    <h1>Remote Control</h1>
    <p role="status" aria-live="polite">{{ connectionLabel }}</p>
    <p v-if="remote.error" role="alert">{{ remote.error }}</p>
    <form v-if="!remote.ready" class="surface pairing" @submit.prevent="pair">
      <label for="pair-code">Six-digit code shown on the player</label>
      <input
        id="pair-code"
        v-model="code"
        type="text"
        inputmode="numeric"
        pattern="[0-9]{6}"
        maxlength="6"
        autocomplete="off"
        placeholder="000000"
        required
      />
      <button class="btn btn--primary" :disabled="remote.waiting || !/^\d{6}$/.test(code)">
        Connect to player
      </button>
      <p>Audio stays on the host computer. Approve the request there to continue.</p>
    </form>

    <template v-if="state">
      <section class="surface transport">
        <p>{{ state.service?.name ?? 'No service loaded' }}</p>
        <h2>{{ state.song?.title ?? 'No song loaded' }}</h2>
        <p>
          {{ state.status
          }}<span v-if="state.error" role="alert">
            · {{ state.error }} Check the host computer.</span
          >
        </p>
        <label for="remote-seek" class="sr-only">Playback position</label>
        <input
          id="remote-seek"
          type="range"
          min="0"
          :max="state.duration || 1"
          step="0.1"
          :value="position"
          :disabled="songBusy || !state.duration"
          @change="
            remote.send({
              action: 'seek',
              position: Number(($event.target as HTMLInputElement).value),
            })
          "
        />
        <p class="time">{{ formatTime(position) }} / {{ formatTime(state.duration) }}</p>
        <div class="buttons">
          <button
            class="btn"
            :disabled="songBusy || !state.hasPrev"
            @click="remote.send({ action: 'previous' })"
          >
            Previous
          </button>
          <button
            class="btn btn--primary"
            :disabled="songBusy"
            @click="remote.send({ action: state.isPlaying ? 'pause' : 'play' })"
          >
            {{ state.isPlaying ? 'Pause' : 'Play' }}
          </button>
          <button
            class="btn"
            :disabled="songBusy || !state.hasNext"
            @click="remote.send({ action: 'next' })"
          >
            Next
          </button>
          <button class="btn" :disabled="busy" @click="remote.send({ action: 'stop' })">
            Stop
          </button>
        </div>
        <div class="buttons">
          <button class="btn" :disabled="songBusy || !state.duration" @click="seek(-5)">
            −5 seconds
          </button>
          <button class="btn" :disabled="songBusy || !state.duration" @click="seek(5)">
            +5 seconds
          </button>
        </div>
        <p role="status">
          {{
            remote.pending.length
              ? 'Sending — waiting for host acknowledgment…'
              : 'Controls reflect the host player'
          }}
        </p>
      </section>

      <section class="surface panic" aria-label="Emergency control">
        <button
          class="btn panic-button"
          :disabled="!remote.ready"
          @click="remote.send({ action: 'panic' })"
        >
          Panic Stop
        </button>
        <p role="status">
          {{
            remote.ready ? remote.panicStatus : 'Disconnected / refreshing — Panic Stop unavailable'
          }}
        </p>
      </section>

      <details class="surface" open>
        <summary>Active setlist</summary>
        <p v-if="!state.queue.length">No songs queued</p>
        <button
          v-for="item in state.queue"
          :key="item.id"
          class="btn list-item"
          :aria-current="item.id === state.context.itemId ? 'true' : undefined"
          :disabled="busy"
          @click="remote.send({ action: 'select', itemId: item.id })"
        >
          {{ item.id === state.context.itemId ? '▸ ' : '' }}{{ item.title }}
        </button>
        <p>Selecting a song loads it paused.</p>
      </details>
      <details class="surface">
        <summary>Services</summary>
        <button
          v-for="service in state.services"
          :key="service.id"
          class="btn list-item"
          :disabled="busy"
          @click="remote.send({ action: 'service', serviceId: service.id })"
        >
          {{ service.name }}
        </button>
        <p>Loading a service does not start playback.</p>
      </details>
      <details class="surface">
        <summary>Mix</summary>
        <VolumeSlider
          v-for="channel in ['master', 'piano', 'choir'] as const"
          :key="channel"
          :model-value="state[channel]"
          :label="channel"
          :show-value="true"
          :disabled="busy"
          @change="
            remote.send({
              action: 'volume',
              channel,
              value: Number(($event.target as HTMLInputElement).value),
            })
          "
        />
        <div v-for="channel in ['piano', 'choir'] as const" :key="channel" class="buttons">
          <button
            class="btn"
            :disabled="busy"
            :aria-pressed="state[channel === 'piano' ? 'pianoMuted' : 'choirMuted']"
            @click="
              remote.send({
                action: 'mute',
                channel,
                value: !state[channel === 'piano' ? 'pianoMuted' : 'choirMuted'],
              })
            "
          >
            Mute {{ channel }}
          </button>
          <button
            class="btn"
            :disabled="busy"
            :aria-pressed="state.solo === channel"
            @click="
              remote.send({ action: 'solo', channel: state.solo === channel ? null : channel })
            "
          >
            Solo {{ channel }}
          </button>
        </div>
      </details>
      <details class="surface">
        <summary>Cues</summary>
        <button
          v-for="marker in state.markers"
          :key="marker.id"
          class="btn list-item"
          :disabled="songBusy"
          @click="remote.send({ action: 'cue', markerId: marker.id })"
        >
          {{ marker.label }} · {{ formatTime(marker.time) }}
        </button>
        <p v-if="!state.markers.length">No markers on this song</p>
      </details>
      <details class="surface">
        <summary>A–B loop · {{ state.loop ? 'On' : 'Off' }}</summary>
        <div class="buttons">
          <button class="btn" :disabled="songBusy" @click="loopStart = position">
            Set A here · {{ formatTime(loopStart) }}
          </button>
          <button class="btn" :disabled="songBusy" @click="loopEnd = position">
            Set B here · {{ formatTime(loopEnd) }}
          </button>
          <button
            class="btn"
            :disabled="songBusy || loopEnd <= loopStart || loopEnd > state.duration"
            @click="loop(true)"
          >
            {{ state.loop ? 'Apply A–B' : 'Enable loop' }}
          </button>
          <button v-if="state.loop" class="btn" :disabled="songBusy" @click="loop(false)">
            Disable loop
          </button>
          <button class="btn" :disabled="songBusy" @click="clearLoop">Clear loop</button>
        </div>
      </details>
    </template>
    <button v-if="remote.status !== 'disconnected'" class="btn" @click="remote.disconnect()">
      Disconnect
    </button>
  </section>
</template>

<style scoped>
.remote {
  max-width: 680px;
  margin: auto;
  padding: env(safe-area-inset-top) env(safe-area-inset-right)
    max(24px, env(safe-area-inset-bottom)) env(safe-area-inset-left);
}
.surface {
  padding: 20px;
  margin: 16px 0;
}
h1,
h2 {
  overflow-wrap: anywhere;
}
p {
  margin: 10px 0;
}
.pairing {
  display: grid;
  gap: 12px;
}
.pairing input {
  width: 100%;
  font-size: 1.5rem;
  letter-spacing: 0.2em;
  padding: 12px;
}
.btn,
input,
summary {
  min-height: 44px;
  min-width: 44px;
}
summary {
  cursor: pointer;
  align-content: center;
  font-weight: 600;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0;
}
.buttons .btn {
  flex: 1;
}
#remote-seek {
  width: 100%;
}
.time {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.panic {
  border: 2px solid #b42318;
  margin: 28px 0;
}
.panic-button {
  width: 100%;
  background: #b42318;
  color: white;
  font-weight: 700;
  min-height: 56px;
}
.list-item {
  display: flex;
  width: 100%;
  justify-content: flex-start;
  text-align: left;
  white-space: normal;
  margin: 8px 0;
}
.list-item[aria-current] {
  border-color: var(--c-accent);
}
:deep(.slider__input) {
  min-height: 44px;
}
:deep(.slider) {
  margin: 16px 0;
}
</style>
