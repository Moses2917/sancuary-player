import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ServiceArtwork from '../ServiceArtwork.vue'

describe('ServiceArtwork', () => {
  it('keeps a stable local color for a service and updates when the service changes', async () => {
    const first = mount(ServiceArtwork, { props: { seed: 'service-1' } })
    const same = mount(ServiceArtwork, { props: { seed: 'service-1' } })
    expect(first.attributes('style')).toBe(same.attributes('style'))
    await first.setProps({ seed: 'service-2' })
    expect(first.attributes('style')).not.toBe(same.attributes('style'))
    expect(first.attributes('aria-hidden')).toBe('true')
  })
})
