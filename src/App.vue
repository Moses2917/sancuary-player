<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import PlayerBar from '@/components/PlayerBar.vue'
import PlayerSession from '@/components/PlayerSession.vue'
import RemoteHost from '@/components/RemoteHost.vue'

const route = useRoute()

// "Bare" routes (e.g. the Now Playing projection view) hide app chrome.
const isBare = computed(() => !!route.meta.bare)

const isRemote = computed(() => !!route.meta.remote)
</script>

<template>
  <AppHeader v-if="!isBare" />
  <main class="app-main">
    <PlayerSession v-if="!isRemote">
      <PlayerBar v-if="!isBare" />
      <RemoteHost :compact="isBare" />
    </PlayerSession>
    <RouterView v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </RouterView>
  </main>
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
  transform: translateY(6px);
}
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
