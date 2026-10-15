import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { RelayConnection, relayUrl, type ConnectionStatus } from '@/remote/connection'
import {
  COMMAND_TIMEOUT,
  VERSION,
  validState,
  type Operation,
  type PlaybackState,
} from '@/remote/protocol'

const STORAGE_KEY = 'sanctuary-controller'
export const useRemoteControllerStore = defineStore('remote-controller', () => {
  const status = ref<ConnectionStatus>('disconnected')
  const waiting = ref(false)
  const fresh = ref(false)
  const state = shallowRef<PlaybackState | null>(null)
  const receivedAt = ref(0)
  const error = ref('')
  const pending = ref<string[]>([])
  const panicStatus = ref('Not requested')
  const ready = computed(() => status.value === 'connected' && fresh.value && !!state.value)
  let connection: RelayConnection | undefined
  let token = ''
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  function clearPending() {
    if (pending.value.length)
      error.value = 'Connection lost. Pending commands are not retried; check the player state.'
    if (panicStatus.value === 'Sending — waiting for host acknowledgment')
      panicStatus.value = 'Unconfirmed — connection lost'
    timers.forEach(clearTimeout)
    timers.clear()
    pending.value = []
  }
  function forget() {
    token = ''
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      /* Storage may be disabled in private browsing. */
    }
  }
  function connect(code?: string) {
    connection?.stop()
    fresh.value = false
    waiting.value = false
    error.value = ''
    clearPending()
    try {
      const url = relayUrl()
      let first = true
      connection = new RelayConnection(
        url,
        () => {
          if (token) return { type: 'resume', role: 'controller', version: VERSION, token }
          if (!first) {
            waiting.value = false
            error.value = 'Pairing connection was interrupted. Enter the code again.'
          }
          first = false
          return {
            type: 'pair',
            version: VERSION,
            code: code ?? '',
            name: 'Sanctuary browser controller',
          }
        },
        (message) => {
          switch (message.type) {
            case 'waiting':
              waiting.value = true
              break
            case 'paired':
              token = message.token
              try {
                sessionStorage.setItem(STORAGE_KEY, token)
              } catch {
                /* In-memory reconnect still works. */
              }
              waiting.value = false
              break
            case 'resumed':
              waiting.value = false
              break
            case 'state':
              if (!validState(message.state)) {
                error.value = 'Invalid state from the player.'
                disconnect()
                break
              }
              state.value = message.state
              receivedAt.value = performance.now()
              fresh.value = true
              break
            case 'offline':
              fresh.value = false
              clearPending()
              break
            case 'result': {
              const id = message.result.requestId
              if (!timers.has(id)) break
              clearTimeout(timers.get(id))
              timers.delete(id)
              pending.value = pending.value.filter((p) => p !== id)
              error.value = message.result.ok
                ? ''
                : (message.result.error?.message ?? 'Command failed.')
              if (id === panicRequest)
                panicStatus.value = message.result.ok
                  ? 'Acknowledged — host completed Panic Stop'
                  : `Failed — ${error.value}`
              break
            }
            case 'revoked':
              error.value = 'Access revoked. Pair again on the player.'
              disconnect()
              break
            case 'error':
              error.value = message.message
              waiting.value = false
              if (
                [
                  'INVALID_SESSION',
                  'VERSION',
                  'REJECTED',
                  'EXPIRED',
                  'INVALID_CODE',
                  'RATE_LIMIT',
                ].includes(message.code)
              )
                disconnect()
              break
          }
        },
        (value) => {
          status.value = value
          if (value !== 'connected') {
            fresh.value = false
            clearPending()
          }
          if (value === 'disconnected') forget()
        },
      )
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Could not connect.'
    }
  }
  function pair(code: string) {
    forget()
    state.value = null
    connect(code)
  }
  function resume() {
    try {
      token = sessionStorage.getItem(STORAGE_KEY) ?? ''
    } catch {
      token = ''
    }
    if (token) connect()
  }
  function disconnect() {
    connection?.stop()
    connection = undefined
    forget()
    waiting.value = false
    fresh.value = false
    clearPending()
  }
  let panicRequest = ''
  function send(operation: Operation) {
    if (!ready.value || !state.value) {
      if (operation.action === 'panic') panicStatus.value = 'Not sent — disconnected or refreshing'
      return
    }
    const requestId = crypto.randomUUID()
    if (operation.action === 'panic') {
      panicRequest = requestId
      panicStatus.value = 'Sending — waiting for host acknowledgment'
    }
    const sent = connection?.send({
      type: 'command',
      command: { version: VERSION, requestId, context: state.value.context, operation },
    })
    if (!sent) {
      fresh.value = false
      clearPending()
      return
    }
    pending.value = [...pending.value, requestId]
    timers.set(
      requestId,
      setTimeout(() => {
        timers.delete(requestId)
        pending.value = pending.value.filter((p) => p !== requestId)
        error.value = 'No host acknowledgment. Outcome unknown; command will not be retried.'
        if (requestId === panicRequest) panicStatus.value = 'Unconfirmed — acknowledgment timed out'
      }, COMMAND_TIMEOUT),
    )
  }
  return {
    status,
    waiting,
    fresh,
    state,
    receivedAt,
    error,
    pending,
    panicStatus,
    ready,
    pair,
    resume,
    disconnect,
    send,
  }
})
