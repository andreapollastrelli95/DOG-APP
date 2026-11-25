import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { X } from 'lucide-react'

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')

export function Card({ children, className, ...p }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...p} className={cx('rounded-2xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(59,26,99,.08)]', className)}>
      {children}
    </div>
  )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'soft'; size?: 'md' | 'sm' }
export function Button({ variant = 'primary', size = 'md', className, ...p }: BtnProps) {
  const v = {
    primary: 'bg-primary text-primary-fg hover:opacity-90',
    soft: 'bg-surface2 text-ink hover:bg-line',
    ghost: 'text-ink hover:bg-surface2',
    danger: 'bg-danger text-white hover:opacity-90',
  }[variant]
  return <button type="button" {...p} className={cx('inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:opacity-50', size === 'md' ? 'min-h-11 px-4 text-sm' : 'min-h-9 px-3 text-sm', v, className)} />
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'danger' | 'gold' }) {
  const t = { neutral: 'bg-surface2 text-muted', good: 'bg-sage/25 text-primary', warn: 'bg-warn/15 text-warn', danger: 'bg-danger/15 text-danger', gold: 'bg-gold/20 text-gold' }[tone]
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', t)}>{children}</span>
}

export function Stat({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="rise">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-display text-2xl text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-sm text-muted">{sub}</div>}
    </Card>
  )
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={title}>
      <div className={cx('rise max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-xl sm:rounded-3xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl">{title}</h2>
          <button aria-label="Chiudi" onClick={onClose} className="grid size-9 place-items-center rounded-full hover:bg-surface2">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ---- Toast e conferma ----
interface Toast {
  id: number
  text: string
  tone: 'ok' | 'err'
}
const ToastCtx = createContext<{ toast: (t: string, tone?: 'ok' | 'err') => void; confirm: (msg: string, opts?: { action?: string }) => Promise<boolean> } | null>(null)
export const useUi = () => {
  const c = useContext(ToastCtx)
  if (!c) throw new Error('UiProvider mancante')
  return c
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [ask, setAsk] = useState<{ msg: string; action: string; resolve: (v: boolean) => void } | null>(null)
  const toast = useCallback((text: string, tone: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'err' ? 6000 : 3000)
  }, [])
  const confirm = useCallback((msg: string, opts?: { action?: string }) => new Promise<boolean>((resolve) => setAsk({ msg, action: opts?.action ?? 'Elimina', resolve })), [])
  return (
    <ToastCtx.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cx('rise pointer-events-auto rounded-xl px-4 py-2.5 text-sm shadow-lg', t.tone === 'ok' ? 'bg-primary text-primary-fg' : 'bg-danger text-white')}>
            {t.text}
          </div>
        ))}
      </div>
      {ask && (
        <Modal
          title="Conferma"
          onClose={() => {
            ask.resolve(false)
            setAsk(null)
          }}
        >
          <p className="mb-5 text-sm">{ask.msg}</p>
          <div className="flex justify-end gap-2">
            <Button
              variant="soft"
              onClick={() => {
                ask.resolve(false)
                setAsk(null)
              }}
            >
              Annulla
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                ask.resolve(true)
                setAsk(null)
              }}
            >
              {ask.action}
            </Button>
          </div>
        </Modal>
      )}
    </ToastCtx.Provider>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">{children}</div>
}

export const inputCls = 'min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink placeholder:text-muted focus:border-primary'
