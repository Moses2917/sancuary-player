import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PlayerBar from '@/components/PlayerBar.vue'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'
import { makeNoiseWavFile } from '@/__tests__/helpers/audio'
import { resetFakeAudioInstances } from '@/__tests__/setup'
import type { PlaylistItem, Service, Song } from '@/types'
import * as idb from '@/db/sqlite'

function makeSong(): Song {
  return {
    id: 's1',
    title: 'Amazing Grace',
    piano: { name: 'p.wav', blob: makeNoiseWavFile('p.wav') },
    choir: { name: 'c.wav', blob: makeNoiseWavFile('c.wav') },
    bundled: false,
    createdAt: 1,
  }
}

function makeService(items: PlaylistItem[]): Service {
  return { id: 'svc_1', name: 'Sunday Morning', items, createdAt: 1 }
}

describe('PlayerBar', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    resetFakeAudioInstances()
    const db = await idb.getDB()
    await db.clear('settings')
    // Prime the settings store so App-style init doesn't run.
    const settings = useSettingsStore()
    await settings.init()
  })

  async function mountBar() {
    const wrapper = mount(PlayerBar, { global: { plugins: [] } })
    await flushPromises()
    return wrapper
  }

  it('shows the empty state copy when nothing is loaded', async () => {
    const wrapper = await mountBar()
    expect(wrapper.text()).toContain('Nothing playing')
    expect(wrapper.classes()).toContain('pod--empty')
  })

  it('reflects the current song title after loading a service', async () => {
    const wrapper = await mountBar()
    const player = usePlayerStore()
    const a = makeSong()
    await player.load(
      makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }]),
      [a],
      0,
      false,
    )
    await flushPromises()
    expect(wrapper.text()).toContain('Amazing Grace')
    expect(wrapper.text()).toContain('Sunday Morning')
    expect(wrapper.classes()).not.toContain('pod--empty')
  })

  it('toggles playback via the main transport button', async () => {
    const wrapper = await mountBar()
    const player = usePlayerStore()
    const a = makeSong()
    await player.load(
      makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }]),
      [a],
      0,
      false,
    )
    await flushPromises()

    await wrapper.get('.icon-btn--lg').trigger('click')
    await flushPromises()
    expect(player.isPlaying).toBe(true)

    await wrapper.get('.icon-btn--lg').trigger('click')
    expect(player.isPlaying).toBe(false)
  })

  it('the piano mute toggle silences only the piano track in the player', async () => {
    const wrapper = await mountBar()
    const player = usePlayerStore()
    const a = makeSong()
    await player.load(
      makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }]),
      [a],
      0,
      true,
    )
    await flushPromises()

    const pianoMuteBtn = wrapper.findAll('.mix__tag')[0]!
    await pianoMuteBtn.trigger('click')
    expect(player.pianoMuted).toBe(true)
    expect(player.choirMuted).toBe(false)
  })

  it('disables prev/next at the queue boundaries', async () => {
    const wrapper = await mountBar()
    const player = usePlayerStore()
    const a = makeSong()
    await player.load(
      makeService([{ id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 }]),
      [a],
      0,
      false,
    )
    await flushPromises()

    const buttons = wrapper.findAll('.pod__transport .icon-btn')
    // [prev, play/pause, next]
    expect(buttons[0]!.attributes('disabled')).toBeDefined()
    expect(buttons[2]!.attributes('disabled')).toBeDefined()
  })
})
