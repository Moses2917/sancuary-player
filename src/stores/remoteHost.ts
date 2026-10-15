import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { usePlayerStore } from './player'
import { useServicesStore } from './services'
import { useLibraryStore } from './library'
import { createPlaybackBridge } from '@/remote/bridge'
import { RelayConnection, relayUrl, type ConnectionStatus } from '@/remote/connection'
import { VERSION, validState } from '@/remote/protocol'

export const useRemoteHostStore = defineStore('remote-host', () => {
  const enabled = ref(false)
  const status = ref<ConnectionStatus>('disconnected')
  const code = ref('')
  const expiresAt = ref(0)
  const error = ref('')
  const approval = ref<{ id: string; name: string; expiresAt: number } | null>(null)
  const controller = ref<{ id: string; name: string; online: boolean } | null>(null)
  let connection: RelayConnection | undefined
  let bridge: ReturnType<typeof createPlaybackBridge> | undefined
  let stopWatch: (() => void) | undefined
  let positionTimer: ReturnType<typeof setInterval> | undefined
  let transportEpoch = 0
  let removedController = ''

  const website =
    import.meta.env.VITE_PUBLIC_SITE_URL ||
    (window.location.protocol.startsWith('http') &&
    !window.location.hostname.endsWith('tauri.localhost')
      ? window.location.origin
      : 'https://player.armsongs.com')

  function publish() {
    if (!bridge || !enabled.value || !controller.value?.online) return
    const state = bridge.snapshot()
    if (!validState(state) || new TextEncoder().encode(JSON.stringify(state)).length > 500_000) {
      error.value =
        'Remote metadata is invalid or exceeds the relay size limit. Check the host library.'
      disable()
      return
    }
    connection?.send({ type: 'state', state })
  }
  async function enable() {
    if (enabled.value) return
    error.value = ''
    enabled.value = true
    status.value = 'connecting'
    const attempt = ++transportEpoch
    try {
      const url = relayUrl()
      const player = usePlayerStore()
      const services = useServicesStore()
      const library = useLibraryStore()
      await Promise.all([services.init(), library.init()])
      if (!enabled.value || attempt !== transportEpoch) return
      bridge = createPlaybackBridge(player, services, library)
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('')
      let first = true
      connection = new RelayConnection(
        url,
        () => {
          const hello = first
            ? { type: 'create' as const, version: VERSION, token }
            : { type: 'resume' as const, version: VERSION, role: 'host' as const, token }
          first = false
          return hello
        },
        (message) => {
          switch (message.type) {
            case 'host':
              code.value = message.code
              expiresAt.value = message.expiresAt
              approval.value = null
              publish()
              break
            case 'approval':
              approval.value = message
              break
            case 'controller':
              if (message.id === removedController) {
                connection?.send({ type: 'revoke' })
                break
              }
              if (controller.value?.id !== message.id || controller.value.online !== message.online)
                transportEpoch++
              controller.value = message
              break
            case 'revoked':
              controller.value = null
              transportEpoch++
              break
            case 'sync':
              publish()
              break
            case 'command': {
              const epoch = transportEpoch
              const activeBridge = bridge!
              void activeBridge
                .dispatch(
                  message.command,
                  () =>
                    enabled.value &&
                    bridge === activeBridge &&
                    status.value === 'connected' &&
                    epoch === transportEpoch &&
                    controller.value?.id === message.controllerId &&
                    controller.value.online,
                )
                .then((result) => {
                  if (bridge !== activeBridge) return
                  publish()
                  connection?.send({ type: 'result', controllerId: message.controllerId, result })
                })
              break
            }
            case 'error':
              error.value = message.message
              if (['INVALID_SESSION', 'VERSION', 'INVALID_STATE'].includes(message.code)) disable()
              break
          }
        },
        (value) => {
          status.value = value
          if (value !== 'connected') {
            transportEpoch++
            approval.value = null
            if (controller.value) controller.value = { ...controller.value, online: false }
          }
          if (value === 'disconnected' && enabled.value) disable()
        },
      )
      // Position changes are bounded to 4 Hz; all other local/automatic changes publish promptly.
      stopWatch = watch(() => {
        const state = bridge!.snapshot()
        return JSON.stringify({ ...state, position: player.isPlaying ? 0 : state.position })
      }, publish)
      positionTimer = setInterval(() => {
        if (player.isPlaying) publish()
      }, 250)
      window.addEventListener('pagehide', disable)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Could not enable remote access.'
      disable()
    }
  }
  function disable() {
    enabled.value = false
    transportEpoch++
    connection?.send({ type: 'disable' })
    connection?.stop()
    connection = undefined
    stopWatch?.()
    stopWatch = undefined
    clearInterval(positionTimer)
    bridge?.dispose()
    bridge = undefined
    code.value = ''
    expiresAt.value = 0
    approval.value = null
    controller.value = null
    removedController = ''
    window.removeEventListener('pagehide', disable)
  }
  function decide(approve: boolean) {
    if (approval.value) connection?.send({ type: 'approval', id: approval.value.id, approve })
    approval.value = null
  }
  function regenerate() {
    connection?.send({ type: 'regenerate' })
  }
  function revoke() {
    transportEpoch++
    removedController = controller.value?.id ?? removedController
    controller.value = null
    approval.value = null
    // If revocation cannot reach the relay, discard host credentials rather than resume old access.
    if (!connection?.send({ type: 'revoke' })) disable()
  }
  return {
    enabled,
    status,
    code,
    expiresAt,
    error,
    approval,
    controller,
    website,
    enable,
    disable,
    decide,
    regenerate,
    revoke,
  }
})
