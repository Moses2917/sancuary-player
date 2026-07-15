import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, type DOMWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SongImporter from '@/components/SongImporter.vue'
import { useLibraryStore } from '@/stores/library'
import { makeNoiseWavFile } from '@/__tests__/helpers/audio'
import * as idb from '@/db/sqlite'

describe('SongImporter', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    const db = await idb.getDB()
    await db.clear('songs')
  })

  function mountImporter() {
    return mount(SongImporter, { props: { open: true } })
  }

  /** Inject a file into a wrapper's file input and fire its change event. */
  async function setFile(input: DOMWrapper<Element>, file: File) {
    const el = input.element as HTMLInputElement
    Object.defineProperty(el, 'files', {
      value: [file],
      configurable: true,
    })
    await input.trigger('change')
  }

  const saveDisabled = (wrapper: ReturnType<typeof mountImporter>) =>
    wrapper.find('.btn--primary[disabled]').exists()

  it('renders nothing when open is false', () => {
    const wrapper = mount(SongImporter, { props: { open: false } })
    expect(wrapper.find('.modal').exists()).toBe(false)
  })

  it('shows two DOM-attached file inputs when open', () => {
    const wrapper = mountImporter()
    const inputs = wrapper.findAll('input[type=file]')
    expect(inputs.length).toBe(2)
  })

  it('keeps the save button disabled until both tracks are picked', async () => {
    const wrapper = mountImporter()
    const inputs = wrapper.findAll('input[type=file]')

    expect(saveDisabled(wrapper)).toBe(true)

    // Only piano picked → still disabled
    await setFile(inputs[0]!, makeNoiseWavFile('p.wav'))
    expect(saveDisabled(wrapper)).toBe(true)

    // Choir picked too → now enabled
    await setFile(inputs[1]!, makeNoiseWavFile('c.wav'))
    expect(saveDisabled(wrapper)).toBe(false)
  })

  it('saves the song via the library store and emits saved', async () => {
    const lib = useLibraryStore()
    await lib.init()
    const wrapper = mountImporter()
    const inputs = wrapper.findAll('input[type=file]')

    await wrapper.get('input[type=text]').setValue('My Hymn')
    await setFile(inputs[0]!, makeNoiseWavFile('holy-piano.mp3'))
    await setFile(inputs[1]!, makeNoiseWavFile('holy-choir.mp3'))

    await wrapper.get('.btn--primary').trigger('click')
    // addSong awaits a SQLite bridge write that resolves over several microtask
    // hops; wait for the 'saved' event rather than a fixed flush count.
    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeTruthy())

    expect(lib.songs.length).toBe(1)
    expect(lib.songs[0]?.title).toBe('My Hymn')
  })

  it('derives the title from the piano filename when left blank', async () => {
    const lib = useLibraryStore()
    await lib.init()
    const wrapper = mountImporter()
    const inputs = wrapper.findAll('input[type=file]')

    await setFile(inputs[0]!, makeNoiseWavFile('Amazing Grace.mp3'))
    await setFile(inputs[1]!, makeNoiseWavFile('choir.mp3'))

    await wrapper.get('.btn--primary').trigger('click')
    await vi.waitFor(() => expect(lib.songs.length).toBe(1))

    expect(lib.songs[0]?.title).toBe('Amazing Grace')
  })

  it('emits close when the Cancel button is clicked', async () => {
    const wrapper = mountImporter()
    await wrapper.get('.btn--ghost').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
