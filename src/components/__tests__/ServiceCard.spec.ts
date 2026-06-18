import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ServiceCard from '@/components/ServiceCard.vue'
import type { Service } from '@/types'

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: 'svc_1',
    name: 'Sunday Morning',
    date: '2026-06-22',
    items: [
      { id: 'i1', songId: 's1', pianoVolume: 1, choirVolume: 1 },
      { id: 'i2', songId: 's2', pianoVolume: 1, choirVolume: 1 },
    ],
    createdAt: 1,
    ...overrides,
  }
}

async function mountCard(service = makeService()) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div/>' } },
      {
        path: '/services/:id',
        name: 'service-detail',
        component: { template: '<div/>' },
      },
    ],
  })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(ServiceCard, {
    props: { service },
    global: { plugins: [router] },
  })
  return { wrapper, router }
}

describe('ServiceCard', () => {
  it('shows the service name and song count', () => {
    const wrapper = mount(ServiceCard, {
      props: { service: makeService() },
      global: { stubs: ['router-link'] },
    })
    expect(wrapper.text()).toContain('Sunday Morning')
    expect(wrapper.text()).toContain('2 songs')
  })

  it('shows a friendly label when no date is set', () => {
    const wrapper = mount(ServiceCard, {
      props: { service: makeService({ date: undefined }) },
      global: { stubs: ['router-link'] },
    })
    expect(wrapper.text()).toContain('No date')
  })

  it('navigates to the service detail route on click', async () => {
    const { wrapper, router } = await mountCard()
    await wrapper.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('service-detail')
    expect(router.currentRoute.value.params.id).toBe('svc_1')
  })

  it('navigates on Enter key for keyboard users', async () => {
    const { wrapper, router } = await mountCard()
    await wrapper.trigger('keydown.enter')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('service-detail')
  })
})
