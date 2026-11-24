// Wrapper minimale su IndexedDB: un object store per tabella, chiave "id".
import { TABLE_NAMES, INTERNAL_TABLES } from './schema'

export const STORE_NAMES = [...TABLE_NAMES, ...INTERNAL_TABLES, 'outbox', 'conflicts', 'blobs', 'kv']
const DB_VERSION = 1

const connections = new Map<string, Promise<IDBDatabase>>()

export function openDb(name: string): Promise<IDBDatabase> {
  let p = connections.get(name)
  if (!p) {
    p = new Promise((resolve, reject) => {
      const req = indexedDB.open(name, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        for (const s of STORE_NAMES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === 'kv' ? 'k' : 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    connections.set(name, p)
  }
  return p
}

function wrap<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

export async function idbAll<T = any>(dbName: string, store: string): Promise<T[]> {
  const db = await openDb(dbName)
  return wrap(db.transaction(store).objectStore(store).getAll())
}
export async function idbGet<T = any>(dbName: string, store: string, key: string): Promise<T | undefined> {
  const db = await openDb(dbName)
  return wrap(db.transaction(store).objectStore(store).get(key))
}
export async function idbPut(dbName: string, store: string, value: any): Promise<void> {
  const db = await openDb(dbName)
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).put(value)
  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
    tx.onabort = () => rej(tx.error)
  })
}
export async function idbPutMany(dbName: string, store: string, values: any[]): Promise<void> {
  const db = await openDb(dbName)
  const tx = db.transaction(store, 'readwrite')
  const os = tx.objectStore(store)
  for (const v of values) os.put(v)
  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
    tx.onabort = () => rej(tx.error)
  })
}
export async function idbDelete(dbName: string, store: string, key: string): Promise<void> {
  const db = await openDb(dbName)
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).delete(key)
  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
}
export async function idbClear(dbName: string, store: string): Promise<void> {
  const db = await openDb(dbName)
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).clear()
  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
}
export async function idbDestroy(dbName: string): Promise<void> {
  const c = connections.get(dbName)
  if (c) (await c).close()
  connections.delete(dbName)
  await new Promise<void>((res) => {
    const r = indexedDB.deleteDatabase(dbName)
    r.onsuccess = r.onerror = r.onblocked = () => res()
  })
}
