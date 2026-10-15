type StoreName = 'songs' | 'services' | 'settings'
let opening: Promise<IDBDatabase> | undefined

function open(): Promise<IDBDatabase> {
  return (opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('sanctuary-player', 1)
    request.onupgradeneeded = () => {
      for (const name of ['songs', 'services', 'settings']) {
        request.result.createObjectStore(name, { keyPath: 'id' })
      }
      // Keep the legacy metadata; its JSON adapter never persisted audio Blobs.
      try {
        const saved = JSON.parse(localStorage.getItem('sanctuary-player-test-storage') ?? '{}')
        for (const name of ['songs', 'services'] as const) {
          for (const row of saved[name] ?? []) request.transaction!.objectStore(name).put(row)
        }
        if (saved.settings) request.transaction!.objectStore('settings').put(saved.settings)
      } catch {
        // Leave the original untouched if it cannot be migrated.
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      opening = undefined
      reject(new Error(`Browser storage unavailable: ${request.error?.message}`))
    }
    request.onblocked = () =>
      reject(new Error('Close other Sanctuary Player tabs to upgrade storage.'))
  }))
}

export async function browserRequest<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const request = operation(tx.objectStore(store))
    tx.oncomplete = () => resolve(request.result)
    tx.onabort = () =>
      reject(new Error(`Browser storage failed: ${tx.error?.message ?? 'transaction aborted'}`))
    tx.onerror = () => reject(new Error(`Browser storage failed: ${tx.error?.message}`))
  })
}

export async function replaceBrowserData(data: {
  songs: unknown[]
  services: unknown[]
  settings?: unknown
}): Promise<void> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['songs', 'services', 'settings'], 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('Restore aborted; previous data retained.'))
    try {
      for (const name of ['songs', 'services', 'settings'] as const) tx.objectStore(name).clear()
      for (const name of ['songs', 'services'] as const) {
        for (const row of data[name]) tx.objectStore(name).put(row)
      }
      if (data.settings) tx.objectStore('settings').put(data.settings)
    } catch (error) {
      tx.abort()
      reject(error)
    }
  })
}
