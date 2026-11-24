// Analisi longitudinale: baseline individuale e segnalazioni di variazione.
// NON è una diagnosi: confronta solo i dati registrati dalla famiglia con le abitudini precedenti della stessa cagnolina.
import type { Row } from './schema'

export type Data = Record<string, Row[]>

export interface Finding {
  id: string
  metric: string
  title: string
  /** 1. quale dato è cambiato */
  changed: string
  /** 2. rispetto a quale periodo */
  versus: string
  /** 3. affidabilità */
  reliability: 'alta' | 'media' | 'bassa'
  reliabilityNote: string
  /** 4. informazioni mancanti */
  missing: string[]
  /** 5. approfondimento opportuno */
  suggestion: string
  level: 'info' | 'attenzione'
}

const DAY = 86400000
export const dayKey = (d: Date | string) => {
  const x = typeof d === 'string' ? new Date(d) : d
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const dd = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length
const sd = (a: number[]) => {
  if (a.length < 2) return 0
  const m = mean(a)
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1))
}
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y)
  const h = Math.floor(s.length / 2)
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2
}
const fmt = (n: number, d = 1) => n.toLocaleString('it-IT', { maximumFractionDigits: d })
const pct = (n: number) => `${n > 0 ? '+' : ''}${fmt(n * 100, 0)}%`

/** Serie giornaliera: giorno -> valore (somma o media dei record del giorno). */
export function dailySeries(rows: Row[], dateKey: string, valueKey: string | ((r: Row) => number | null), agg: 'sum' | 'mean'): Map<string, number> {
  const buckets = new Map<string, number[]>()
  for (const r of rows) {
    const raw = r[dateKey]
    if (!raw) continue
    const v = typeof valueKey === 'function' ? valueKey(r) : r[valueKey]
    if (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) continue
    const k = dayKey(raw)
    if (!buckets.has(k)) buckets.set(k, [])
    buckets.get(k)!.push(Number(v))
  }
  const out = new Map<string, number>()
  for (const [k, vals] of buckets) out.set(k, agg === 'sum' ? vals.reduce((s, x) => s + x, 0) : mean(vals))
  return out
}

function windowValues(series: Map<string, number>, from: Date, to: Date): number[] {
  const out: number[] = []
  for (const [k, v] of series) {
    const t = new Date(k + 'T12:00:00').getTime()
    if (t >= from.getTime() && t < to.getTime()) out.push(v)
  }
  return out
}

interface MetricSpec {
  id: string
  label: string
  series: Map<string, number>
  kind: 'rating' | 'amount'
  unit: string
  what: string // cosa suggerire di osservare
  daysNote?: string
  zeroFill?: boolean // i giorni senza dato contano 0 (es. attività)
}

/** Confronta gli ultimi 7 giorni con i 28 giorni precedenti (baseline personale). */
export function compareRecentToBaseline(spec: MetricSpec, now: Date): Finding | null {
  const recentFrom = new Date(now.getTime() - 7 * DAY)
  const baseFrom = new Date(now.getTime() - 35 * DAY)
  let recent = windowValues(spec.series, recentFrom, new Date(now.getTime() + DAY))
  let base = windowValues(spec.series, baseFrom, recentFrom)
  if (spec.zeroFill) {
    // I giorni senza registrazioni contano 0 solo se la famiglia ha registrato qualcosa di recente (altrimenti sarebbe un buco di dati)
    const pad = (arr: number[], days: number) => arr.concat(Array(Math.max(0, days - arr.length)).fill(0))
    if (recent.length >= 1) recent = pad(recent, 7)
    if (base.length >= 3) base = pad(base, 28)
  }
  const MIN_RECENT = spec.zeroFill ? 7 : 4
  const MIN_BASE = spec.zeroFill ? 28 : 10
  if (recent.length < MIN_RECENT || base.length < MIN_BASE) return null
  const mR = mean(recent)
  const mB = mean(base)
  const s = sd(base)
  const diff = mR - mB
  const rel = mB !== 0 ? diff / mB : 0
  const z = s > 0 ? diff / s : 0
  const significant = spec.kind === 'rating' ? Math.abs(diff) >= 0.8 && Math.abs(z) >= 1.2 : Math.abs(rel) >= 0.25 && Math.abs(z) >= 1.2
  if (!significant) return null
  const nRecent = recent.length
  const nBase = base.length
  const reliability: Finding['reliability'] = nBase >= 20 && nRecent >= 6 ? 'alta' : nBase >= 14 ? 'media' : 'bassa'
  const dir = diff > 0 ? 'più alto' : 'più basso'
  return {
    id: 'trend-' + spec.id,
    metric: spec.id,
    title: `${spec.label}: valore ${dir} del solito`,
    changed:
      spec.kind === 'rating'
        ? `${spec.label}: media degli ultimi 7 giorni ${fmt(mR)} su 5 (prima ${fmt(mB)}).`
        : `${spec.label}: media degli ultimi 7 giorni ${fmt(mR)} ${spec.unit} (prima ${fmt(mB)} ${spec.unit}, ${pct(rel)}).`,
    versus: 'ultimi 7 giorni rispetto ai 28 giorni precedenti',
    reliability,
    reliabilityNote: `Basata su ${nRecent} giorni recenti e ${nBase} giorni di confronto con dati registrati.${spec.daysNote ? ' ' + spec.daysNote : ''}`,
    missing: [
      'Eventuali eventi che possono spiegare la variazione (cambio di cibo, caldo, visite, cambiamenti in famiglia).',
      ...(reliability !== 'alta' ? ['Più giorni di registrazione consecutivi renderebbero il confronto più affidabile.'] : []),
    ],
    suggestion: `${spec.what} Se la variazione continua o ti preoccupa, parlane con il veterinario. Questa non è una diagnosi.`,
    level: Math.abs(z) >= 2 ? 'attenzione' : 'info',
  }
}

