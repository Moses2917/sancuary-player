import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import ServicesView from '@/views/ServicesView.vue'
import { useServicesStore } from '@/stores/services'
import { useLibraryStore } from '@/stores/library'
import * as idb from '@/db/sqlite'
import { makeNoiseWavFile } from '@/__tests__/helpers/audio'

describe('ServicesView', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    const db = await idb.getDB()
    await db.clear('services')
    await db.clear('songs')
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

  it('filters services by name', async () => {
    const services = useServicesStore()
    await services.init()
    await services.create({ name: 'Sunday Morning' })
    await services.create({ name: 'Wednesday Prayer' })

    const { wrapper } = await mountView()
    expect(wrapper.findAllComponents({ name: 'ServiceCard' }).length).toBe(2)

    await wrapper.get('input[type="search"]').setValue('wednesday')
    expect(wrapper.findAllComponents({ name: 'ServiceCard' }).length).toBe(1)
    expect(wrapper.text()).toContain('Wednesday Prayer')
  })

  it('filters services by song title in their setlist', async () => {
    const library = useLibraryStore()
    await library.init()
    const song = await library.addSong({
      title: 'Amazing Grace',
      piano: makeNoiseWavFile('p.wav'),
      choir: makeNoiseWavFile('c.wav'),
    })

    const services = useServicesStore()
    await services.init()
    await services.create({ name: 'Easter Sunday' })
    const svc = await services.create({ name: 'Other Service' })
    await services.addItems(svc.id, [library.getById(song.id)!])

    const { wrapper } = await mountView()
    await wrapper.get('input[type="search"]').setValue('amazing')
    expect(wrapper.findAllComponents({ name: 'ServiceCard' }).length).toBe(1)
    expect(wrapper.text()).toContain('Other Service')
  })
})
