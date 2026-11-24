import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Store, type Mode } from './store'
import { supabase } from './supabase'
import { CLOUD_CONFIGURED } from './config'
import { seedDemo } from './demo'
import type { Row } from './schema'
import { idbDestroy } from './idb'
import { AuthScreen, HouseholdSetup } from '../pages/Auth'

interface Ctx {
  store: Store
  mode: Mode
  isAdmin: boolean
  householdName: string
  signOut: () => Promise<void>
  setDemo: (on: boolean) => Promise<void>
  resetDemo: () => Promise<void>
  theme: 'light' | 'dark'
  toggleTheme: () => void
}

const AppCtx = createContext<Ctx | null>(null)
export const useApp = () => {
  const c = useContext(AppCtx)
  if (!c) throw new Error('AppProvider mancante')
  return c
}

const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* storage non disponibile */
    }
  },
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [demo, setDemoState] = useState(ls.get('dm.demo') === '1')
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!CLOUD_CONFIGURED)
  const [membership, setMembership] = useState<{ household_id: string; role: string; name: string } | null | 'none'>(null)
  const [store, setStore] = useState<Store | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (ls.get('dm.theme') as 'light' | 'dark') ?? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))
  const [fatal, setFatal] = useState<string | null>(null)
  const storeRef = useRef<Store | null>(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    ls.set('dm.theme', theme)
  }, [theme])

  // sessione Supabase
  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const loadMembership = useCallback(async () => {
    if (!supabase || !session) return
    await supabase.rpc('claim_invites') // collega eventuali inviti arrivati via email
    const { data, error } = await supabase.from('household_members').select('household_id, role, households(name)').eq('user_id', session.user.id).limit(1)
    if (error) {
      // Offline: usa l'ultima appartenenza nota
      const cached = ls.get('dm.membership.' + session.user.id)
      if (cached) setMembership(JSON.parse(cached))
      else setFatal(error.message)
      return
    }
    if (!data?.length) setMembership('none')
    else {
      const m = { household_id: data[0].household_id, role: data[0].role, name: (data[0] as any).households?.name ?? 'Famiglia' }
      ls.set('dm.membership.' + session.user.id, JSON.stringify(m))
      setMembership(m)
    }
  }, [session])

  useEffect(() => {
    if (!demo && supabase && session) void loadMembership()
    else setMembership(null)
  }, [demo, session, loadMembership])

  // costruzione dello store
  useEffect(() => {
    let cancelled = false
    async function build() {
      storeRef.current?.stop()
      let s: Store | null = null
      if (demo) {
        s = new Store({ mode: 'demo', dbName: 'dm-demo', userId: 'demo', userName: 'Utente demo', householdId: 'demo' })
        await seedDemo(s)
      } else if (CLOUD_CONFIGURED) {
        if (session && membership && membership !== 'none') {
          s = new Store({ mode: 'cloud', dbName: 'dm-cloud-' + session.user.id, userId: session.user.id, userName: session.user.email ?? 'Utente', householdId: membership.household_id, supabase })
          void s.startCloud()
        }
      } else {
        s = new Store({ mode: 'local', dbName: 'dm-local', userId: 'local', userName: ls.get('dm.name') ?? 'Io', householdId: 'local' })
      }
      if (!cancelled) {
        storeRef.current = s
        setStore(s)
      }
    }
    if (CLOUD_CONFIGURED && !demo && (!authReady || (session && membership === null))) return
    void build().catch((e) => setFatal(String(e?.message ?? e)))
    return () => {
      cancelled = true
    }
  }, [demo, session, membership, authReady])

  const setDemo = useCallback(async (on: boolean) => {
    ls.set('dm.demo', on ? '1' : '0')
    setStore(null)
    setDemoState(on)
  }, [])

  const resetDemo = useCallback(async () => {
    storeRef.current?.stop()
    await idbDestroy('dm-demo')
    setStore(null)
    setDemoState(false)
    setTimeout(() => setDemoState(true), 0)
  }, [])

  const value = useMemo<Ctx | null>(
    () =>
      store
        ? {
            store,
            mode: store.mode,
            isAdmin: store.mode !== 'cloud' || (membership !== null && membership !== 'none' && membership.role === 'admin'),
            householdName: membership && membership !== 'none' ? membership.name : 'Famiglia',
            signOut: async () => {
              await supabase?.auth.signOut()
              setMembership(null)
              setStore(null)
            },
            setDemo,
            resetDemo,
            theme,
            toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
          }
        : null,
    [store, membership, theme, setDemo, resetDemo],
  )

  if (fatal) return <div className="p-8 text-danger">Errore: {fatal}</div>
  if (CLOUD_CONFIGURED && !demo) {
    if (!authReady) return <Splash />
    if (!session) return <AuthScreen onDemo={() => setDemo(true)} />
    if (membership === 'none') return <HouseholdSetup onDone={loadMembership} />
  }
  if (!value) return <Splash />
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

function Splash() {
  return <div className="grid h-full place-items-center text-muted">Caricamento…</div>
}

/** Legge una tabella e si aggiorna a ogni modifica (anche di altri familiari o altre schede). */
export function useTable(table: string): { rows: Row[]; loading: boolean } {
  const { store } = useApp()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    const load = () =>
      store.list(table).then((r) => {
        if (alive) {
          setRows(r)
          setLoading(false)
        }
      })
    void load()
    const off = store.subscribe(() => void load())
    return () => {
      alive = false
      off()
    }
  }, [store, table])
  return { rows, loading }
}

export function useTables(tables: string[]): { data: Record<string, Row[]>; loading: boolean } {
  const { store } = useApp()
  const [data, setData] = useState<Record<string, Row[]>>({})
  const [loading, setLoading] = useState(true)
  const key = tables.join(',')
  useEffect(() => {
    let alive = true
    const load = async () => {
      const entries = await Promise.all(tables.map(async (t) => [t, await store.list(t)] as const))
      if (alive) {
        setData(Object.fromEntries(entries))
        setLoading(false)
      }
    }
    void load()
    const off = store.subscribe(() => void load())
    return () => {
      alive = false
      off()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, key])
  return { data, loading }
}
