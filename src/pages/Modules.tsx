import { useMemo, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, FileText, Phone, Siren } from 'lucide-react'
import { useApp, useTable, useTables } from '../lib/app'
import { TABLES, EXPENSE_CATEGORIES, type Row } from '../lib/schema'
import { ResourcePage, ResourceDialog } from '../components/Resource'
import { ExtractButton } from '../components/Extract'
import { Bars, ChartCard, Donut, Lines } from '../components/charts'
import { Badge, Button, Card, cx, inputCls, useUi } from '../components/ui'
import { dailySeries, dayKey, detectRecurring, runOutDate } from '../lib/analysis'
import { buildPdf } from '../lib/pdf'
import { download, eur, fmtDate, fmtDateTime, num, toCsv } from '../lib/format'

const DAY = 86400000
const labelDM = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

function lastDays(n: number): Date[] {
  const out: Date[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) out.push(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 12))
  return out
}

function Tabs({ tabs, value, onChange }: { tabs: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-4 inline-flex gap-1 rounded-xl bg-surface2 p-1 text-sm" role="tablist">
      {tabs.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)} className={cx('min-h-10 rounded-lg px-4', value === k ? 'bg-surface font-medium shadow-sm' : 'text-muted')}>
          {l}
        </button>
      ))}
    </div>
  )
}

// ---------------- SALUTE ----------------
export function Health() {
  const [tab, setTab] = useState('clinica')
  const { store } = useApp()
  const { toast } = useUi()

  async function exportPdf() {
    const [dog, recs, weights] = [await store.dog(), await store.list('health_records'), await store.list('weights')]
    const kinds = Object.fromEntries(TABLES.health_records.fields.find((f) => f.key === 'kind')!.options!.map((o) => [o.value, o.label]))
    const sorted = [...recs].sort((a, b) => b.date.localeCompare(a.date))
    const doc = buildPdf('Cartella clinica', `${dog?.name ?? 'Cagnolina'} · ${[dog?.breed, dog?.birth_date ? 'nata il ' + fmtDate(dog.birth_date) : '', dog?.microchip ? 'microchip ' + dog.microchip : ''].filter(Boolean).join(' · ')}`, [
      { heading: 'Anagrafica', lines: [`Veterinario di riferimento: ${dog?.vet_name || 'non indicato'} ${dog?.vet_phone ?? ''}`, `Allergie e intolleranze: ${dog?.allergies || 'non indicate'}`, `Patologie note (indicate dalla famiglia): ${dog?.conditions || 'non indicate'}`] },
      { heading: 'Storico sanitario', table: { head: ['Data', 'Tipo', 'Descrizione', 'Veterinario', 'Costo'], rows: sorted.map((r) => [fmtDate(r.date), kinds[r.kind] ?? r.kind, [r.title, r.description, r.dosage && 'Posologia: ' + r.dosage, r.next_due_date && 'Scadenza: ' + fmtDate(r.next_due_date)].filter(Boolean).join(' — '), r.vet_name ?? '', r.cost_eur ? eur(r.cost_eur) : '']) } },
      { heading: 'Peso', table: { head: ['Data', 'Peso'], rows: [...weights].sort((a, b) => b.date.localeCompare(a.date)).map((w) => [fmtDate(w.date), `${num(w.weight_kg)} kg`]) } },
    ])
    doc.save('cartella-clinica.pdf')
    toast('PDF generato')
  }

  return (
    <div>
      <Tabs
        tabs={[
          ['clinica', 'Cartella clinica'],
          ['peso', 'Peso'],
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'clinica' ? (
        <ResourcePage
          table="health_records"
          title="Cartella clinica"
          intro="Visite, vaccinazioni, farmaci, esami e interventi. Farmaci e dosi vanno inseriti solo come indicati dal veterinario."
          header={() => (
            <div>
              <Button variant="soft" onClick={() => void exportPdf()}>
                <FileText size={16} /> Esporta cartella clinica (PDF)
              </Button>
            </div>
          )}
        />
      ) : (
        <ResourcePage
          table="weights"
          title="Peso"
          header={(rows) => {
            const d = [...rows].sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({ d: fmtDate(r.date).slice(0, 5), kg: Number(r.weight_kg) }))
            return d.length >= 2 ? (
              <ChartCard title="Andamento del peso (kg)">
                <Lines data={d} x="d" keys={[{ key: 'kg', label: 'Peso (kg)' }]} unit="kg" />
              </ChartCard>
            ) : null
          }}
        />
      )}
    </div>
  )
}

