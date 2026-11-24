import { useState } from 'react'
import { PawPrint } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Button, Card, inputCls } from '../components/ui'

export function AuthScreen({ onDemo }: { onDemo: () => void }) {
  const [tab, setTab] = useState<'login' | 'register' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setMsg(null)
    if (!/^\S+@\S+\.\S+$/.test(email)) return setMsg({ text: 'Inserisci un indirizzo email valido.', err: true })
    if (tab !== 'reset' && password.length < 8) return setMsg({ text: 'La password deve avere almeno 8 caratteri.', err: true })
    setBusy(true)
    try {
      if (tab === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (tab === 'register') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: name || email.split('@')[0] } } })
        if (error) throw error
        if (!data.session) setMsg({ text: 'Registrazione eseguita. Controlla la tua email e conferma l’indirizzo, poi accedi.' })
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
        if (error) throw error
        setMsg({ text: 'Se l’indirizzo è registrato, riceverai una email con il link per scegliere una nuova password.' })
      }
    } catch (err: any) {
      setMsg({ text: translate(err?.message ?? 'Errore'), err: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-full place-items-center bg-bg p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-fg">
            <PawPrint />
          </div>
          <div>
            <h1 className="font-display text-2xl leading-none">DOG MANAGER</h1>
            <p className="text-xs text-muted">Il fascicolo digitale della nostra cagnolina</p>
          </div>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-surface2 p-1 text-sm">
          {(['login', 'register'] as const).map((t) => (
            <button key={t} onClick={() => (setTab(t), setMsg(null))} className={'min-h-10 rounded-lg ' + (tab === t || (tab === 'reset' && t === 'login') ? 'bg-surface font-medium shadow-sm' : 'text-muted')}>
              {t === 'login' ? 'Accedi' : 'Registrati'}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-3" noValidate>
          {tab === 'register' && <input className={inputCls} placeholder="Il tuo nome" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
          <input className={inputCls} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          {tab !== 'reset' && <input className={inputCls} type="password" placeholder="Password (min. 8 caratteri)" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} />}
          {msg && (
            <p role="alert" className={'text-sm ' + (msg.err ? 'text-danger' : 'text-primary')}>
              {msg.text}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {tab === 'login' ? 'Accedi' : tab === 'register' ? 'Crea account' : 'Invia link di recupero'}
          </Button>
        </form>
        <div className="mt-4 flex items-center justify-between text-sm">
          <button className="text-muted underline" onClick={() => (setTab(tab === 'reset' ? 'login' : 'reset'), setMsg(null))}>
            {tab === 'reset' ? 'Torna al login' : 'Password dimenticata?'}
          </button>
          <button className="text-muted underline" onClick={onDemo}>
            Prova con dati di esempio
          </button>
        </div>
      </Card>
    </div>
  )
}

function translate(m: string): string {
  if (/invalid login/i.test(m)) return 'Email o password non corrette.'
  if (/already registered/i.test(m)) return 'Questo indirizzo è già registrato: prova ad accedere.'
  if (/email not confirmed/i.test(m)) return 'Devi prima confermare l’indirizzo email (controlla la posta).'
  if (/rate limit/i.test(m)) return 'Troppi tentativi. Riprova tra qualche minuto.'
  return m
}

export function HouseholdSetup({ onDone }: { onDone: () => Promise<void> }) {
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    if (name.trim().length < 2) return setErr('Scegli un nome per la famiglia (es. “Famiglia Rossi”).')
    setBusy(true)
    const { error } = await supabase.rpc('create_household', { p_name: name.trim() })
    setBusy(false)
    if (error) return setErr(error.message)
    await onDone()
  }
  return (
    <div className="grid min-h-full place-items-center bg-bg p-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="mb-1 font-display text-2xl">Crea il nucleo familiare</h1>
        <p className="mb-4 text-sm text-muted">Se un familiare ti ha già invitato, esci e rientra con la stessa email dell’invito: troverai già la famiglia. Altrimenti crea qui la tua.</p>
        <form onSubmit={create} className="space-y-3">
          <input className={inputCls} placeholder="Nome della famiglia" value={name} onChange={(e) => setName(e.target.value)} />
          {err && <p className="text-sm text-danger">{err}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            Crea famiglia
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => void supabase?.auth.signOut()}>
            Esci
          </Button>
        </form>
      </Card>
    </div>
  )
}
