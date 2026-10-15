import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AudioOutputs from '@/components/AudioOutputs.vue'
import { usePlayerStore } from '@/stores/player'

describe('AudioOutputs', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    usePlayerStore().dispose()
    vi.restoreAllMocks()
  })

  it('keeps rehearsal settings usable without output routing or microphone access', async () => {
    const player = usePlayerStore()
    player.outputRoutingSupported = false
    const permission = vi.spyOn(player, 'requestOutputPermission').mockResolvedValue()
    const wrapper = mount(AudioOutputs)
    await flushPromises()

    expect(wrapper.find('.outputs__unsupported').exists()).toBe(true)
    expect(wrapper.find('select').exists()).toBe(false)
    expect(permission).not.toHaveBeenCalled()

    await wrapper.get('input[type="checkbox"]').setValue(true)
    expect(player.resumePosition).toBe(true)
    await wrapper.get('input[type="checkbox"]').setValue(false)
    expect(player.resumePosition).toBe(false)
    wrapper.unmount()
  })
})
