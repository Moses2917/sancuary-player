import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from '@/stores/settings'
import { usePlayerStore } from '@/stores/player'
import * as idb from '@/db/sqlite'

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

  it('restores persisted sink ids onto the player', async () => {
    await idb.saveSettings({
      masterVolume: 0.9,
      pianoSinkId: 'dev-piano',
      choirSinkId: 'dev-choir',
    })
    const settings = useSettingsStore()
    const player = usePlayerStore()
    await settings.init()
    expect(settings.pianoSinkId).toBe('dev-piano')
    expect(settings.choirSinkId).toBe('dev-choir')
    expect(player.pianoSinkId).toBe('dev-piano')
    expect(player.choirSinkId).toBe('dev-choir')
  })

  it('defaults sink ids to empty (both tracks share system default)', async () => {
    const settings = useSettingsStore()
    const player = usePlayerStore()
    await settings.init()
    expect(settings.pianoSinkId).toBe('')
    expect(settings.choirSinkId).toBe('')
    expect(player.pianoSinkId).toBe('')
    expect(player.choirSinkId).toBe('')
  })

  it('restores the resume-position flag', async () => {
    await idb.saveSettings({ masterVolume: 0.9, resumePosition: true })
    const settings = useSettingsStore()
    const player = usePlayerStore()
    await settings.init()
    expect(settings.resumePosition).toBe(true)
    expect(player.resumePosition).toBe(true)
  })

  it('watchPlayer persists sink and resumePosition changes (debounced)', async () => {
    const saveSpy = vi.spyOn(idb, 'saveSettings').mockResolvedValue({
      id: 'app',
      masterVolume: 0.9,
    })
    const settings = useSettingsStore()
    const player = usePlayerStore()
    await settings.init()
    settings.watchPlayer(player)

    vi.useFakeTimers()
    await player.setPianoSink('new-sink')
    await player.setChoirSink('other-sink')
    player.setResumePosition(true)
    await nextTick()
    vi.advanceTimersByTime(300)
    vi.useRealTimers()

    expect(saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pianoSinkId: 'new-sink',
        choirSinkId: 'other-sink',
        resumePosition: true,
      }),
    )
    saveSpy.mockRestore()
  })

  it('persists the System default fallback after a saved output disappears', async () => {
    const saveSpy = vi.spyOn(idb, 'saveSettings').mockResolvedValue({
      id: 'app',
      masterVolume: 0.9,
    })
    const settings = useSettingsStore()
    const player = usePlayerStore()
    await settings.init()
    settings.watchPlayer(player)
    await player.setPianoSink('missing-output')

    vi.useFakeTimers()
    await player.reconcileOutputSinks([
      { deviceId: 'available-output', kind: 'audiooutput' } as MediaDeviceInfo,
    ])
    await nextTick()
    vi.advanceTimersByTime(300)
    vi.useRealTimers()

    expect(saveSpy).toHaveBeenLastCalledWith(expect.objectContaining({ pianoSinkId: '' }))
    saveSpy.mockRestore()
  })
})
