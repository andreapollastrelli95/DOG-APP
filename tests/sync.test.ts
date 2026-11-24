// Collaudo della coda offline e della sincronizzazione contro un Supabase SIMULATO in memoria.
// Verifica la logica dell'app (coda, ordine, conflitti, rifiuti): NON sostituisce una prova su un vero Supabase.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { Store } from '../src/lib/store'
import { idbDestroy } from '../src/lib/idb'

class FakeSb {
  online = true
  reject: string | null = null
  tables: Record<string, any[]> = {}
  calls: string[] = []
  private net<T>(fn: () => T): any {
    if (!this.online) return Promise.resolve({ data: null, error: { message: 'TypeError: Failed to fetch' } })
    return Promise.resolve(fn())
  }
  private rows(t: string) {
    return (this.tables[t] ??= [])
  }
  from(t: string) {
    const self = this
    return {
      insert: (v: any) =>
        self.net(() => {
          self.calls.push('insert:' + t)
          if (self.reject) return { error: { message: self.reject, code: '42501' } }
          if (self.rows(t).some((r) => r.id === v.id)) return { error: { code: '23505', message: 'dup' } }
          self.rows(t).push({ ...v, updated_at: new Date().toISOString() })
          return { error: null }
        }),
      update: (v: any) => ({
        eq: (_k: string, id: string) =>
          self.net(() => {
            self.calls.push('update:' + t)
            const r = self.rows(t).find((x) => x.id === id)
            if (r) Object.assign(r, v, { updated_at: new Date().toISOString() })
            return { error: null }
          }),
      }),
      delete: () => ({
        eq: (_k: string, id: string) =>
          self.net(() => {
            self.calls.push('delete:' + t)
            self.tables[t] = self.rows(t).filter((x) => x.id !== id)
            return { error: null }
          }),
      }),
      select: () => {
        const q: any = {
          eq: (_k: string, id: string) => ({ maybeSingle: () => self.net(() => ({ data: self.rows(t).find((x) => x.id === id) ?? null, error: null })), then: undefined }),
          limit: () => self.net(() => ({ data: [...self.rows(t)], error: null })),
          order: () => ({ limit: () => self.net(() => ({ data: [...self.rows(t)], error: null })) }),
        }
        return q
      },
    }
  }
  channel() {
    return { on() { return this }, subscribe() { return this } }
  }
  removeChannel() {}
}

let n = 0
function make(sb: FakeSb) {
  return new Store({ mode: 'cloud', dbName: 'sync-test-' + ++n, userId: 'u1', userName: 'Mamma', householdId: 'h1', supabase: sb as any })
}

