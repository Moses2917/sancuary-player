import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { getSettings, saveSettings } from '@/db/idb'
import { usePlayerStore } from './player'

export const useSettingsStore = defineStore('settings', () => {
  const masterVolume = ref(0.9)
  const loaded = ref(false)

  async function init() {
    if (loaded.value) return
    const stored = await getSettings()
    masterVolume.value = stored.masterVolume
    const player = usePlayerStore()
    player.setMaster(masterVolume.value)
    loaded.value = true
  }

  // Persist master volume whenever it changes in the player.
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  function watchPlayer(player: ReturnType<typeof usePlayerStore>) {
    watch(
      () => player.masterVolume,
      (v) => {
        masterVolume.value = v
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(() => {
          void saveSettings({ masterVolume: v })
        }, 200)
      },
    )
  }

  return { masterVolume, loaded, init, watchPlayer }
})
