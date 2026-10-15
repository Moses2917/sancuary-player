import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import App from '@/App.vue'
import RemoteView from '@/views/RemoteView.vue'
import { useRemoteControllerStore } from '@/stores/remoteController'
import { getFakeAudioInstances, resetFakeAudioInstances } from '@/__tests__/setup'
import { state } from '@/remote/__tests__/fixtures'

describe('Remote Control mode', () => {
  let wrapper: VueWrapper
  beforeEach(() => {
    setActivePinia(createPinia())
    resetFakeAudioInstances()
    sessionStorage.clear()
  })
  afterEach(() => {
    wrapper?.unmount()
    vi.restoreAllMocks()
  })
  async function open() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/remote', component: RemoteView, meta: { remote: true } }],
    })
    await router.push('/remote#code=123456')
    wrapper = mount(App, { global: { plugins: [router] } })
    await flushPromises()
    return router
  }
  it('prefills and removes pairing data without initializing local storage or audio', async () => {
    const storage = vi.spyOn(indexedDB, 'open')
    const router = await open()
    expect((wrapper.get('#pair-code').element as HTMLInputElement).value).toBe('123456')
    expect(router.currentRoute.value.hash).toBe('')
    expect(storage).not.toHaveBeenCalled()
    expect(getFakeAudioInstances()).toHaveLength(0)
    expect(wrapper.find('.pod').exists()).toBe(false)
  })
  it('uses host state, explicit mix commands and disconnected panic gating', async () => {
    await open()
    const remote = useRemoteControllerStore()
    const send = vi.spyOn(remote, 'send').mockImplementation(() => {})
    remote.state = { ...state(), status: 'error', isPlaying: true, error: 'One stem failed' }
    remote.status = 'connected'
    remote.fresh = true
    await flushPromises()
    const pause = wrapper.findAll('button').find((b) => b.text() === 'Pause')!
    await pause.trigger('click')
    expect(send).toHaveBeenCalledWith({ action: 'pause' })
    await wrapper.get('input[aria-label="master"]').setValue('0.4')
    expect(send).toHaveBeenCalledWith({ action: 'volume', channel: 'master', value: 0.4 })
    remote.fresh = false
    await flushPromises()
    const panic = wrapper.findAll('button').find((b) => b.text() === 'Panic Stop')!
    expect(panic.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Panic Stop unavailable')
    expect(getFakeAudioInstances()).toHaveLength(0)
  })
})