export function weightFinding(weights: Row[], now: Date): Finding | null {
  const pts = weights
    .filter((w) => w.date && Number.isFinite(Number(w.weight_kg)))
    .map((w) => ({ t: new Date(w.date + 'T12:00:00').getTime(), kg: Number(w.weight_kg) }))
    .sort((a, b) => a.t - b.t)
  if (pts.length < 3) return null
  const last = pts[pts.length - 1]
  const prior = pts.filter((p) => p.t <= last.t - 0 && p !== last && p.t >= last.t - 90 * DAY)
  if (prior.length < 2) return null
  const base = median(prior.map((p) => p.kg))
  const rel = (last.kg - base) / base
  if (Math.abs(rel) < 0.05) return null
  const spanDays = Math.round((last.t - prior[0].t) / DAY)
  const reliability: Finding['reliability'] = prior.length >= 5 ? 'alta' : 'media'
  return {
    id: 'weight-change',
    metric: 'weight',
    title: `Peso ${rel > 0 ? 'aumentato' : 'diminuito'} del ${fmt(Math.abs(rel) * 100, 1)}%`,
    changed: `Ultima pesata ${fmt(last.kg)} kg (${dayKey(new Date(last.t))}), contro una mediana di ${fmt(base)} kg (${pct(rel)}).`,
    versus: `ultimi 90 giorni (${prior.length} pesate precedenti, su ${spanDays} giorni)`,
    reliability,
    reliabilityNote: `${prior.length + 1} pesate. Pesate fatte con bilance o orari diversi possono differire di diverse centinaia di grammi.`,
    missing: ['Bilancia/modalità di pesata usata ogni volta.', 'Variazioni di alimentazione o attività nello stesso periodo.'],
    suggestion: 'Ripeti la pesata con le stesse modalità e valuta una variazione di peso con il veterinario, che può indicare il peso ideale per la tua cagnolina.',
    level: Math.abs(rel) >= 0.1 ? 'attenzione' : 'info',
  }
}

