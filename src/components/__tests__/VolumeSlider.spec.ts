import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import VolumeSlider from '@/components/VolumeSlider.vue'

describe('VolumeSlider', () => {
  it('emits update:modelValue when the range input changes', async () => {
    const wrapper = mount(VolumeSlider, {
      props: { modelValue: 0.5, label: 'Piano' },
    })
    await wrapper.find('input').setValue(0.8)
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toBeCloseTo(0.8, 2)
  })

  it('renders the label when provided', () => {
    const wrapper = mount(VolumeSlider, {
      props: { modelValue: 0.5, label: 'Master' },
    })
    expect(wrapper.text()).toContain('Master')
  })

  it('omits the label element when not provided', () => {
    const wrapper = mount(VolumeSlider, { props: { modelValue: 0.5 } })
    expect(wrapper.find('.slider__label').exists()).toBe(false)
  })

  it('disables the input when disabled prop is set', () => {
    const wrapper = mount(VolumeSlider, {
      props: { modelValue: 0.5, disabled: true },
    })
    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
  })

  it('passes through min / max / step attributes', () => {
    const wrapper = mount(VolumeSlider, {
      props: { modelValue: 30, min: 0, max: 100, step: 1 },
    })
    const input = wrapper.find('input')
    expect(input.attributes('min')).toBe('0')
    expect(input.attributes('max')).toBe('100')
    expect(input.attributes('step')).toBe('1')
  })

  it('clamps the accent style var based on the current value', () => {
    const wrapper = mount(VolumeSlider, {
      props: { modelValue: 0.25, min: 0, max: 1 },
    })
    const style = wrapper.find('.slider').attributes('style') ?? ''
    // 0.25 of full range → 25%
    expect(style).toMatch(/--pct:\s*25%/)
  })

  it('renders a percentage readout when showValue is true', () => {
    const wrapper = mount(VolumeSlider, {
      props: { modelValue: 0.65, showValue: true },
    })
    expect(wrapper.find('.slider__value').text()).toBe('65%')
  })

  it('hides the readout by default', () => {
    const wrapper = mount(VolumeSlider, { props: { modelValue: 0.5 } })
    expect(wrapper.find('.slider__value').exists()).toBe(false)
  })

  it('scales the percentage across a non-default range', () => {
    const wrapper = mount(VolumeSlider, {
      props: { modelValue: 50, min: 0, max: 100, showValue: true },
    })
    expect(wrapper.find('.slider__value').text()).toBe('50%')
  })
})