// ---------------- ALIMENTAZIONE ----------------
export function Food() {
  const [tab, setTab] = useState('pasti')
  return (
    <div>
      <Tabs
        tabs={[
          ['pasti', 'Pasti'],
          ['prodotti', 'Prodotti e scorte'],
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'pasti' ? (
        <ResourcePage
          table="meals"
          title="Pasti"
          header={(rows) => {
            const s = dailySeries(rows.filter((r) => r.kind === 'pasto'), 'at', 'grams', 'sum')
            const data = lastDays(30).map((d) => ({ d: labelDM(d), g: Math.round(s.get(dayKey(d)) ?? 0) }))
            return rows.length ? (
              <ChartCard title="Cibo al giorno (grammi, ultimi 30 giorni)" note="I giorni senza pasti registrati appaiono a 0.">
                <Bars data={data} x="d" keys={[{ key: 'g', label: 'Grammi' }]} unit="g" />
              </ChartCard>
            ) : null
          }}
        />
      ) : (
        <ResourcePage
          table="food_products"
          title="Prodotti e scorte"
          intro="Registra gli alimenti, le scorte e la quantità giornaliera: stimeremo la data di esaurimento. Segna con “Sconsigliato” ciò che va evitato."
          header={() => (
            <div className="flex flex-wrap items-center gap-2">
              <ExtractButton kind="food_label" table="food_products" label="Leggi etichetta da foto" accept="image/*" />
            </div>
          )}
          extraCell={(r) => {
            const out = runOutDate(r.stock_grams, r.daily_grams)
            if (r.avoid) return <Badge tone="danger">Da evitare</Badge>
            if (!out) return null
            const days = Math.round((out.getTime() - Date.now()) / DAY)
            return <Badge tone={days <= 7 ? 'warn' : 'good'}>Finisce il {fmtDate(out.toISOString())}</Badge>
          }}
        />
      )}
    </div>
  )
}

// ---------------- ATTIVITA ----------------
export function Activities() {
  const { store } = useApp()
  const { toast } = useUi()
  const { rows: dogs } = useTable('dogs')
  const dog = dogs[0]
  const [goal, setGoal] = useState<string | null>(null)
  const goalVal = goal ?? (dog?.activity_goal_min != null ? String(dog.activity_goal_min) : '')

  return (
    <ResourcePage
      table="activities"
      title="Attività fisica"
      intro="Passeggiate, giochi ed esercizio. L'obiettivo giornaliero lo decidete voi (e il veterinario): non usiamo valori universali."
      header={(rows) => {
        const act = rows.filter((r) => r.kind !== 'riposo')
        const s = dailySeries(act, 'at', 'duration_min', 'sum')
        const days = lastDays(14).map((d) => ({ d: labelDM(d), min: Math.round(s.get(dayKey(d)) ?? 0) }))
        const sum = (from: number, to: number) => [...Array(to - from)].reduce((t, _, i) => t + (s.get(dayKey(new Date(Date.now() - (from + i) * DAY))) ?? 0), 0)
        const w1 = sum(0, 7)
        const w0 = sum(7, 14)
        const month = (m: number) => {
          const d = new Date()
          const key = dayKey(new Date(d.getFullYear(), d.getMonth() - m, 1)).slice(0, 7)
          return act.filter((r) => dayKey(r.at).startsWith(key)).reduce((t, r) => t + Number(r.duration_min), 0)
        }
        const weeks = [...Array(8)].map((_, i) => ({ w: i === 7 ? 'questa' : `-${7 - i}`, min: Math.round(sum(7 * (7 - i), 7 * (7 - i) + 7)) }))
        const g = Number(dog?.activity_goal_min)
        const goalDays = g ? lastDays(7).filter((d) => (s.get(dayKey(d)) ?? 0) >= g).length : null
        return (
          <div className="grid gap-3 lg:grid-cols-2">
            <ChartCard title="Minuti di attività al giorno (14 giorni)" note={g ? `Obiettivo personale: ${g} min/giorno — raggiunto in ${goalDays} degli ultimi 7 giorni.` : undefined}>
              <Bars data={days} x="d" keys={[{ key: 'min', label: 'Minuti' }]} unit="min" />
            </ChartCard>
            <ChartCard title="Minuti per settimana (ultime 8)" note={`Ultimi 7 giorni: ${Math.round(w1)} min · 7 giorni precedenti: ${Math.round(w0)} min · mese corrente: ${month(0)} min · mese scorso: ${month(1)} min`}>
              <Bars data={weeks} x="w" keys={[{ key: 'min', label: 'Minuti' }]} unit="min" />
            </ChartCard>
            <Card className="lg:col-span-2">
              <h3 className="mb-2 text-sm font-medium">Obiettivo giornaliero personalizzato</h3>
              {dog ? (
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    const n = goalVal === '' ? null : Number(goalVal)
                    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 600)) return toast('Inserisci minuti tra 0 e 600', 'err')
                    await store.update('dogs', dog.id, { activity_goal_min: n })
                    setGoal(null)
                    toast('Obiettivo salvato')
                  }}
                >
                  <input aria-label="Minuti al giorno" inputMode="numeric" className={cx(inputCls, 'w-28')} value={goalVal} onChange={(e) => setGoal(e.target.value)} placeholder="min" />
                  <span className="text-sm text-muted">minuti al giorno (stabilito con il veterinario)</span>
                  <Button type="submit" size="sm">
                    Salva
                  </Button>
                </form>
              ) : (
                <p className="text-sm text-muted">Crea prima il profilo della cagnolina.</p>
              )}
            </Card>
          </div>
        )
      }}
    />
  )
}

