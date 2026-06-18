import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AppIcon from '@/components/AppIcon.vue'

describe('AppIcon', () => {
  it('renders an svg element', () => {
    const wrapper = mount(AppIcon, { props: { name: 'play' } })
    expect(wrapper.element.tagName.toLowerCase()).toBe('svg')
  })

  it.each([
    ['play'],
    ['pause'],
    ['next'],
    ['prev'],
    ['stop'],
    ['volume'],
    ['volume-mute'],
    ['music'],
    ['calendar'],
    ['plus'],
    ['trash'],
    ['grip'],
    ['upload'],
    ['cross'],
    ['check'],
    ['x'],
    ['edit'],
    ['arrow-left'],
    ['chevron-right'],
  ])('renders without error for known icon "%s"', (name) => {
    const wrapper = mount(AppIcon, { props: { name } })
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('falls back to a circle for an unknown icon name', () => {
    const wrapper = mount(AppIcon, { props: { name: 'does-not-exist' } })
    // The fallback template renders a <circle> element
    expect(wrapper.find('circle').exists()).toBe(true)
  })

  it('applies the size prop to width/height', () => {
    const wrapper = mount(AppIcon, { props: { name: 'play', size: 32 } })
    expect(wrapper.find('svg').attributes('width')).toBe('32')
    expect(wrapper.find('svg').attributes('height')).toBe('32')
  })

  it('accepts a string size', () => {
    const wrapper = mount(AppIcon, { props: { name: 'play', size: '24' } })
    expect(wrapper.find('svg').attributes('width')).toBe('24')
  })
})
