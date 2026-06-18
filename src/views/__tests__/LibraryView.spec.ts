import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import LibraryView from '@/views/LibraryView.vue'
import { useLibraryStore } from '@/stores/library'
import { makeNoiseWavFile } from '@/__tests__/helpers/audio'
import * as idb from '@/db/idb'

describe('LibraryView', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    const db = await idb.getDB()
    await db.clear('songs')
  })

  async function mountView() {
    const wrapper = mount(LibraryView, { global: { plugins: [] } })
    await flushPromises()
    return wrapper
  }

  it('shows the empty state when the library has no songs', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toMatch(/no songs yet/i)
  })

  it('lists songs present in the store', async () => {
    const lib = useLibraryStore()
    await lib.init()
    await lib.addSong({
      title: 'Amazing Grace',
      piano: makeNoiseWavFile('p.wav'),
      choir: makeNoiseWavFile('c.wav'),
    })
    await lib.addSong({
      title: 'Holy Holy Holy',
      piano: makeNoiseWavFile('p2.wav'),
      choir: makeNoiseWavFile('c2.wav'),
    })

    const wrapper = await mountView()
    expect(wrapper.text()).toContain('Amazing Grace')
    expect(wrapper.text()).toContain('Holy Holy Holy')
    expect(wrapper.findAll('.song').length).toBe(2)
  })

  it('opens the importer when the Add song button is clicked', async () => {
    const wrapper = await mountView()
    expect(wrapper.findComponent({ name: 'SongImporter' }).props('open')).toBe(false)
    await wrapper.get('.btn--primary').trigger('click')
    expect(wrapper.findComponent({ name: 'SongImporter' }).props('open')).toBe(true)
  })

  it('renders the Piano/Choir track badges for each song', async () => {
    const lib = useLibraryStore()
    await lib.init()
    await lib.addSong({
      title: 'Test',
      piano: makeNoiseWavFile('p.wav'),
      choir: makeNoiseWavFile('c.wav'),
    })
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('Piano')
    expect(wrapper.text()).toContain('Choir')
  })
})