describe('coda offline e sincronizzazione', () => {
  let sb: FakeSb
  beforeEach(() => {
    sb = new FakeSb()
  })

  it('online: la scrittura arriva subito al server e la coda resta vuota', async () => {
    const s = make(sb)
    const r = await s.insert('weights', { date: '2026-11-01', weight_kg: 30 })
    expect(sb.tables.weights).toHaveLength(1)
    expect(sb.tables.weights[0].id).toBe(r.id)
    expect(s.status.pending).toBe(0)
    expect(sb.tables.weights[0].household_id).toBe('h1')
    expect(sb.tables.weights[0].created_by).toBe('u1')
    s.stop()
  })

  it('offline: la registrazione non si perde, resta in locale e viene inviata al ritorno della rete (nell\'ordine)', async () => {
    const s = make(sb)
    sb.online = false
    const a = await s.insert('weights', { date: '2026-11-02', weight_kg: 30.1 })
    const b = await s.insert('meals', { at: new Date().toISOString(), kind: 'pasto', grams: 200 })
    await s.update('weights', a.id, { weight_kg: 30.3 })
    expect((await s.list('weights'))[0].weight_kg).toBe(30.3) // visibile subito
    expect(s.status.pending).toBe(2) // la modifica è accorpata all'inserimento ancora in coda
    expect(sb.tables.weights ?? []).toHaveLength(0)
    expect(s.status.online).toBe(false)

    sb.online = true
    await s.flush()
    expect(s.status.pending).toBe(0)
    expect(sb.tables.weights).toHaveLength(1)
    expect(sb.tables.weights[0].weight_kg).toBe(30.3)
    expect(sb.tables.meals[0].id).toBe(b.id)
    expect(sb.calls.slice(0, 2)).toEqual(['insert:weights', 'insert:meals'])
    expect(s.status.online).toBe(true)
    s.stop()
  })

  it('la stessa operazione ritrasmessa non crea duplicati', async () => {
    const s = make(sb)
    const r = await s.insert('weights', { date: '2026-11-03', weight_kg: 31 })
    await s.insert('weights', { id: r.id, date: '2026-11-03', weight_kg: 31 }).catch(() => undefined)
    expect(sb.tables.weights).toHaveLength(1)
    s.stop()
  })

  it('conflitto: se un familiare ha modificato nel frattempo, vince il server e il conflitto viene segnalato', async () => {
    const s = make(sb)
    const r = await s.insert('weights', { date: '2026-11-04', weight_kg: 30 })
    sb.online = false
    await s.update('weights', r.id, { weight_kg: 99 }) // modifica offline
    // nel frattempo un altro familiare modifica sul server (updated_at più recente)
    sb.tables.weights[0].weight_kg = 31.5
    sb.tables.weights[0].updated_at = new Date(Date.now() + 60_000).toISOString()
    sb.online = true
    await s.flush()
    expect(sb.tables.weights[0].weight_kg).toBe(31.5) // il server non è stato sovrascritto
    const c = await s.conflicts()
    expect(c).toHaveLength(1)
    expect(c[0].reason).toMatch(/altro familiare/)
    expect((await s.list('weights'))[0].weight_kg).toBe(31.5) // la cache si riallinea al server
    expect(s.status.pending).toBe(0)
    s.stop()
  })

  it('rifiuto del server (permessi): errore mostrato, nessun dato fantasma in locale', async () => {
    const s = make(sb)
    sb.reject = 'new row violates row-level security policy'
    await expect(s.insert('weights', { date: '2026-11-05', weight_kg: 30 })).rejects.toThrow(/row-level security/)
    expect(await s.list('weights')).toHaveLength(0)
    expect(s.status.pending).toBe(0)
    expect((await s.conflicts()).length).toBe(1)
    s.stop()
  })

  it('creare e poi eliminare offline non lascia tracce sul server', async () => {
    const s = make(sb)
    sb.online = false
    const r = await s.insert('weights', { date: '2026-11-08', weight_kg: 30 })
    await s.remove('weights', r.id)
    expect(s.status.pending).toBe(0)
    sb.online = true
    await s.flush()
    expect(sb.tables.weights ?? []).toHaveLength(0)
    s.stop()
  })

  it('due modifiche offline sulla stessa riga dopo una sincronizzazione: arrivano entrambe', async () => {
    const s = make(sb)
    const r = await s.insert('weights', { date: '2026-11-09', weight_kg: 30 })
    sb.online = false
    await s.update('weights', r.id, { weight_kg: 31 })
    await s.update('weights', r.id, { notes: 'dopo cena' })
    expect(s.status.pending).toBe(1)
    sb.online = true
    await s.flush()
    expect(sb.tables.weights[0].weight_kg).toBe(31)
    expect(sb.tables.weights[0].notes).toBe('dopo cena')
    expect((await s.conflicts()).length).toBe(0)
    s.stop()
  })

  it('eliminazione offline viene sincronizzata', async () => {
    const s = make(sb)
    const r = await s.insert('weights', { date: '2026-11-06', weight_kg: 30 })
    sb.online = false
    await s.remove('weights', r.id)
    expect(await s.list('weights')).toHaveLength(0)
    expect(sb.tables.weights).toHaveLength(1)
    sb.online = true
    await s.flush()
    expect(sb.tables.weights).toHaveLength(0)
    s.stop()
  })

  it('la coda sopravvive a un riavvio dell\'app (stesso database locale)', async () => {
    const s1 = make(sb)
    sb.online = false
    await s1.insert('weights', { date: '2026-11-07', weight_kg: 30 })
    const name = s1.dbName
    s1.stop()
    const s2 = new Store({ mode: 'cloud', dbName: name, userId: 'u1', userName: 'Mamma', householdId: 'h1', supabase: sb as any })
    sb.online = true
    await s2.startCloud()
    expect(sb.tables.weights).toHaveLength(1)
    s2.stop()
    await idbDestroy(name)
  })
})
