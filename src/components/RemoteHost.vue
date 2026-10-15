<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { useRemoteHostStore } from '@/stores/remoteHost'
import { isDesktopApp } from '@/db/sqlite'

defineProps<{ compact?: boolean }>()
const host = useRemoteHostStore()
const qr = ref('')
const now = ref(Date.now())
const timer = setInterval(() => {
  now.value = Date.now()
}, 1000)
onUnmounted(() => clearInterval(timer))
const remaining = computed(() => Math.max(0, Math.ceil((host.expiresAt - now.value) / 1000)))
const approvalLive = computed(() => host.approval && host.approval.expiresAt > now.value)
watch(
  () => host.code,
  async (code) => {
    qr.value = ''
    if (!code) return
    const url = new URL('/remote', host.website)
    url.hash = `code=${code}`
    try {
      const image = await QRCode.toDataURL(url.href, { width: 180, margin: 2 })
      if (host.code === code) qr.value = image
    } catch {
      host.error = 'Could not generate QR code. Enter the code manually.'
    }
  },
  { immediate: true },
)
</script>

<template>
  <section
    v-if="!compact || approvalLive"
    class="remote-host surface"
    :class="{ 'remote-host--compact': compact }"
    aria-label="Remote access"
  >
    <button v-if="!host.enabled" class="btn" @click="host.enable()">Enable Remote Control</button>
    <template v-else>
      <details open>
        <summary>Remote access · {{ host.status }}</summary>
        <p v-if="!isDesktopApp()">
          Keep this player tab open and the computer awake. Browser background playback is not
          guaranteed. If audio is blocked, click Play here on the host.
        </p>
        <div v-if="host.code && remaining" class="pairing">
          <div>
            <p>
              On your phone, open <a :href="`${host.website}/remote`">{{ host.website }}/remote</a>
            </p>
            <strong class="pairing-code">{{ host.code }}</strong>
            <p>
              Expires in {{ Math.floor(remaining / 60) }}:{{
                String(remaining % 60).padStart(2, '0')
              }}
              · Host approval required
            </p>
          </div>
          <img
            v-if="qr"
            :src="qr"
            width="180"
            height="180"
            alt="Scan to open Sanctuary Player Remote Control"
          />
        </div>
        <p v-else>
          {{
            host.controller
              ? 'Code consumed. Generate a new code to pair a replacement controller.'
              : 'No active code. Generate a new code to pair.'
          }}
        </p>
        <div v-if="approvalLive" class="approval" role="alert">
          <strong>{{ host.approval?.name }} requests control.</strong>
          <p>Approve only if you are pairing now. This replaces any existing controller.</p>
          <button class="btn btn--primary" @click="host.decide(true)">Approve controller</button>
          <button class="btn" @click="host.decide(false)">Reject</button>
        </div>
        <p v-if="host.controller">
          Controller: {{ host.controller.name }} ·
          {{ host.controller.online ? 'Connected' : 'Disconnected (two-minute recovery window)' }}
        </p>
        <div class="actions">
          <button class="btn" :disabled="host.status !== 'connected'" @click="host.regenerate()">
            Regenerate code
          </button>
          <button v-if="host.controller" class="btn" @click="host.revoke()">
            Disconnect controller
          </button>
          <button class="btn" @click="host.disable()">Disable remote access</button>
        </div>
      </details>
    </template>
    <p v-if="host.error" role="alert">{{ host.error }}</p>
  </section>
</template>

<style scoped>
.remote-host {
  padding: var(--sp-4);
  margin-bottom: var(--sp-4);
}
.remote-host--compact {
  position: fixed;
  inset: 20px 20px auto;
  z-index: 60;
  max-height: 90vh;
  overflow: auto;
}
summary,
.btn {
  min-height: 44px;
}
summary {
  cursor: pointer;
  font-weight: 600;
  align-content: center;
}
p {
  margin: 10px 0;
  color: var(--c-text-muted);
  overflow-wrap: anywhere;
}
.pairing,
.actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.pairing-code {
  font-size: 2rem;
  letter-spacing: 0.2em;
  font-variant-numeric: tabular-nums;
}
.approval {
  padding: 16px;
  border: 2px solid var(--c-accent);
  border-radius: var(--r-md);
  margin: 12px 0;
}
</style>
