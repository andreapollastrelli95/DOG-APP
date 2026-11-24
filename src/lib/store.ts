// Livello dati unico dell'app.
//  - demo : IndexedDB separato con dati di esempio (mai mescolati ai dati reali)
//  - local: IndexedDB sul dispositivo (nessun account, nessun cloud)
//  - cloud: Supabase (RLS) + cache IndexedDB + coda offline con sincronizzazione
// L'interfaccia verso le pagine è identica nei tre casi: si legge sempre da IndexedDB.
import type { SupabaseClient } from '@supabase/supabase-js'
import { idbAll, idbClear, idbDelete, idbGet, idbPut, idbPutMany } from './idb'
import { TABLES, TABLE_NAMES, type Row } from './schema'

export type Mode = 'demo' | 'local' | 'cloud'

export interface SyncStatus {
  online: boolean
  pending: number
  syncing: boolean
  lastSync: string | null
  conflicts: number
  error: string | null
}

interface OutboxOp {
  id: string // id dell'operazione
  seq: number
  op: 'insert' | 'update' | 'delete'
  table: string
  row_id: string
  values?: Record<string, any>
  base_updated_at?: string
  at: string
}

export interface ConflictRecord {
  id: string
  table: string
  row_id: string
  local_values?: Record<string, any>
  server_row?: Row | null
  reason: string
  at: string
}

export const uuid = (): string => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36))

const isNetworkError = (e: any) => {
  const msg = String(e?.message ?? e ?? '')
  return (typeof navigator !== 'undefined' && navigator.onLine === false) || /failed to fetch|networkerror|network request|load failed|fetch/i.test(msg)
}

export interface StoreOptions {
  mode: Mode
  dbName: string
  userId: string
  userName: string
  householdId: string
  supabase?: SupabaseClient | null
}

type Listener = () => void

export class Store {
  readonly mode: Mode
  readonly dbName: string
  readonly userId: string
  readonly userName: string
  readonly householdId: string
  private sb: SupabaseClient | null
  private listeners = new Set<Listener>()
  private chan: BroadcastChannel | null = null
  status: SyncStatus = { online: true, pending: 0, syncing: false, lastSync: null, conflicts: 0, error: null }
  private flushing: Promise<void> | null = null
  private channelSub: any = null
  members: Record<string, string> = {}

  authorName(id?: string | null): string {
    if (!id) return '—'
    return this.members[id] ?? (id === this.userId ? this.userName : 'Familiare')
  }

  /** Carica i nomi dei familiari (per mostrare chi ha inserito ogni dato). */
  private async loadMembers() {
    if (!this.sb) return
    const key = 'dm.members.' + this.householdId
    try {
      const { data, error } = await this.sb.from('household_members').select('user_id, profiles(display_name, email)').eq('household_id', this.householdId)
      if (error) throw error
      this.members = Object.fromEntries((data ?? []).map((m: any) => [m.user_id, m.profiles?.display_name || m.profiles?.email || 'Familiare']))
      localStorage.setItem(key, JSON.stringify(this.members))
    } catch {
      try {
        this.members = JSON.parse(localStorage.getItem(key) ?? '{}')
      } catch {
        /* cache non disponibile */
      }
    }
  }

  constructor(o: StoreOptions) {
    this.mode = o.mode
    this.dbName = o.dbName
    this.userId = o.userId
    this.userName = o.userName
    this.householdId = o.householdId
    this.sb = o.supabase ?? null
    this.members = { [o.userId]: o.userName }
    if (typeof navigator !== 'undefined') this.status.online = navigator.onLine
    if (typeof BroadcastChannel !== 'undefined') {
      this.chan = new BroadcastChannel('dm-' + this.dbName)
      this.chan.onmessage = () => this.emit(false)
    }
    if (this.mode === 'cloud' && typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.status.online = true
        void this.sync()
      })
      window.addEventListener('offline', () => {
        this.status.online = false
        this.emit(false)
      })
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(broadcast = true) {
    for (const l of this.listeners) l()
    if (broadcast) this.chan?.postMessage('changed')
  }

  // ---------- lettura ----------
  async list(table: string): Promise<Row[]> {
    return idbAll<Row>(this.dbName, table)
  }

  async get(table: string, id: string): Promise<Row | undefined> {
    return idbGet<Row>(this.dbName, table, id)
  }

  async dog(): Promise<Row | undefined> {
    return (await this.list('dogs'))[0]
  }

  // ---------- scrittura ----------
  async insert(table: string, values: Record<string, any>): Promise<Row> {
    const now = new Date().toISOString()
    const row: Row = {
      ...values,
      id: values.id ?? uuid(),
      household_id: this.householdId,
      created_at: now,
      updated_at: now,
      created_by: this.userId,
    } as Row
    await this.writeThrough('insert', table, row.id, row, undefined)
    await this.audit('insert', table, row)
    this.emit()
    return row
  }