// ---------------- BENESSERE ----------------
export function Wellbeing() {
  return (
    <ResourcePage
      table="behavior_logs"
      title="Comportamento e benessere"
      intro="Una registrazione al giorno, con scale da 1 a 5, basta per costruire la baseline personale. Scrivi nelle note anche gli episodi insoliti."
      header={(rows) => {
        const byDay = [...rows].sort((a, b) => a.date.localeCompare(b.date)).slice(-30)
        const data = byDay.map((r) => ({ d: fmtDate(r.date).slice(0, 5), mood: r.mood, appetite: r.appetite, energy: r.energy, sleep: r.sleep }))
        return data.length >= 2 ? (
          <ChartCard title="Andamento (ultime 30 registrazioni, scala 1-5)" height={260}>
            <Lines
              data={data}
              x="d"
              domain={[1, 5]}
              keys={[
                { key: 'mood', label: 'Umore' },
                { key: 'appetite', label: 'Appetito' },
                { key: 'energy', label: 'Energia' },
                { key: 'sleep', label: 'Sonno' },
              ]}
            />
          </ChartCard>
        ) : null
      }}
    />
  )
}

// ---------------- SPESE ----------------
export function Expenses() {
  const [tab, setTab] = useState('spese')
  const { data } = useTables(['expenses', 'budgets'])
  const { toast } = useUi()
  const { store } = useApp()
  const ex = data.expenses ?? []
  const catLabel = (v: string) => EXPENSE_CATEGORIES.find((c) => c.value === v)?.label ?? v

  const stats = useMemo(() => {
    const now = new Date()
    const y = now.getFullYear()
    const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const months = [...Array(12)].map((_, i) => {
      const d = new Date(y, now.getMonth() - (11 - i), 1)
      const key = ym(d)
      return { key, m: d.toLocaleDateString('it-IT', { month: 'short' }), tot: ex.filter((e) => String(e.date).startsWith(key)).reduce((s, e) => s + Number(e.amount_eur), 0) }
    })
    const yearRows = ex.filter((e) => String(e.date).startsWith(String(y)))
    const byCat = Object.entries(yearRows.reduce<Record<string, number>>((a, e) => ((a[e.category] = (a[e.category] ?? 0) + Number(e.amount_eur)), a), {})).map(([k, v]) => ({ name: catLabel(k), value: Math.round(v * 100) / 100 }))
    const ytd = yearRows.reduce((s, e) => s + Number(e.amount_eur), 0)
    const prev = months.slice(-4, -1).filter((m) => m.tot > 0)
    const avg = prev.length ? prev.reduce((s, m) => s + m.tot, 0) / prev.length : 0
    const remaining = 11 - now.getMonth()
    return { months, byCat, ytd, avg, forecast: ytd + avg * remaining, prevN: prev.length, curMonth: months[11].tot, prevMonth: months[10].tot, year: y }
  }, [ex])

  const recurring = useMemo(() => detectRecurring(ex), [ex])
  const monthBudget = (data.budgets ?? []).find((b) => b.period === 'mensile' && !b.category)
  const yearBudget = (data.budgets ?? []).find((b) => b.period === 'annuale' && !b.category)

  async function exportPdf() {
    const dog = await store.dog()
    const rows = [...ex].filter((e) => String(e.date).startsWith(String(stats.year))).sort((a, b) => a.date.localeCompare(b.date))
    buildPdf(`Spese ${stats.year}`, dog?.name ?? 'Cagnolina', [
      { heading: 'Riepilogo', lines: [`Totale ${stats.year}: ${eur(stats.ytd)}`, ...stats.byCat.map((c) => `${c.name}: ${eur(c.value)}`)] },
      { heading: 'Elenco spese', table: { head: ['Data', 'Categoria', 'Descrizione', 'Importo'], rows: rows.map((e) => [fmtDate(e.date), catLabel(e.category), e.description, eur(e.amount_eur)]) } },
    ]).save(`spese-${stats.year}.pdf`)
    toast('PDF generato')
  }

  return (
    <div>
      <Tabs
        tabs={[
          ['spese', 'Spese'],
          ['budget', 'Budget'],
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'budget' ? (
        <ResourcePage table="budgets" title="Budget" intro="Imposta un budget mensile o annuale (totale o per categoria)." />
      ) : (
        <ResourcePage
          table="expenses"
          title="Spese"
          header={() => (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <ExtractButton kind="receipt" table="expenses" label="Leggi scontrino da foto" />
                <Button variant="soft" onClick={() => void exportPdf()}>
                  <FileText size={16} /> PDF {stats.year}
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Card>
                  <div className="text-xs uppercase text-muted">Questo mese</div>
                  <div className="font-display text-2xl">{eur(stats.curMonth)}</div>
                  <div className="text-xs text-muted">
                    mese scorso {eur(stats.prevMonth)}
                    {monthBudget && ` · budget ${eur(monthBudget.amount_eur)}`}
                  </div>
                  {monthBudget && <Progress value={stats.curMonth} max={monthBudget.amount_eur} />}
                </Card>
                <Card>
                  <div className="text-xs uppercase text-muted">Da inizio {stats.year}</div>
                  <div className="font-display text-2xl">{eur(stats.ytd)}</div>
                  {yearBudget && (
                    <>
                      <div className="text-xs text-muted">budget annuale {eur(yearBudget.amount_eur)}</div>
                      <Progress value={stats.ytd} max={yearBudget.amount_eur} />
                    </>
                  )}
                </Card>
                <Card>
                  <div className="text-xs uppercase text-muted">Previsione {stats.year}</div>
                  <div className="font-display text-2xl">{stats.prevN >= 2 ? eur(stats.forecast) : '—'}</div>
                  <div className="text-xs text-muted">{stats.prevN >= 2 ? `Spese finora + media degli ultimi ${stats.prevN} mesi per i mesi rimanenti. È una stima, non un impegno.` : 'Servono almeno 2 mesi di spese per una stima.'}</div>
                </Card>
              </div>
              {ex.length > 0 && (
                <div className="grid gap-3 lg:grid-cols-2">
                  <ChartCard title="Spese per mese (ultimi 12)">
                    <Bars data={stats.months} x="m" keys={[{ key: 'tot', label: 'Spese (€)' }]} unit="€" />
                  </ChartCard>
                  <ChartCard title={`Per categoria — ${stats.year}`}>{stats.byCat.length ? <Donut data={stats.byCat} /> : <p className="text-sm text-muted">Nessuna spesa quest'anno.</p>}</ChartCard>
                </div>
              )}
              {recurring.length > 0 && (
                <Card>
                  <h3 className="mb-2 text-sm font-medium">Spese ricorrenti rilevate</h3>
                  <ul className="space-y-1 text-sm">
                    {recurring.map((r) => (
                      <li key={r.key} className="flex justify-between gap-2">
                        <span>
                          {r.description} <span className="text-muted">({catLabel(r.category)}, in {r.months} mesi)</span>
                        </span>
                        <span>{eur(r.avgAmount)} · ~{eur(r.yearlyEstimate)}/anno</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted">Rilevate dai dati (stessa voce in almeno 3 mesi, importo simile). Rivedile per capire se ci sono duplicati; le cure veterinarie vanno comunque mantenute.</p>
                </Card>
              )}
            </div>
          )}
        />
      )}
    </div>
  )
}

function Progress({ value, max }: { value: number; max: number }) {
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface2" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemax={max}>
      <div className={cx('h-full', value > max ? 'bg-danger' : 'bg-primary')} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </div>
  )
}

// ---------------- AGENDA ----------------
export function Agenda() {
  const { store } = useApp()
  const { rows } = useTable('appointments')
  const [cursor, setCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [newOn, setNewOn] = useState<string | null>(null)

  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const offset = (first.getDay() + 6) % 7
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
    const cells: (Date | null)[] = [...Array(offset).fill(null), ...[...Array(days)].map((_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1, 12))]
    while (cells.length % 7) cells.push(null)
    return cells
  }, [cursor])
  const byDay = useMemo(() => {
    const m = new Map<string, Row[]>()
    for (const r of rows) {
      const k = dayKey(r.starts_at)
      m.set(k, [...(m.get(k) ?? []), r])
    }
    return m
  }, [rows])
  const today = dayKey(new Date())

  return (
    <ResourcePage
      table="appointments"
      title="Agenda familiare"
      intro="Visite, vaccini, trattamenti, toelettatura, acquisti e scadenze, condivisi con tutta la famiglia."
      header={() => (
        <Card className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <button aria-label="Mese precedente" className="grid size-9 place-items-center rounded-full hover:bg-surface2" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
              <ChevronLeft size={18} />
            </button>
            <h2 className="font-display text-lg capitalize">{cursor.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</h2>
            <button aria-label="Mese successivo" className="grid size-9 place-items-center rounded-full hover:bg-surface2" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] uppercase text-muted">
            {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((d, i) => (
              <div key={i}>{d}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {grid.map((d, i) => {
              if (!d) return <div key={i} />
              const k = dayKey(d)
              const ev = byDay.get(k) ?? []
              return (
                <button key={i} onClick={() => setNewOn(k)} className={cx('flex min-h-14 flex-col items-center rounded-xl border p-1 text-xs hover:bg-surface2', k === today ? 'border-primary' : 'border-transparent')} aria-label={`${d.getDate()} ${cursor.toLocaleDateString('it-IT', { month: 'long' })}: ${ev.length} eventi`}>
                  <span className={cx(k === today && 'font-bold text-primary')}>{d.getDate()}</span>
                  <span className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                    {ev.slice(0, 4).map((e) => (
                      <span key={e.id} className={cx('size-1.5 rounded-full', e.done ? 'bg-sage' : e.priority === 'alta' ? 'bg-danger' : 'bg-gold')} />
                    ))}
                  </span>
                </button>
              )
            })}
          </div>
          {newOn && <ResourceDialog table="appointments" defaults={{ starts_at: new Date(newOn + 'T09:00:00').toISOString() }} onClose={() => setNewOn(null)} />}
        </Card>
      )}
      extraCell={(r) => {
        const overdue = !r.done && new Date(r.starts_at).getTime() < Date.now()
        return (
          <label className="flex items-center gap-2 text-xs" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={!!r.done} onChange={(e) => void store.update('appointments', r.id, { done: e.target.checked })} aria-label="Completato" />
            {overdue && <Badge tone="danger">scaduto</Badge>}
          </label>
        )
      }}
    />
  )
}

// ---------------- LUOGHI ----------------
export function Places() {
  const { rows } = useTable('places')
  const emergencies = rows.filter((r) => r.emergency)
  return (
    <ResourcePage
      table="places"
      title="Luoghi e servizi"
      intro="Veterinari, clinica H24, farmacia, toelettatore, dog sitter, aree cani. Segna come “Contatto di emergenza” quelli da avere subito sotto mano."
      header={() =>
        emergencies.length ? (
          <Card className="border-danger/40 bg-danger/5">
            <h2 className="mb-2 flex items-center gap-2 font-medium text-danger">
              <Siren size={18} /> Contatti di emergenza
            </h2>
            <ul className="space-y-1.5 text-sm">
              {emergencies.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <strong>{p.name}</strong> <span className="text-muted">{p.hours ?? ''}</span>
                  </span>
                  {p.phone && (
                    <a href={`tel:${String(p.phone).replace(/\s/g, '')}`} className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-danger px-3 text-white">
                      <Phone size={15} /> {p.phone}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ) : null
      }
      extraCell={(r) =>
        r.phone ? (
          <a href={`tel:${String(r.phone).replace(/\s/g, '')}`} onClick={(e) => e.stopPropagation()} className="text-primary underline">
            Chiama
          </a>
        ) : null
      }
    />
  )
}

export type { ReactNode }
export { fmtDateTime, toCsv, download }
