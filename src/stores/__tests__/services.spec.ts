import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useServicesStore } from '@/stores/services'
import { useLibraryStore } from '@/stores/library'
import { makeNoiseWavFile } from '@/__tests__/helpers/audio'
import * as idb from '@/db/idb'

async function seedSong(lib: ReturnType<typeof useLibraryStore>, title = 'Song') {
  return lib.addSong({
    title,
    piano: makeNoiseWavFile('p.wav'),
    choir: makeNoiseWavFile('c.wav'),
  })
}

describe('services store', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    const db = await idb.getDB()
    await db.clear('services')
  })

  it('creates a service with empty items', async () => {
    const services = useServicesStore()
    await services.init()
    const svc = await services.create({ name: 'Sunday Morning', date: '2026-06-22' })
    expect(svc.name).toBe('Sunday Morning')
    expect(svc.date).toBe('2026-06-22')
    expect(svc.items).toEqual([])
    expect(services.services.length).toBe(1)
  })

  it('creates a service with no date', async () => {
    const services = useServicesStore()
    await services.init()
    const svc = await services.create({ name: 'Midweek' })
    expect(svc.date).toBeUndefined()
  })

  it('uses a default name when blank', async () => {
    const services = useServicesStore()
    await services.init()
    const svc = await services.create({ name: '   ' })
    expect(svc.name).toBe('Untitled service')
  })

  it('renames a service and clears an empty date', async () => {
    const services = useServicesStore()
    await services.init()
    const svc = await services.create({ name: 'Old', date: '2026-06-22' })
    await services.rename(svc.id, { name: 'New', date: '   ' })
    const updated = services.getById(svc.id)
    expect(updated?.name).toBe('New')
    expect(updated?.date).toBeUndefined()
  })

  it('removes a service', async () => {
    const services = useServicesStore()
    await services.init()
    const svc = await services.create({ name: 'X' })
    await services.remove(svc.id)
    expect(services.services.length).toBe(0)
  })

  it('addItems appends library songs as playlist items', async () => {
    const services = useServicesStore()
    const lib = useLibraryStore()
    await Promise.all([services.init(), lib.init()])
    const svc = await services.create({ name: 'S' })
    const a = await seedSong(lib, 'A')
    const b = await seedSong(lib, 'B')

    await services.addItems(svc.id, [a, b])

    const items = services.getById(svc.id)?.items ?? []
    expect(items.length).toBe(2)
    expect(items[0]?.songId).toBe(a.id)
    expect(items[0]?.pianoVolume).toBe(1)
    expect(items[0]?.choirVolume).toBe(1)
    expect(items[0]?.id).not.toBe(items[1]?.id)
  })

  it('reorder moves an item from one position to another', async () => {
    const services = useServicesStore()
    const lib = useLibraryStore()
    await Promise.all([services.init(), lib.init()])
    const svc = await services.create({ name: 'S' })
    const a = await seedSong(lib, 'A')
    const b = await seedSong(lib, 'B')
    const c = await seedSong(lib, 'C')
    await services.addItems(svc.id, [a, b, c])

    // Move A (index 0) to the end (index 2)
    await services.reorder(svc.id, 0, 2)
    const ids = services.getById(svc.id)?.items.map((i) => i.songId)
    expect(ids).toEqual([b.id, c.id, a.id])
  })

  it('reorder ignores out-of-range indices', async () => {
    const services = useServicesStore()
    const lib = useLibraryStore()
    await Promise.all([services.init(), lib.init()])
    const svc = await services.create({ name: 'S' })
    const a = await seedSong(lib, 'A')
    await services.addItems(svc.id, [a])
    await services.reorder(svc.id, 0, 5) // no-op
    expect(services.getById(svc.id)?.items.length).toBe(1)
  })

  it('updateItem patches per-item volumes', async () => {
    const services = useServicesStore()
    const lib = useLibraryStore()
    await Promise.all([services.init(), lib.init()])
    const svc = await services.create({ name: 'S' })
    const a = await seedSong(lib)
    await services.addItems(svc.id, [a])
    const itemId = services.getById(svc.id)?.items[0]?.id ?? ''
    await services.updateItem(svc.id, itemId, { pianoVolume: 0.3, choirVolume: 0.7 })
    const item = services.getById(svc.id)?.items[0]
    expect(item?.pianoVolume).toBe(0.3)
    expect(item?.choirVolume).toBe(0.7)
  })

  it('removeItem removes only the targeted item', async () => {
    const services = useServicesStore()
    const lib = useLibraryStore()
    await Promise.all([services.init(), lib.init()])
    const svc = await services.create({ name: 'S' })
    const a = await seedSong(lib, 'A')
    const b = await seedSong(lib, 'B')
    await services.addItems(svc.id, [a, b])
    const firstItemId = services.getById(svc.id)?.items[0]?.id ?? ''
    await services.removeItem(svc.id, firstItemId)
    const items = services.getById(svc.id)?.items ?? []
    expect(items.length).toBe(1)
    expect(items[0]?.songId).toBe(b.id)
  })

  it('persists across a fresh store instance', async () => {
    const services = useServicesStore()
    await services.init()
    await services.create({ name: 'Persisted' })
    setActivePinia(createPinia())
    const services2 = useServicesStore()
    await services2.init()
    expect(services2.services.length).toBe(1)
    expect(services2.services[0]?.name).toBe('Persisted')
  })
})
