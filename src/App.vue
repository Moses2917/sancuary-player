<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { PanelLeftClose, PanelLeftOpen } from '@lucide/vue'
import AppHeader from '@/components/AppHeader.vue'
import PlayerBar from '@/components/PlayerBar.vue'
import { useSettingsStore } from '@/stores/settings'
import { usePlayerStore } from '@/stores/player'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useMediaSession } from '@/composables/useMediaSession'

const settings = useSettingsStore()
const player = usePlayerStore()
const route = useRoute()
const sidebarCollapsed = ref(false)

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
  <div class="app-shell" :class="{ 'app-shell--sidebar-collapsed': sidebarCollapsed && !isBare }">
    <AppHeader v-if="!isBare" :collapsed="sidebarCollapsed" />
    <button
      v-if="!isBare"
      class="sidebar-toggle"
      :title="sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'"
      :aria-label="sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'"
      @click="sidebarCollapsed = !sidebarCollapsed"
    >
      <component
        :is="sidebarCollapsed ? PanelLeftOpen : PanelLeftClose"
        :size="17"
        :stroke-width="1.8"
      />
    </button>
    <main class="app-main">
      <PlayerBar v-if="!isBare" />
      <RouterView v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </RouterView>
    </main>
  </div>
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
.app-shell {
  display: contents;
}
.sidebar-toggle {
  position: fixed;
  z-index: 45;
  top: 14px;
  left: calc(var(--sidebar-w) - 42px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--c-text-muted);
  transition:
    background var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}
.sidebar-toggle:hover {
  background: rgba(60, 60, 67, 0.1);
  color: var(--c-text);
}
.app-shell--sidebar-collapsed .sidebar-toggle {
  left: 12px;
  background: rgba(255, 255, 255, 0.84);
  border-color: var(--c-border);
  box-shadow: var(--sh-sm);
}
@media (max-width: 780px) {
  .sidebar-toggle {
    display: none;
  }
}
</style>