export function dataGapFindings(data: Data, now: Date): Finding[] {
  const out: Finding[] = []
  const weights = data.weights ?? []
  const lastW = weights.map((w) => new Date(w.date + 'T12:00:00').getTime()).sort((a, b) => b - a)[0]
  if (!lastW || now.getTime() - lastW > 60 * DAY) {
    out.push({
      id: 'gap-weight',
      metric: 'weight',
      title: lastW ? 'Nessuna pesata negli ultimi 60 giorni' : 'Nessuna pesata registrata',
      changed: lastW ? `Ultima pesata: ${dayKey(new Date(lastW))}.` : 'Non ci sono pesate nello storico.',
      versus: 'ultimi 60 giorni',
      reliability: 'alta',
      reliabilityNote: 'Si tratta di un dato mancante, non di una variazione.',
      missing: ['Una pesata aggiornata.'],
      suggestion: 'Registra una pesata: per una cagnolina di taglia grande il controllo regolare del peso è utile; la frequenza giusta te la indica il veterinario.',
      level: 'info',
    })
  }
  const overdue = (data.appointments ?? []).filter((a) => !a.done && new Date(a.starts_at).getTime() < now.getTime() - DAY)
  if (overdue.length) {
    out.push({
      id: 'gap-overdue',
      metric: 'agenda',
      title: `${overdue.length} ${overdue.length === 1 ? 'evento scaduto non completato' : 'eventi scaduti non completati'}`,
      changed: overdue
        .slice(0, 3)
        .map((a) => `${a.title} (${dayKey(a.starts_at)})`)
        .join(', '),
      versus: 'data odierna',
      reliability: 'alta',
      reliabilityNote: 'Calcolato dall’agenda.',
      missing: ['Segna come completati gli eventi già svolti, oppure riprogrammali.'],
      suggestion: 'Apri l’agenda e completa o riprogramma gli eventi scaduti (vaccini e trattamenti: contatta il veterinario).',
      level: 'attenzione',
    })
  }
  const due = (data.health_records ?? []).filter((h) => h.next_due_date && new Date(h.next_due_date).getTime() < now.getTime())
  if (due.length) {
    out.push({
      id: 'gap-due',
      metric: 'health',
      title: `${due.length} ${due.length === 1 ? 'scadenza sanitaria superata' : 'scadenze sanitarie superate'}`,
      changed: due
        .slice(0, 3)
        .map((h) => `${h.title} (scadenza ${h.next_due_date})`)
        .join(', '),
      versus: 'data odierna',
      reliability: 'alta',
      reliabilityNote: 'Calcolato dalle scadenze inserite nella cartella clinica.',
      missing: ['Se il richiamo è già stato eseguito, registralo come nuovo evento.'],
      suggestion: 'Contatta il veterinario per sapere se il richiamo è da eseguire.',
      level: 'attenzione',
    })
  }
  return out
}

export interface RecurringExpense {
  key: string
  description: string
  category: string
  months: number
  avgAmount: number
  yearlyEstimate: number
}

/** Individua spese che si ripetono in almeno 3 mesi diversi con importo simile (±20%). */
export function detectRecurring(expenses: Row[]): RecurringExpense[] {
  const groups = new Map<string, Row[]>()
  for (const e of expenses) {
    const key = String(e.description ?? '')
      .toLowerCase()
      .replace(/[^a-zà-ú0-9 ]/g, '')
      .trim()
    if (!key) continue
    const k = key + '|' + e.category
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(e)
  }
  const out: RecurringExpense[] = []
  for (const [k, rows] of groups) {
    const months = new Set(rows.map((r) => String(r.date).slice(0, 7)))
    if (months.size < 3) continue
    const amounts = rows.map((r) => Number(r.amount_eur))
    const m = mean(amounts)
    if (!amounts.every((a) => Math.abs(a - m) / m <= 0.2)) continue
    const sorted = [...months].sort()
    const [y1, m1] = sorted[0].split('-').map(Number)
    const [y2, m2] = sorted[sorted.length - 1].split('-').map(Number)
    const span = (y2 - y1) * 12 + (m2 - m1) + 1
    const total = amounts.reduce((s, x) => s + x, 0)
    out.push({ key: k, description: rows[0].description, category: rows[0].category, months: months.size, avgAmount: m, yearlyEstimate: (total / span) * 12 })
  }
  return out.sort((a, b) => b.yearlyEstimate - a.yearlyEstimate)
}

