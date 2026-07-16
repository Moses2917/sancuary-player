import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type DOMWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import SongImporter from '@/components/SongImporter.vue'
import { useLibraryStore } from '@/stores/library'
import { makeNoiseWavFile } from '@/__tests__/helpers/audio'
import * as idb from '@/db/sqlite'

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }))
vi.mock('@tauri-apps/plugin-fs', () => ({ readFile: vi.fn() }))

const mockOpenFileDialog = vi.mocked(openFileDialog)
const mockReadFile = vi.mocked(readFile)

describe('SongImporter', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    mockOpenFileDialog.mockReset()
    mockReadFile.mockReset()
    const db = await idb.getDB()
    await db.clear('songs')
  })

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
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
    expect(inputs[0]?.attributes('accept')).toBe(
      '.aac,.aif,.aiff,.flac,.m4a,.mp3,.ogg,.oga,.opus,.wav,.wave,.webm',
    )
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

  it('rejects a non-audio file selected through the file input', async () => {
    const wrapper = mountImporter()
    const input = wrapper.findAll('input[type=file]')[0]!
    const json = new File(['{}'], 'app.json', { type: 'application/json' })

    await setFile(input, json)

    expect(saveDisabled(wrapper)).toBe(true)
    expect(wrapper.text()).toContain('Choose an audio file')
  })

  it('uses the native filtered picker and reads the selected file in desktop builds', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true })
    mockOpenFileDialog.mockResolvedValue('/Music/Amazing Grace - Piano.wav')
    mockReadFile.mockResolvedValue(new Uint8Array([1, 2, 3]))
    const wrapper = mountImporter()

    await wrapper.findAll('.drop')[0]!.trigger('click')

    await vi.waitFor(() => {
      expect(mockReadFile).toHaveBeenCalledWith('/Music/Amazing Grace - Piano.wav')
    })
    expect(mockOpenFileDialog).toHaveBeenCalledWith({
      title: 'Choose piano audio file',
      multiple: false,
      directory: false,
      filters: [
        {
          name: 'Audio files',
          extensions: [
            'aac',
            'aif',
            'aiff',
            'flac',
            'm4a',
            'mp3',
            'ogg',
            'oga',
            'opus',
            'wav',
            'wave',
            'webm',
          ],
        },
      ],
    })
    expect(wrapper.text()).toContain('Amazing Grace - Piano.wav')
    expect(wrapper.text()).not.toContain('Could not read the selected audio file')
  })

  it('stages both native audio files before saving the song in a desktop build', async () => {
    const mockInvoke = vi.fn((command: string, ..._args: unknown[]) =>
      Promise.resolve(command === 'get_song' ? null : undefined),
    )
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: { invoke: mockInvoke },
      configurable: true,
    })
    mockOpenFileDialog.mockResolvedValueOnce('/Music/Amazing Grace - Piano.wav')
    mockOpenFileDialog.mockResolvedValueOnce('/Music/Amazing Grace - Choir.wav')
    mockReadFile.mockResolvedValueOnce(new Uint8Array([1, 2, 3]))
    mockReadFile.mockResolvedValueOnce(new Uint8Array([4, 5, 6]))
    const wrapper = mountImporter()

    await wrapper.findAll('.drop')[0]!.trigger('click')
    await vi.waitFor(() => expect(mockReadFile).toHaveBeenCalledTimes(1))
    await wrapper.findAll('.drop')[1]!.trigger('click')
    await vi.waitFor(() => expect(mockReadFile).toHaveBeenCalledTimes(2))
    await wrapper.get('.btn--primary').trigger('click')

    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeTruthy())

    const stageCalls = mockInvoke.mock.calls.filter(([command]) => command === 'stage_audio')
    expect(stageCalls).toHaveLength(2)
    expect(
      stageCalls.map(([, , options]) => (options as { headers: Record<string, string> }).headers),
    ).toEqual([
      expect.objectContaining({ 'X-Sanctuary-Track': 'piano', 'X-Sanctuary-Mime': 'audio/wav' }),
      expect.objectContaining({ 'X-Sanctuary-Track': 'choir', 'X-Sanctuary-Mime': 'audio/wav' }),
    ])
    expect(stageCalls.every(([, data]) => data instanceof Uint8Array)).toBe(true)
    expect(mockInvoke).toHaveBeenCalledWith(
      'put_song',
      expect.objectContaining({ uploadId: expect.any(String) }),
      undefined,
    )
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
