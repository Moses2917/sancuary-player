<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import PlayerBar from '@/components/PlayerBar.vue'
import { useSettingsStore } from '@/stores/settings'
import { usePlayerStore } from '@/stores/player'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'

const settings = useSettingsStore()
const player = usePlayerStore()

onMounted(async () => {
  await settings.init()
  settings.watchPlayer(player)
})

useKeyboardShortcuts()
</script>

<template>
  <AppHeader />
  <main class="app-main">
    <RouterView v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </RouterView>
  </main>
  <PlayerBar />
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition:
    opacity var(--dur) var(--ease),
    transform var(--dur) var(--ease);
}
.fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