  async update(table: string, id: string, values: Record<string, any>): Promise<Row> {
    const prev = await this.get(table, id)
    if (!prev) throw new Error('Elemento non trovato')
    const row = { ...prev, ...values, updated_at: new Date().toISOString() } as Row
    await this.writeThrough('update', table, id, row, prev.updated_at, values)
    await this.audit('update', table, row)
    this.emit()
    return row
  }

  async remove(table: string, id: string): Promise<void> {
    const prev = await this.get(table, id)
    await this.writeThrough('delete', table, id, undefined, prev?.updated_at)
    if (prev) await this.audit('delete', table, prev)
    this.emit()
  }

  private async writeThrough(op: 'insert' | 'update' | 'delete', table: string, id: string, row: Row | undefined, base?: string, patch?: Record<string, any>) {
    // 1. cache/DB locale: sempre, subito (la registrazione non si perde mai)
    if (op === 'delete') await idbDelete(this.dbName, table, id)
    else await idbPut(this.dbName, table, row)
    if (this.mode !== 'cloud') return
    // 2. cloud: accorpa le operazioni sulla stessa riga ancora in coda (evita falsi conflitti e invii inutili)
    const pending = (await idbAll<OutboxOp>(this.dbName, 'outbox')).filter((o) => o.table === table && o.row_id === id).sort((a, b) => a.seq - b.seq)
    if (op === 'update' && pending.length) {
      const target = pending.find((o) => o.op === 'insert') ?? pending[pending.length - 1]
      target.values = { ...target.values, ...stripLocal(patch ?? {}) }
      await idbPut(this.dbName, 'outbox', target)
      await this.refreshPending()
      await this.flush()
      if (this.status.error && !this.status.pending) throw new Error(this.status.error)
      return
    }
    if (op === 'delete' && pending.length) {
      for (const o of pending) await idbDelete(this.dbName, 'outbox', o.id)
      if (pending.some((o) => o.op === 'insert')) {
        await this.refreshPending() // mai arrivato al server: non c'è nulla da cancellare
        return
      }
    }
    // 3. prova subito, altrimenti accoda
    const queued: OutboxOp = {
      id: uuid(),
      seq: Date.now() * 1000 + Math.floor(Math.random() * 1000),
      op,
      table,
      row_id: id,
      values: op === 'insert' ? stripLocal(row!) : patch ? stripLocal(patch) : undefined,
      base_updated_at: base,
      at: new Date().toISOString(),
    }
    await idbPut(this.dbName, 'outbox', queued)
    await this.refreshPending()
    await this.flush()
    // errori non di rete (RLS, validazione) vengono segnalati da flush() tramite status.error
    if (this.status.error && !this.status.pending) throw new Error(this.status.error)
  }

