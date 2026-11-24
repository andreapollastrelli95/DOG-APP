import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Activity, BookOpen, Bot, Calendar, CloudOff, FileText, Folder, HeartPulse, Home, LineChart, MapPin, Menu, Moon, PawPrint, RefreshCw, Settings, Smile, Sun, Utensils, Wallet, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useApp } from '../lib/app'
import { Modal, cx } from './ui'
import type { SyncStatus } from '../lib/store'

export const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/salute', label: 'Salute', icon: HeartPulse },
  { to: '/alimentazione', label: 'Alimentazione', icon: Utensils },
  { to: '/attivita', label: 'Attività', icon: Activity },
  { to: '/benessere', label: 'Benessere', icon: Smile },
  { to: '/spese', label: 'Spese', icon: Wallet },
  { to: '/agenda', label: 'Agenda', icon: Calendar },
  { to: '/archivio', label: 'Archivio', icon: Folder },
  { to: '/luoghi', label: 'Luoghi', icon: MapPin },
  { to: '/analisi', label: 'Analisi e report', icon: LineChart },
  { to: '/ai', label: 'DOG MANAGER AI', icon: Bot },
  { to: '/profilo', label: 'Profilo cagnolina', icon: PawPrint },
  { to: '/impostazioni', label: 'Impostazioni', icon: Settings },
]
const BOTTOM = ['/', '/salute', '/agenda', '/ai']

function useStatus(): SyncStatus {
  const { store } = useApp()
  const [s, setS] = useState<SyncStatus>({ ...store.status })
  useEffect(() => {
    const sync = () => setS({ ...store.status })
    sync()
    const off = store.subscribe(sync)
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      off()
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [store])
  return s
}

export function SyncBadge() {
  const { mode, store } = useApp()
  const s = useStatus()
  if (mode === 'demo') return <span className="rounded-full bg-gold/20 px-3 py-1 text-xs font-medium text-gold">Modalità DEMO</span>
  if (mode === 'local') return <span className="rounded-full bg-surface2 px-3 py-1 text-xs text-muted" title="I dati restano solo su questo dispositivo">Solo su questo dispositivo</span>
  const offline = !s.online
  return (
    <button onClick={() => void store.sync()} className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium', offline ? 'bg-warn/15 text-warn' : s.error || s.conflicts ? 'bg-danger/15 text-danger' : 'bg-sage/25 text-primary')} title={s.lastSync ? 'Ultima sincronizzazione: ' + new Date(s.lastSync).toLocaleTimeString('it-IT') : 'Sincronizza ora'}>
      {offline ? <CloudOff size={14} /> : s.syncing ? <RefreshCw size={14} className="animate-spin" /> : s.error || s.conflicts ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
      {offline ? `Offline${s.pending ? ` · ${s.pending} da inviare` : ''}` : s.syncing ? 'Sincronizzo…' : s.pending ? `${s.pending} da inviare` : s.conflicts ? `${s.conflicts} conflitti` : s.error ? 'Errore di sync' : 'Sincronizzato'}
    </button>
  )
}

export function Layout() {
  const { mode, theme, toggleTheme, setDemo } = useApp()
  const [more, setMore] = useState(false)
  const loc = useLocation()
  useEffect(() => {
    setMore(false)
  }, [loc.pathname])
  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface p-4 md:flex">
        <div className="mb-6 flex items-center gap-3 px-2">
          <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-fg">
            <PawPrint size={22} />
          </div>
          <span className="font-display text-lg tracking-wide">DOG MANAGER</span>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm', isActive ? 'bg-primary text-primary-fg' : 'text-ink hover:bg-surface2')}>
              <n.icon size={18} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <button onClick={toggleTheme} className="mt-3 flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm text-muted hover:bg-surface2">
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />} Tema {theme === 'dark' ? 'chiaro' : 'scuro'}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {mode === 'demo' && (
          <div className="flex flex-wrap items-center justify-center gap-3 bg-gold/20 px-3 py-1.5 text-center text-xs text-ink safe-top">
            <span>Stai vedendo dati di ESEMPIO, non reali.</span>
            <button className="font-semibold underline" onClick={() => void setDemo(false)}>
              Esci dalla demo
            </button>
          </div>
        )}
        <header className="flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-2 safe-top md:justify-end">
          <span className="flex items-center gap-2 font-display text-lg md:hidden">
            <PawPrint size={20} className="text-primary" /> DOG MANAGER
          </span>
          <div className="flex items-center gap-2">
            <SyncBadge />
            <button onClick={toggleTheme} aria-label="Cambia tema" className="grid size-9 place-items-center rounded-full hover:bg-surface2 md:hidden">
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-5 pb-28 md:px-8 md:pb-10">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface safe-bottom md:hidden" aria-label="Navigazione principale">
        {NAV.filter((n) => BOTTOM.includes(n.to)).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]', isActive ? 'text-primary' : 'text-muted')}>
            <n.icon size={21} />
            {n.label === 'DOG MANAGER AI' ? 'AI' : n.label}
          </NavLink>
        ))}
        <button onClick={() => setMore(true)} className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-muted">
          <Menu size={21} />
          Altro
        </button>
      </nav>
      {more && (
        <Modal title="Menu" onClose={() => setMore(false)}>
          <div className="grid grid-cols-3 gap-2">
            {NAV.filter((n) => !BOTTOM.includes(n.to)).map((n) => (
              <NavLink key={n.to} to={n.to} className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-surface2 p-2 text-center text-xs">
                <n.icon size={22} className="text-primary" />
                {n.label}
              </NavLink>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

export { BookOpen, FileText }
