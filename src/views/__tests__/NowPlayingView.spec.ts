import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import NowPlayingView from '@/views/NowPlayingView.vue'
import { usePlayerStore } from '@/stores/player'
import { useLibraryStore } from '@/stores/library'
import { resetFakeAudioInstances } from '@/__tests__/setup'
import { makeNoiseWavFile } from '@/__tests__/helpers/audio'
import * as idb from '@/db/sqlite'

describe('NowPlayingView', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    resetFakeAudioInstances()
    const db = await idb.getDB()
    await Promise.all([db.clear('songs'), db.clear('services')])
  })

  async function mountView() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'services', component: { template: '<div/>' } },
        {
          path: '/now-playing',
          name: 'now-playing',
          component: NowPlayingView,
          meta: { bare: true },
        },
      ],
    })
    await router.push('/now-playing')
    await router.isReady()
    const wrapper = mount(NowPlayingView, { global: { plugins: [router] } })
    await flushPromises()
    return { wrapper }
  }

  it('shows the empty state when nothing is loaded', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.text()).toMatch(/nothing is playing/i)
  })

  it('projects the current song title once the player is loaded', async () => {
    const library = useLibraryStore()
    await library.init()
    const song = await library.addSong({
      title: 'Amazing Grace',
      piano: makeNoiseWavFile('p.wav'),
      choir: makeNoiseWavFile('c.wav'),
    })
    const player = usePlayerStore()
    player.playSingle(song)

    const { wrapper } = await mountView()
    await flushPromises()
    // The title should appear in the headline; "Exit" should not be the whole output.
    expect(wrapper.text()).toContain('Amazing Grace')
    expect(wrapper.text()).not.toMatch(/nothing is playing/i)
  })
})
