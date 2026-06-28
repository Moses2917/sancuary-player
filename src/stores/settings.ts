import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { getSettings, saveSettings } from '@/db/idb'
import { usePlayerStore } from './player'

export const useSettingsStore = defineStore('settings', () => {
  const masterVolume = ref(0.9)
  const pianoSinkId = ref('')
  const choirSinkId = ref('')
  const resumePosition = ref(false)
  const loaded = ref(false)

  async function init() {
    if (loaded.value) return
    const stored = await getSettings()
    masterVolume.value = stored.masterVolume
    pianoSinkId.value = stored.pianoSinkId ?? ''
    choirSinkId.value = stored.choirSinkId ?? ''
    resumePosition.value = stored.resumePosition ?? false

    const player = usePlayerStore()
    player.setMaster(masterVolume.value)
    await player.setPianoSink(pianoSinkId.value)
    await player.setChoirSink(choirSinkId.value)
    player.setResumePosition(resumePosition.value)
    loaded.value = true
  }

  // Debounced persistence helper.
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      void saveSettings({
        masterVolume: masterVolume.value,
        pianoSinkId: pianoSinkId.value,
        choirSinkId: choirSinkId.value,
        resumePosition: resumePosition.value,
      })
    }, 200)
  }

  /** Bind persistence watchers to a player instance. Call after init(). */
  function watchPlayer(player: ReturnType<typeof usePlayerStore>) {
    watch(
      () => player.masterVolume,
      (v) => {
        masterVolume.value = v
        scheduleSave()
      },
    )
    watch(
      () => player.pianoSinkId,
      (v) => {
        pianoSinkId.value = v
        scheduleSave()
      },
    )
    watch(
      () => player.choirSinkId,
      (v) => {
        choirSinkId.value = v
        scheduleSave()
      },
    )
    watch(
      () => player.resumePosition,
      (v) => {
        resumePosition.value = v
        player.setResumePosition(v)
        scheduleSave()
      },
    )
  }

  return {
    masterVolume,
    pianoSinkId,
    choirSinkId,
    resumePosition,
    loaded,
    init,
    watchPlayer,
  }
})
