import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PlaylistRow from '@/components/PlaylistRow.vue'
import { makeNoiseWavFile } from '@/__tests__/helpers/audio'
import type { PlaylistItem, Song } from '@/types'

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

function makeItem(overrides: Partial<PlaylistItem> = {}): PlaylistItem {
  return { id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1, ...overrides }
}

function mountRow(props: Partial<InstanceType<typeof PlaylistRow>['$props']> = {}) {
  return mount(PlaylistRow, {
    props: {
      item: makeItem(),
      song: makeSong(),
      index: 0,
      isCurrent: false,
      isPlaying: false,
      dragging: false,
      dragOver: false,
      ...props,
    },
  })
}

describe('PlaylistRow', () => {
  it('renders the song title and the 1-based index', () => {
    const wrapper = mountRow({ index: 2 })
    expect(wrapper.text()).toContain('Amazing Grace')
    expect(wrapper.get('.row__index').text()).toBe('3')
  })

  it('emits play when the art button is clicked', async () => {
    const wrapper = mountRow()
    await wrapper.get('.row__art').trigger('click')
    expect(wrapper.emitted('play')).toBeTruthy()
  })

  it('emits update:piano and update:choir when sliders move', async () => {
    const wrapper = mountRow()
    const sliders = wrapper.findAllComponents({ name: 'VolumeSlider' })
    await sliders[0]!.vm.$emit('update:modelValue', 0.4)
    await sliders[1]!.vm.$emit('update:modelValue', 0.6)
    expect(wrapper.emitted('update:piano')?.[0]?.[0]).toBeCloseTo(0.4, 2)
    expect(wrapper.emitted('update:choir')?.[0]?.[0]).toBeCloseTo(0.6, 2)
  })

  it('emits remove when the trash button is clicked', async () => {
    const wrapper = mountRow()
    await wrapper.get('.icon-btn--danger').trigger('click')
    expect(wrapper.emitted('remove')).toBeTruthy()
  })

  it('shows a pause icon when current and playing', () => {
    const playing = mountRow({ isCurrent: true, isPlaying: true })
    const idle = mountRow({ isCurrent: false, isPlaying: false })
    expect(playing.find('.row__art--playing').exists()).toBe(true)
    expect(idle.find('.row__art--playing').exists()).toBe(false)
  })

  it('emits dragstart / dragend from the grip handle', async () => {
    const wrapper = mountRow()
    await wrapper.get('.row__grip').trigger('dragstart')
    expect(wrapper.emitted('dragstart')).toBeTruthy()
    await wrapper.get('.row__grip').trigger('dragend')
    expect(wrapper.emitted('dragend')).toBeTruthy()
  })
})
