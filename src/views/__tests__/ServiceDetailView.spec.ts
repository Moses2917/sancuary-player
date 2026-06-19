import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import ServiceDetailView from '@/views/ServiceDetailView.vue'
import { useServicesStore } from '@/stores/services'
import { useLibraryStore } from '@/stores/library'
import { usePlayerStore } from '@/stores/player'
import { makeNoiseWavFile } from '@/__tests__/helpers/audio'
import { resetFakeAudioInstances } from '@/__tests__/setup'
import * as idb from '@/db/idb'

async function seedSong(lib: ReturnType<typeof useLibraryStore>, title = 'Song') {
  return lib.addSong({
    title,
    piano: makeNoiseWavFile('p.wav'),
    choir: makeNoiseWavFile('c.wav'),
  })
}

describe('ServiceDetailView', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    resetFakeAudioInstances()
    const db = await idb.getDB()
    await Promise.all([db.clear('services'), db.clear('songs'), db.clear('settings')])
    // jsdom doesn't implement window.print — stub it so handlers don't throw.
    window.print = vi.fn(() => {})
    document.body.removeAttribute('data-print')
  })

  async function mountView(id: string) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/services', name: 'services', component: { template: '<div/>' } },
        {
          path: '/services/:id',
          name: 'service-detail',
          component: ServiceDetailView,
          props: true,
        },
      ],
    })
    await router.push(`/services/${id}`)
    await router.isReady()
    const wrapper = mount(ServiceDetailView, {
      props: { id },
      global: { plugins: [router] },
    })
    await flushPromises()
    return { wrapper, router }
  }

  it('shows the not-found state for a missing service id', async () => {
    const { wrapper } = await mountView('does-not-exist')
    expect(wrapper.text()).toMatch(/service not found/i)
  })

  it('renders the service name and an empty-playlist hint', async () => {
    const services = useServicesStore()
    await services.init()
    const svc = await services.create({ name: 'Sunday Morning', date: '2026-06-22' })
    const { wrapper } = await mountView(svc.id)
    expect(wrapper.text()).toContain('Sunday Morning')
    expect(wrapper.text()).toMatch(/empty playlist/i)
  })

  it('lists the playlist items', async () => {
    const services = useServicesStore()
    const lib = useLibraryStore()
    await Promise.all([services.init(), lib.init()])
    const svc = await services.create({ name: 'S' })
    const a = await seedSong(lib, 'Amazing Grace')
    const b = await seedSong(lib, 'Holy Holy Holy')
    await services.addItems(svc.id, [a, b])

    const { wrapper } = await mountView(svc.id)
    expect(wrapper.text()).toContain('Amazing Grace')
    expect(wrapper.text()).toContain('Holy Holy Holy')
    expect(wrapper.findAllComponents({ name: 'PlaylistRow' }).length).toBe(2)
  })

  it('Play service loads the queue into the player', async () => {
    const services = useServicesStore()
    const lib = useLibraryStore()
    await Promise.all([services.init(), lib.init()])
    const svc = await services.create({ name: 'S' })
    const a = await seedSong(lib, 'Amazing Grace')
    await services.addItems(svc.id, [a])

    const { wrapper } = await mountView(svc.id)
    const player = usePlayerStore()
    expect(player.currentSong).toBeNull()

    await wrapper.get('.btn--primary').trigger('click')
    await flushPromises()

    expect(player.currentSong?.id).toBe(a.id)
    expect(player.queue.length).toBe(1)
  })

  it('Print button flags the body and triggers window.print', async () => {
    const services = useServicesStore()
    const lib = useLibraryStore()
    await Promise.all([services.init(), lib.init()])
    const svc = await services.create({ name: 'Sunday Print', date: '2026-06-22' })
    const song = await seedSong(lib, 'Amazing Grace')
    await services.addItems(svc.id, [song])

    const { wrapper } = await mountView(svc.id)

    // Find the Print button by its icon — it's the first non-primary .btn in the head actions.
    const buttons = wrapper.findAll('.head__actions .btn')
    const printBtn = buttons.find((b) => b.attributes('title') === 'Print or save as PDF')
    expect(printBtn).toBeTruthy()

    await printBtn!.trigger('click')
    expect(document.body.getAttribute('data-print')).toBe('setlist')
    expect(window.print).toHaveBeenCalled()

    // The cleanup listener restores the flag once afterprint fires.
    window.dispatchEvent(new Event('afterprint'))
    expect(document.body.getAttribute('data-print')).toBeNull()
  })
})
