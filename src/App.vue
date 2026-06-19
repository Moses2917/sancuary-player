<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import PlayerBar from '@/components/PlayerBar.vue'
import { useSettingsStore } from '@/stores/settings'
import { usePlayerStore } from '@/stores/player'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useMediaSession } from '@/composables/useMediaSession'

const settings = useSettingsStore()
const player = usePlayerStore()
const route = useRoute()

// "Bare" routes (e.g. the Now Playing projection view) hide app chrome.
const isBare = computed(() => !!route.meta.bare)

onMounted(async () => {
  await settings.init()
  settings.watchPlayer(player)
})

useKeyboardShortcuts()
useMediaSession()
</script>

<template>
  <AppHeader v-if="!isBare" />
  <main class="app-main">
    <RouterView v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </RouterView>
  </main>
  <PlayerBar v-if="!isBare" />
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition:
    opacity var(--dur) var(--ease),
    transform var(--dur) var(--ease-out);
}
.fade-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.992);
}
.fade-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.992);
}
</style>
