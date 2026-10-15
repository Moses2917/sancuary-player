<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { usePlayerStore } from '@/stores/player'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useMediaSession } from '@/composables/useMediaSession'
import { useRemoteHostStore } from '@/stores/remoteHost'

const settings = useSettingsStore()
const player = usePlayerStore()
let disposed = false
let stop: (() => void) | undefined
onMounted(async () => {
  await settings.init()
  if (!disposed) stop = settings.watchPlayer(player)
})
onUnmounted(() => {
  disposed = true
  stop?.()
  player.pause()
  useRemoteHostStore().disable()
})
useKeyboardShortcuts()
useMediaSession()
</script>

<template><slot /></template>
