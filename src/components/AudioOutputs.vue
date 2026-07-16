<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Headphones, X } from '@lucide/vue'
import { usePlayerStore } from '@/stores/player'

/**
 * Output routing panel: choose which audio output device each track
 * (piano / choir) is sent to. Uses HTMLMediaElement.setSinkId under the
 * hood; gracefully hides itself on Safari and other browsers that lack
 * the API.
 */
const player = usePlayerStore()

const emit = defineEmits<{ (e: 'close'): void }>()

const devices = ref<MediaDeviceInfo[]>([])
const loading = ref(false)

async function refresh() {
  if (!player.outputRoutingSupported) return
  loading.value = true
  try {
    devices.value = await player.enumerateOutputs()
    await player.reconcileOutputSinks(devices.value)
  } finally {
    loading.value = false
  }
}

function labelFor(d: MediaDeviceInfo): string {
  return d.label || `Device ${d.deviceId.slice(0, 6)}`
}

function onDeviceChange() {
  void refresh()
}

onMounted(async () => {
  await refresh()
  navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange)
})

onBeforeUnmount(() => {
  navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange)
})

function selectPiano(e: Event) {
  const v = (e.target as HTMLSelectElement).value
  void player.setPianoSink(v)
}
function selectChoir(e: Event) {
  const v = (e.target as HTMLSelectElement).value
  void player.setChoirSink(v)
}

/** Send both tracks to the same (default) device. */
function resetToDefault() {
  void player.setPianoSink('')
  void player.setChoirSink('')
}
</script>

<template>
  <div class="outputs surface" role="dialog" aria-label="Audio outputs">
    <header class="outputs__head">
      <div class="outputs__title">
        <Headphones :size="16" :stroke-width="2" />
        <span>Audio outputs</span>
      </div>
      <button class="icon-btn outputs__close" title="Close" @click="emit('close')">
        <X :size="16" :stroke-width="2" />
      </button>
    </header>

    <p v-if="!player.outputRoutingSupported" class="outputs__unsupported">
      This browser doesn't support per-track output routing. Use Chrome, Edge, or Firefox 136+ to
      send piano and choir to separate devices.
    </p>

    <template v-else>
      <p v-if="loading" class="outputs__hint">Detecting devices…</p>

      <div class="outputs__rows">
        <div class="outputs__row">
          <span class="outputs__tag">
            <span class="outputs__dot" style="--c: var(--c-piano)"></span>
            Piano
          </span>
          <select
            class="outputs__select"
            :value="player.pianoSinkId"
            :disabled="loading"
            @change="selectPiano"
          >
            <option value="">System default</option>
            <option v-for="d in devices" :key="d.deviceId" :value="d.deviceId">
              {{ labelFor(d) }}
            </option>
          </select>
        </div>

        <div class="outputs__row">
          <span class="outputs__tag">
            <span class="outputs__dot" style="--c: var(--c-choir)"></span>
            Choir
          </span>
          <select
            class="outputs__select"
            :value="player.choirSinkId"
            :disabled="loading"
            @change="selectChoir"
          >
            <option value="">System default</option>
            <option v-for="d in devices" :key="d.deviceId" :value="d.deviceId">
              {{ labelFor(d) }}
            </option>
          </select>
        </div>
      </div>

      <div class="outputs__actions">
        <button class="outputs__reset" @click="resetToDefault">Reset both to default</button>
        <button class="outputs__refresh" title="Re-scan devices" @click="refresh">
          Refresh list
        </button>
      </div>

      <details class="outputs__advanced">
        <summary>Rehearsal tools</summary>
        <label class="outputs__toggle">
          <input
            type="checkbox"
            :checked="player.resumePosition"
            @change="player.setResumePosition(($event.target as HTMLInputElement).checked)"
          />
          <span>
            <strong>Remember playhead position</strong>
            <small>Saves where you left off in each song, so you can resume a rehearsal.</small>
          </span>
        </label>
      </details>
    </template>
  </div>
</template>

<style scoped>
.outputs {
  position: absolute;
  top: auto;
  bottom: calc(100% + 8px);
  right: 0;
  z-index: 40;
  min-width: 300px;
  max-width: 360px;
  padding: 12px 14px;
  background: rgba(250, 250, 252, 0.96);
  border: 1px solid var(--c-border);
  border-radius: 12px;
  box-shadow: var(--sh-lg);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.outputs__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.outputs__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 650;
  font-size: 0.82rem;
  letter-spacing: -0.01em;
}
.outputs__close {
  width: 26px;
  height: 26px;
}
.outputs__hint,
.outputs__unsupported {
  font-size: 0.78rem;
  color: var(--c-text-muted);
  line-height: 1.4;
}
.outputs__unsupported {
  color: var(--c-text-soft);
  background: rgba(118, 118, 128, 0.12);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-md);
}
.outputs__rows {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.outputs__row {
  display: grid;
  grid-template-columns: 60px 1fr;
  align-items: center;
  gap: var(--sp-2);
}
.outputs__tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--c-text-muted);
}
.outputs__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--c);
}
.outputs__select {
  width: 100%;
  min-height: 29px;
  padding: 4px 8px;
  border-radius: 7px;
  border: 1px solid var(--c-border);
  background: rgba(255, 255, 255, 0.7);
  color: var(--c-text);
  font-size: 0.8rem;
  font-family: inherit;
  cursor: pointer;
}
.outputs__select:focus {
  outline: 2px solid var(--c-accent);
  outline-offset: 1px;
}
.outputs__actions {
  display: flex;
  justify-content: space-between;
  gap: var(--sp-2);
}
.outputs__reset,
.outputs__refresh {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.74rem;
  font-weight: 550;
  color: var(--c-accent);
  cursor: pointer;
  text-decoration: none;
}
.outputs__reset:hover,
.outputs__refresh:hover {
  color: var(--c-accent-deep);
}
.outputs__advanced {
  border-top: 1px solid var(--c-border);
  padding-top: var(--sp-2);
}
.outputs__advanced summary {
  cursor: pointer;
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--c-text-muted);
  letter-spacing: 0.02em;
}
.outputs__toggle {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--sp-2);
  margin-top: var(--sp-2);
  cursor: pointer;
}
.outputs__toggle input {
  margin-top: 2px;
  accent-color: var(--c-accent);
}
.outputs__toggle strong {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--c-text);
}
.outputs__toggle small {
  display: block;
  font-size: 0.72rem;
  color: var(--c-text-muted);
  line-height: 1.4;
  margin-top: 2px;
}
</style>
