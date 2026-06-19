import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as idb from '@/db/idb'
import type { PlaylistItem, Service, Song } from '@/types'
import { uid } from '@/utils'

export const useServicesStore = defineStore('services', () => {
  const services = ref<Service[]>([])
  const ready = ref(false)
  const loading = ref(false)

  async function init() {
    if (ready.value) return
    loading.value = true
    services.value = await idb.getAllServices()
    ready.value = true
    loading.value = false
  }

  /** Force a re-read from idb — used after restoring a backup. */
  async function reload() {
    services.value = await idb.getAllServices()
  }

  function getById(id: string): Service | undefined {
    return services.value.find((s) => s.id === id)
  }

  async function create(input: { name: string; date?: string }): Promise<Service> {
    const svc: Service = {
      id: uid('svc'),
      name: input.name.trim() || 'Untitled service',
      date: input.date?.trim() || undefined,
      items: [],
      createdAt: Date.now(),
    }
    await idb.putService(svc)
    services.value = [...services.value, svc]
    return svc
  }

  async function rename(id: string, patch: { name?: string; date?: string }) {
    const svc = getById(id)
    if (!svc) return
    const next: Service = { ...svc }
    if (patch.name !== undefined) next.name = patch.name.trim() || svc.name
    if (patch.date !== undefined) next.date = patch.date.trim() || undefined
    await idb.putService(next)
    services.value = services.value.map((s) => (s.id === id ? next : s))
  }

  async function remove(id: string) {
    await idb.deleteService(id)
    services.value = services.value.filter((s) => s.id !== id)
  }

  async function addItems(id: string, songs: Song[]) {
    const svc = getById(id)
    if (!svc) return
    const newItems: PlaylistItem[] = songs.map((song) => ({
      id: uid('item'),
      songId: song.id,
      pianoVolume: 1,
      choirVolume: 1,
    }))
    const next: Service = { ...svc, items: [...svc.items, ...newItems] }
    await idb.putService(next)
    services.value = services.value.map((s) => (s.id === id ? next : s))
  }

  async function reorder(id: string, from: number, to: number) {
    const svc = getById(id)
    if (!svc) return
    const items = [...svc.items]
    if (from < 0 || from >= items.length || to < 0 || to >= items.length) return
    const removed = items.splice(from, 1)
    const moved = removed[0]
    if (!moved) return
    items.splice(to, 0, moved)
    const next: Service = { ...svc, items }
    await idb.putService(next)
    services.value = services.value.map((s) => (s.id === id ? next : s))
  }

  async function updateItem(
    id: string,
    itemId: string,
    patch: Partial<Pick<PlaylistItem, 'pianoVolume' | 'choirVolume'>>,
  ) {
    const svc = getById(id)
    if (!svc) return
    const items = svc.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it))
    const next: Service = { ...svc, items }
    await idb.putService(next)
    services.value = services.value.map((s) => (s.id === id ? next : s))
  }

  async function removeItem(id: string, itemId: string) {
    const svc = getById(id)
    if (!svc) return
    const items = svc.items.filter((it) => it.id !== itemId)
    const next: Service = { ...svc, items }
    await idb.putService(next)
    services.value = services.value.map((s) => (s.id === id ? next : s))
  }

  return {
    services,
    ready,
    loading,
    init,
    reload,
    getById,
    create,
    rename,
    remove,
    addItems,
    reorder,
    updateItem,
    removeItem,
  }
})
