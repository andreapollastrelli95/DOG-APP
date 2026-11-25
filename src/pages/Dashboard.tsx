import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Activity, AlertTriangle, Bot, Calendar, CheckCircle2, FileUp, HeartPulse, PawPrint, Plus, Scale, Syringe, Utensils, Wallet } from 'lucide-react'
import { useTables } from '../lib/app'
import { analyze, ageText, dayKey, runOutDate } from '../lib/analysis'
import { eur, fmtDate, fmtDateTime, num, relativeDay } from '../lib/format'
import { Badge, Button, Card, Stat } from '../components/ui'
import { ResourceDialog } from '../components/Resource'
import { useApp } from '../lib/app'
import { PhotoGallery } from '../components/Gallery'

const QUICK = [
  { label: 'Registra pasto', table: 'meals', icon: Utensils },
  { label: 'Registra passeggiata', table: 'activities', icon: Activity, defaults: { kind: 'passeggiata' } },
  { label: 'Registra peso', table: 'weights', icon: Scale },
  { label: 'Registra spesa', table: 'expenses', icon: Wallet },
  { label: 'Aggiungi evento', table: 'appointments', icon: Calendar },
]

export default function Dashboard() {
  const nav = useNavigate()
  const { store } = useApp()
  const { data, loading } = useTables(['dogs', 'weights', 'meals', 'activities', 'appointments', 'health_records', 'expenses', 'budgets', 'behavior_logs', 'food_products'])
  const [dialog, setDialog] = useState<{ table: string; defaults?: Record<string, any> } | null>(null)
  const now = new Date()

  const v = useMemo(() => {
    if (loading) return null
    const dog = data.dogs?.[0]
    const weights = [...(data.weights ?? [])].sort((a, b) => b.date.localeCompare(a.date))
    const meals = [...(data.meals ?? [])].sort((a, b) => b.at.localeCompare(a.at))
    const walks = [...(data.activities ?? [])].filter((a) => a.kind === 'passeggiata').sort((a, b) => b.at.localeCompare(a.at))
    const appts = [...(data.appointments ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    const upcoming = appts.filter((a) => !a.done && new Date(a.starts_at) >= new Date(now.getTime() - 3600_000))
    const nextVet = upcoming.find((a) => a.kind === 'visita')
    const nextMeal = upcoming.find((a) => a.kind === 'pasto')
    const todo = upcoming.filter((a) => new Date(a.starts_at).getTime() < now.getTime() + 7 * 86400000)
    const due = [
      ...(data.health_records ?? []).filter((h) => h.next_due_date && new Date(h.next_due_date + 'T23:59:59') >= now).map((h) => ({ title: h.title, date: h.next_due_date as string })),
      ...upcoming.filter((a) => a.kind === 'vaccinazione' || a.kind === 'trattamento').map((a) => ({ title: a.title, date: a.starts_at })),
    ].sort((a, b) => a.date.localeCompare(b.date))
    const ym = dayKey(now).slice(0, 7)
    const spent = (data.expenses ?? []).filter((e) => String(e.date).startsWith(ym)).reduce((s, e) => s + Number(e.amount_eur), 0)
    const budget = (data.budgets ?? []).find((b) => b.period === 'mensile' && !b.category)
    const since = dayKey(new Date(now.getTime() - 7 * 86400000))
    const recent = (data.behavior_logs ?? []).filter((b) => b.date >= since)
    const avg = (k: string) => {
      const xs = recent.map((r) => r[k]).filter((x) => x != null)
      return xs.length ? xs.reduce((s, x) => s + Number(x), 0) / xs.length : null
    }
    const findings = analyze(data, now).filter((f) => f.level === 'attenzione')
    const lowStock = (data.food_products ?? [])
      .map((f) => ({ f, out: runOutDate(f.stock_grams, f.daily_grams) }))
      .filter((x) => x.out && x.out.getTime() - now.getTime() < 7 * 86400000)
    return { dog, weights, meals, walks, nextVet, nextMeal, todo, due, spent, budget, avg, findings, lowStock }
  }, [data, loading])

  if (!v) return <p className="text-muted">Caricamento…</p>
  const { dog } = v

  return (
    <div className="space-y-5">
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-3xl bg-surface2 text-primary">{dog?.photo_data ? <img src={dog.photo_data} alt={dog.name} className="size-full object-cover" /> : <PawPrint size={40} />}</div>
        <div className="min-w-0 flex-1">
          {dog ? (
            <>
              <h1 className="font-display text-3xl">{dog.name}</h1>
              <p className="text-sm text-muted">{[dog.breed, ageText(dog.birth_date)].filter(Boolean).join(' · ') || 'Completa il profilo per vedere razza ed età'}</p>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl">Benvenuti in LILLA APP</h1>
              <p className="text-sm text-muted">Iniziate creando il profilo della cagnolina.</p>
            </>
          )}
        </div>
        <Button variant={dog ? 'soft' : 'primary'} onClick={() => nav('/profilo')}>
          {dog ? 'Apri profilo' : 'Crea profilo'}
        </Button>
      </Card>

      <PhotoGallery />


      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {QUICK.map((q) => (
          <button key={q.label} onClick={() => setDialog({ table: q.table, defaults: q.defaults })} className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface p-2 text-center text-xs font-semibold uppercase tracking-wide text-primary transition hover:bg-surface2">
            <q.icon size={22} />
            {q.label}
          </button>
        ))}
        <button onClick={() => nav('/archivio?nuovo=1')} className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface p-2 text-center text-xs font-semibold uppercase tracking-wide text-primary hover:bg-surface2">
          <FileUp size={22} />
          Carica documento
        </button>
        <button onClick={() => nav('/ai')} className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl bg-primary p-2 text-center text-xs font-semibold uppercase tracking-wide text-primary-fg hover:opacity-90">
          <Bot size={22} />
          Chiedi all'AI
        </button>
      </div>

      {(v.findings.length > 0 || v.lowStock.length > 0) && (
        <Card className="border-warn/40 bg-warn/5">
          <h2 className="mb-2 flex items-center gap-2 font-medium text-warn">
            <AlertTriangle size={18} /> Avvisi
          </h2>
          <ul className="space-y-1.5 text-sm">
            {v.findings.slice(0, 3).map((f) => (
              <li key={f.id}>
                <Link to="/analisi" className="underline-offset-2 hover:underline">
                  {f.title}
                </Link>
                <span className="text-muted"> — {f.changed}</span>
              </li>
            ))}
            {v.lowStock.map(({ f, out }) => (
              <li key={f.id}>
                Scorta di <strong>{f.name}</strong> stimata in esaurimento il {fmtDate(out!.toISOString())}.
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Ultimo peso" icon={<Scale size={14} />} value={v.weights[0] ? `${num(v.weights[0].weight_kg)} kg` : '—'} sub={v.weights[0] ? fmtDate(v.weights[0].date) : 'Nessuna pesata'} />
        <Stat label="Ultima passeggiata" icon={<Activity size={14} />} value={v.walks[0] ? relativeDay(v.walks[0].at) : '—'} sub={v.walks[0] ? `${v.walks[0].duration_min} min${v.walks[0].distance_km ? ` · ${num(v.walks[0].distance_km)} km` : ''}` : 'Nessuna registrata'} />
        <Stat label="Prossimo pasto" icon={<Utensils size={14} />} value={v.nextMeal ? relativeDay(v.nextMeal.starts_at) : '—'} sub={v.nextMeal ? fmtDateTime(v.nextMeal.starts_at) : v.meals[0] ? `Ultimo: ${fmtDateTime(v.meals[0].at)}` : 'Nessun pasto programmato'} />
        <Stat label="Prossima visita" icon={<HeartPulse size={14} />} value={v.nextVet ? relativeDay(v.nextVet.starts_at) : '—'} sub={v.nextVet ? `${v.nextVet.title} · ${fmtDateTime(v.nextVet.starts_at)}` : 'Nessuna in agenda'} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <h2 className="mb-2 flex items-center gap-2 font-medium">
            <Syringe size={18} className="text-primary" /> Vaccinazioni e trattamenti
          </h2>
          {v.due.length ? (
            <ul className="space-y-1.5 text-sm">
              {v.due.slice(0, 5).map((d, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span>{d.title}</span>
                  <span className="text-muted">{fmtDate(d.date)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nessuna scadenza registrata. Indica le scadenze nella cartella clinica.</p>
          )}
        </Card>
        <Card>
          <h2 className="mb-2 flex items-center gap-2 font-medium">
            <Calendar size={18} className="text-primary" /> Da fare (7 giorni)
          </h2>
          {v.todo.length ? (
            <ul className="space-y-2 text-sm">
              {v.todo.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <label className="flex min-h-9 items-center gap-2">
                    <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={!!a.done} onChange={(e) => void store.update('appointments', a.id, { done: e.target.checked })} />
                    {a.title}
                  </label>
                  <span className="flex items-center gap-1 text-muted">
                    {a.priority === 'alta' && <Badge tone="danger">alta</Badge>}
                    {relativeDay(a.starts_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted">
              <CheckCircle2 size={16} /> Niente in programma.
            </p>
          )}
        </Card>
        <Card>
          <h2 className="mb-2 flex items-center gap-2 font-medium">
            <Wallet size={18} className="text-primary" /> Spese del mese
          </h2>
          <div className="font-display text-2xl">{eur(v.spent)}</div>
          {v.budget ? (
            <>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface2">
                <div className={'h-full ' + (v.spent > v.budget.amount_eur ? 'bg-danger' : 'bg-primary')} style={{ width: `${Math.min(100, (v.spent / v.budget.amount_eur) * 100)}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted">su un budget di {eur(v.budget.amount_eur)}</p>
            </>
          ) : (
            <p className="mt-1 text-xs text-muted">Nessun budget mensile impostato.</p>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-medium">
          <HeartPulse size={18} className="text-primary" /> Benessere — media ultimi 7 giorni
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ['mood', 'Umore'],
              ['appetite', 'Appetito'],
              ['energy', 'Energia'],
              ['sleep', 'Sonno'],
            ] as const
          ).map(([k, l]) => {
            const a = v.avg(k)
            return (
              <div key={k}>
                <div className="text-xs text-muted">{l}</div>
                <div className="font-display text-xl">{a === null ? '—' : `${num(a)}/5`}</div>
              </div>
            )
          })}
        </div>
        {v.avg('mood') === null && v.avg('energy') === null && (
          <p className="mt-2 text-xs text-muted">
            Nessuna osservazione negli ultimi 7 giorni.{' '}
            <Link to="/benessere" className="underline">
              Registra com'è oggi
            </Link>
          </p>
        )}
      </Card>

      <p className="flex items-center gap-1 text-xs text-muted">
        <Plus size={12} /> La dashboard si aggiorna da sola quando un familiare registra qualcosa.
      </p>

      {dialog && <ResourceDialog table={dialog.table} defaults={dialog.defaults} onClose={() => setDialog(null)} />}
    </div>
  )
}
