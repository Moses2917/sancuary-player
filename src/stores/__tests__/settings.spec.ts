import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from '@/stores/settings'
import { usePlayerStore } from '@/stores/player'
import * as idb from '@/db/idb'

describe('settings store', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    const db = await idb.getDB()
    await db.clear('settings')
  })

  it('initialises with the default master volume when nothing is stored', async () => {
    const settings = useSettingsStore()
    const player = usePlayerStore()
    await settings.init()
    expect(settings.masterVolume).toBe(0.9)
    expect(player.masterVolume).toBe(0.9)
    expect(settings.loaded).toBe(true)
  })

  it('init is idempotent', async () => {
    const settings = useSettingsStore()
    await settings.init()
    await settings.init()
    expect(settings.loaded).toBe(true)
  })

  it('restores a persisted master volume onto the player', async () => {
    await idb.saveSettings({ masterVolume: 0.42 })
    const settings = useSettingsStore()
    const player = usePlayerStore()
    await settings.init()
    expect(settings.masterVolume).toBe(0.42)
    expect(player.masterVolume).toBe(0.42)
  })

  it('watchPlayer persists master-volume changes (debounced)', async () => {
    const saveSpy = vi.spyOn(idb, 'saveSettings').mockResolvedValue({
      id: 'app',
      masterVolume: 0.55,
    })
    const settings = useSettingsStore()
    const player = usePlayerStore()
    await settings.init()
    settings.watchPlayer(player)

    // Enable fake timers BEFORE triggering the change so the debounced
    // setTimeout is captured; Vue's scheduler is microtask-based so it still
    // flushes under fake timers via nextTick.
    vi.useFakeTimers()
    player.setMaster(0.55)
    await nextTick()
    vi.advanceTimersByTime(300)
    vi.useRealTimers()

    expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({ masterVolume: 0.55 }))
    saveSpy.mockRestore()
  })
})
