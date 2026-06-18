import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import ServicesView from '@/views/ServicesView.vue'
import { useServicesStore } from '@/stores/services'
import * as idb from '@/db/idb'

describe('ServicesView', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    const db = await idb.getDB()
    await db.clear('services')
  })

  async function mountView() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'services', component: ServicesView },
        {
          path: '/services/:id',
          name: 'service-detail',
          component: { template: '<div/>' },
        },
        { path: '/library', name: 'library', component: { template: '<div/>' } },
      ],
    })
    await router.push('/')
    await router.isReady()
    const wrapper = mount(ServicesView, { global: { plugins: [router] } })
    await flushPromises()
    return { wrapper, router }
  }

  it('shows the empty state when no services exist', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.text()).toMatch(/no services yet/i)
  })

  it('renders service cards for existing services', async () => {
    const services = useServicesStore()
    await services.init()
    await services.create({ name: 'Sunday Morning', date: '2026-06-22' })
    await services.create({ name: 'Wednesday Prayer' })

    const { wrapper } = await mountView()
    expect(wrapper.text()).toContain('Sunday Morning')
    expect(wrapper.text()).toContain('Wednesday Prayer')
    expect(wrapper.findAllComponents({ name: 'ServiceCard' }).length).toBe(2)
  })

  it('opens the editor modal on New service click', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.findComponent({ name: 'ServiceEditor' }).props('open')).toBe(false)
    await wrapper.get('.btn--primary').trigger('click')
    expect(wrapper.findComponent({ name: 'ServiceEditor' }).props('open')).toBe(true)
  })
})
