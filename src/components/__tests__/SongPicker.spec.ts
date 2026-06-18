import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SongPicker from '@/components/SongPicker.vue'
import { makeNoiseWavFile } from '@/__tests__/helpers/audio'
import type { Song } from '@/types'

function makeSong(id: string, title: string): Song {
  return {
    id,
    title,
    piano: { name: 'p.wav', blob: makeNoiseWavFile('p.wav') },
    choir: { name: 'c.wav', blob: makeNoiseWavFile('c.wav') },
    bundled: false,
    createdAt: 1,
  }
}

const songs = [
  makeSong('s1', 'Amazing Grace'),
  makeSong('s2', 'How Great Thou Art'),
  makeSong('s3', 'Holy Holy Holy'),
]

describe('SongPicker', () => {
  function mountPicker(excludeIds: string[] = []) {
    return mount(SongPicker, {
      props: { open: true, songs, excludeIds },
    })
  }

  it('lists all available songs (excluding the excluded ones)', () => {
    const wrapper = mountPicker(['s2'])
    const titles = wrapper.findAll('.pick__title').map((n) => n.text())
    expect(titles).toContain('Amazing Grace')
    expect(titles).toContain('Holy Holy Holy')
    expect(titles).not.toContain('How Great Thou Art')
  })

  it('toggles selection on click', async () => {
    const wrapper = mountPicker()
    const first = wrapper.findAll('.pick')[0]!
    await first.trigger('click')
    expect(first.classes()).toContain('pick--on')
    await first.trigger('click')
    expect(first.classes()).not.toContain('pick--on')
  })

  it('filters by the search query', async () => {
    const wrapper = mountPicker()
    await wrapper.get('input[type=search]').setValue('holy')
    const titles = wrapper.findAll('.pick__title').map((n) => n.text())
    expect(titles).toContain('Holy Holy Holy')
    expect(titles).not.toContain('Amazing Grace')
  })

  it('enables the Add button only when at least one song is selected', async () => {
    const wrapper = mountPicker()
    expect(wrapper.find('.btn--primary[disabled]').exists()).toBe(true)
    await wrapper.findAll('.pick')[0]!.trigger('click')
    expect(wrapper.find('.btn--primary[disabled]').exists()).toBe(false)
  })

  it('emits add with the selected songs (in list order)', async () => {
    const wrapper = mountPicker()
    await wrapper.findAll('.pick')[2]!.trigger('click') // Holy Holy Holy
    await wrapper.findAll('.pick')[0]!.trigger('click') // Amazing Grace
    await wrapper.get('.btn--primary').trigger('click')
    const emitted = wrapper.emitted('add')
    expect(emitted).toBeTruthy()
    const payload = emitted![0]![0] as Song[]
    // Selection is emitted in source-list order regardless of click order.
    expect(payload.map((s) => s.id)).toEqual(['s1', 's3'])
  })

  it('emits close on Cancel', async () => {
    const wrapper = mountPicker()
    await wrapper.get('.btn--ghost').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