export function expenseFinding(expenses: Row[], now: Date): Finding | null {
  const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const byMonth = new Map<string, number>()
  for (const e of expenses) byMonth.set(String(e.date).slice(0, 7), (byMonth.get(String(e.date).slice(0, 7)) ?? 0) + Number(e.amount_eur))
  const prevMonths: number[] = []
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    if (byMonth.has(ym(d))) prevMonths.push(byMonth.get(ym(d))!)
  }
  if (prevMonths.length < 2) return null
  // Confronta solo a mese concluso (o oltre il 20 del mese) per non segnalare mesi incompleti
  const cur = byMonth.get(ym(now)) ?? 0
  if (now.getDate() < 20) return null
  const base = mean(prevMonths)
  const rel = (cur - base) / base
  if (rel < 0.3) return null
  return {
    id: 'expense-high',
    metric: 'expenses',
    title: 'Spese del mese più alte del solito',
    changed: `Spese del mese: ${fmt(cur, 2)} € (media dei mesi precedenti ${fmt(base, 2)} €, ${pct(rel)}).`,
    versus: `media degli ultimi ${prevMonths.length} mesi`,
    reliability: prevMonths.length >= 3 ? 'alta' : 'media',
    reliabilityNote: 'Una singola voce (visita, vaccino, scorta di cibo) può spiegare tutta la differenza.',
    missing: ['Voci straordinarie del mese (visite, interventi, acquisti una tantum).'],
    suggestion: 'Controlla le voci più alte nel modulo Spese: le cure veterinarie vanno mantenute; valuta eventuali risparmi su acquisti ridondanti.',
    level: 'info',
  }
}

/** Esegue tutte le analisi. */
export function analyze(data: Data, now = new Date()): Finding[] {
  const out: Finding[] = []
  const w = weightFinding(data.weights ?? [], now)
  if (w) out.push(w)

  const beh = data.behavior_logs ?? []
  for (const [key, label, what] of [
    ['appetite', 'Appetito', 'Osserva quanto mangia e se lascia il cibo.'],
    ['energy', 'Energia', 'Osserva se è più apatica o più agitata del solito.'],
    ['sleep', 'Sonno', 'Osserva la durata e la qualità del riposo.'],
    ['mood', 'Umore', 'Osserva eventuali cambiamenti nella routine.'],
  ] as const) {
    let series = dailySeries(beh, 'date', key, 'mean')
    if (key === 'appetite') {
      // aggiunge l'appetito annotato nei pasti
      const m = dailySeries(data.meals ?? [], 'at', 'appetite', 'mean')
      for (const [k, v] of m) series.set(k, series.has(k) ? (series.get(k)! + v) / 2 : v)
    }
    const f = compareRecentToBaseline({ id: key, label, series, kind: 'rating', unit: '', what }, now)
    if (f) out.push(f)
  }

  const act = (data.activities ?? []).filter((a) => a.kind !== 'riposo')
  const actSeries = dailySeries(act, 'at', 'duration_min', 'sum')
  const fa = compareRecentToBaseline({ id: 'activity', label: 'Attività fisica giornaliera', series: actSeries, kind: 'amount', unit: 'min/giorno', what: 'Verifica se ci sono stati cambiamenti nella routine di uscite o nel meteo.', zeroFill: true, daysNote: 'I giorni senza registrazioni sono contati come 0 minuti: ricordati di registrare tutte le uscite.' }, now)
  if (fa) out.push(fa)

  const mealSeries = dailySeries((data.meals ?? []).filter((m) => m.kind === 'pasto'), 'at', 'grams', 'sum')
  const fm = compareRecentToBaseline({ id: 'food', label: 'Cibo giornaliero', series: mealSeries, kind: 'amount', unit: 'g/giorno', what: 'Controlla se è cambiato il prodotto o la porzione.' }, now)
  if (fm) out.push(fm)

  const fe = expenseFinding(data.expenses ?? [], now)
  if (fe) out.push(fe)
  out.push(...dataGapFindings(data, now))
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'attenzione' ? -1 : 1))
}

/** Stima della data di esaurimento di un alimento. */
export function runOutDate(stockGrams: number | null | undefined, dailyGrams: number | null | undefined, from = new Date()): Date | null {
  if (!stockGrams || !dailyGrams || dailyGrams <= 0) return null
  return new Date(from.getTime() + Math.floor(stockGrams / dailyGrams) * DAY)
}

/** Età leggibile a partire dalla data di nascita. */
export function ageText(birth?: string | null, now = new Date()): string {
  if (!birth) return ''
  const b = new Date(birth + 'T12:00:00')
  let months = (now.getFullYear() - b.getFullYear()) * 12 + now.getMonth() - b.getMonth()
  if (now.getDate() < b.getDate()) months--
  if (months < 0) return ''
  const y = Math.floor(months / 12)
  const m = months % 12
  const parts = []
  if (y) parts.push(`${y} ${y === 1 ? 'anno' : 'anni'}`)
  if (m || !y) parts.push(`${m} ${m === 1 ? 'mese' : 'mesi'}`)
  return parts.join(' e ')
}