  private async audit(action: string, table: string, row: Row) {
    if (this.mode === 'cloud') return // in cloud i log sono scritti dai trigger del database (non falsificabili)
    const def = TABLES[table]
    const entry = {
      id: uuid(),
      household_id: this.householdId,
      user_id: this.userId,
      user_name: this.userName,
      action,
      table_name: table,
      row_id: row.id,
      summary: def ? def.summary(row) : table,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    await idbPut(this.dbName, 'audit_logs', entry)
  }

  // ---------- sincronizzazione (solo cloud) ----------
  private async refreshPending() {
    this.status.pending = (await idbAll(this.dbName, 'outbox')).length
    this.status.conflicts = (await idbAll(this.dbName, 'conflicts')).length
  }

  async conflicts(): Promise<ConflictRecord[]> {
    return idbAll<ConflictRecord>(this.dbName, 'conflicts')
  }
  async dismissConflict(id: string) {
    await idbDelete(this.dbName, 'conflicts', id)
    await this.refreshPending()
    this.emit(false)
  }

  /** Invia la coda al server nell'ordine in cui è stata creata. */
  flush(): Promise<void> {
    if (this.mode !== 'cloud' || !this.sb) return Promise.resolve()
    if (this.flushing) return this.flushing
    this.flushing = this.doFlush().finally(() => {
      this.flushing = null
    })
    return this.flushing
  }

  private async doFlush() {
    const sb = this.sb!
    this.status.syncing = true
    this.status.error = null
    this.emit(false)
    try {
      const ops = (await idbAll<OutboxOp>(this.dbName, 'outbox')).sort((a, b) => a.seq - b.seq)
      for (const o of ops) {
        try {
          if (o.op === 'insert') {
            const { error } = await sb.from(o.table).insert(o.values ?? {})
            if (error && error.code !== '23505') throw error // 23505 = già inserito (ritrasmissione)
          } else if (o.op === 'update') {
            const { data: server, error: e1 } = await sb.from(o.table).select('*').eq('id', o.row_id).maybeSingle()
            if (e1) throw e1
            if (!server) {
              await this.recordConflict(o, null, 'Elemento eliminato da un altro familiare')
            } else if (o.base_updated_at && server.updated_at > o.base_updated_at) {
              await this.recordConflict(o, server as Row, 'Modificato da un altro familiare mentre eri offline: è stata mantenuta la versione più recente del server')
            } else {
              const { error } = await sb.from(o.table).update(o.values ?? {}).eq('id', o.row_id)
              if (error) throw error
            }
          } else {
            const { error } = await sb.from(o.table).delete().eq('id', o.row_id)
            if (error) throw error
          }
          await idbDelete(this.dbName, 'outbox', o.id)
        } catch (e: any) {
          if (isNetworkError(e)) {
            this.status.online = false
            break // si riprova al ritorno della connessione
          }
          // errore definitivo (RLS, vincoli): l'operazione non può riuscire; la si scarta e si segnala
          await idbDelete(this.dbName, 'outbox', o.id)
          await this.recordConflict(o, null, 'Rifiutato dal server: ' + (e?.message ?? 'errore'))
          this.status.error = e?.message ?? 'Operazione rifiutata dal server'
        }
      }
      await this.refreshPending()
      if (this.status.pending === 0) {
        await this.pull()
        this.status.lastSync = new Date().toISOString()
        this.status.online = true
      }
    } catch (e: any) {
      if (!isNetworkError(e)) this.status.error = e?.message ?? 'Errore di sincronizzazione'
      else this.status.online = false
    } finally {
      this.status.syncing = false
      await this.refreshPending()
      this.emit(false)
    }
  }

  private async recordConflict(o: OutboxOp, server: Row | null, reason: string) {
    const c: ConflictRecord = { id: uuid(), table: o.table, row_id: o.row_id, local_values: o.values, server_row: server, reason, at: new Date().toISOString() }
    await idbPut(this.dbName, 'conflicts', c)
  }

  /** Scarica dal server lo stato corrente di tutte le tabelle e lo mette nella cache. */
  private async pull() {
    const sb = this.sb!
    const tables = [...TABLE_NAMES, 'dogs', 'documents', 'ai_conversations', 'ai_messages', 'notifications']
    for (const t of tables) {
      const { data, error } = await sb.from(t).select('*').limit(5000)
      if (error) throw error
      await idbClear(this.dbName, t)
      if (data?.length) await idbPutMany(this.dbName, t, data)
    }
    const { data: logs } = await sb.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(300)
    await idbClear(this.dbName, 'audit_logs')
    if (logs?.length) await idbPutMany(this.dbName, 'audit_logs', logs)
  }

  /** Avvio cloud: sincronizza e si mette in ascolto delle modifiche dei familiari (Realtime). */
  async startCloud() {
    if (this.mode !== 'cloud' || !this.sb) return
    await this.refreshPending()
    await this.loadMembers()
    await this.flush()
    let ch: any = this.sb.channel('household-' + this.householdId)
    for (const t of ['dogs', 'weights', 'health_records', 'food_products', 'meals', 'activities', 'behavior_logs', 'expenses', 'budgets', 'appointments', 'places', 'documents']) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `household_id=eq.${this.householdId}` }, () => void this.sync())
    }
    this.channelSub = ch.subscribe()
  }

  async sync() {
    await this.flush()
    if (this.status.pending === 0 && this.sb) {
      try {
        await this.pull()
        this.status.lastSync = new Date().toISOString()
        this.emit(false)
      } catch (e: any) {
        if (!isNetworkError(e)) this.status.error = e?.message
      }
    }
  }

  stop() {
    this.chan?.close()
    if (this.channelSub && this.sb) void this.sb.removeChannel(this.channelSub)
  }

  // ---------- documenti (file) ----------
  async putBlob(id: string, blob: Blob) {
    await idbPut(this.dbName, 'blobs', { id, blob })
  }
  async getBlob(id: string): Promise<Blob | undefined> {
    return (await idbGet<{ id: string; blob: Blob }>(this.dbName, 'blobs', id))?.blob
  }
  async deleteBlob(id: string) {
    await idbDelete(this.dbName, 'blobs', id)
  }

  // ---------- esportazione / eliminazione ----------
  async exportAll(): Promise<Record<string, Row[]>> {
    const out: Record<string, Row[]> = {}
    for (const t of [...TABLE_NAMES, 'dogs', 'documents', 'audit_logs']) out[t] = await this.list(t)
    return out
  }

  /** Cancella tutti i dati di questo contesto (locale/demo/cache). */
  async wipeLocal() {
    for (const t of [...TABLE_NAMES, 'dogs', 'documents', 'ai_conversations', 'ai_messages', 'audit_logs', 'notifications', 'outbox', 'conflicts', 'blobs']) await idbClear(this.dbName, t)
    await this.refreshPending()
    this.emit()
  }
}

function stripLocal(v: Record<string, any>): Record<string, any> {
  const { updated_at, ...rest } = v // updated_at lo imposta il server (trigger)
  return rest
}
