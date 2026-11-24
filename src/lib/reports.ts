// Report settimanale / mensile / annuale calcolati dai dati registrati (nessuna AI, nessun dato inventato).
import { analyze, dayKey, type Data } from './analysis'
import type { PdfSection } from './pdf'
import { EXPENSE_CATEGORIES } from './schema'

export type Period = 'settimanale' | 'mensile' | 'annuale'
const DAY = 86400000
const f1 = (n: number, d = 1) => n.toLocaleString('it-IT', { maximumFractionDigits: d })
const eur = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
const it = (k: string) => new Date(k + 'T12:00:00').toLocaleDateString('it-IT')

export function periodRange(p: Period, now: Date): { from: Date; to: Date; label: string } {
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  if (p === 'settimanale') return { from: new Date(to.getTime() - 7 * DAY + 1000), to, label: `ultimi 7 giorni (${it(dayKey(new Date(to.getTime() - 6 * DAY)))} – ${it(dayKey(to))})` }
  if (p === 'mensile') return { from: new Date(to.getTime() - 30 * DAY + 1000), to, label: `ultimi 30 giorni (${it(dayKey(new Date(to.getTime() - 29 * DAY)))} – ${it(dayKey(to))})` }
  return { from: new Date(now.getFullYear(), 0, 1), to, label: `anno ${now.getFullYear()}` }
}

export function buildReport(p: Period, data: Data, now = new Date()): { title: string; sections: PdfSection[] } {
  const { from, to, label } = periodRange(p, now)
  const inRange = (iso?: string | null) => !!iso && new Date(iso.length === 10 ? iso + 'T12:00:00' : iso) >= from && new Date(iso.length === 10 ? iso + 'T12:00:00' : iso) <= to
  const act = (data.activities ?? []).filter((a) => inRange(a.at))
  const meals = (data.meals ?? []).filter((a) => inRange(a.at))
  const beh = (data.behavior_logs ?? []).filter((a) => inRange(a.date))
  const wts = (data.weights ?? []).filter((a) => inRange(a.date)).sort((a, b) => a.date.localeCompare(b.date))
  const exp = (data.expenses ?? []).filter((a) => inRange(a.date))
  const appts = (data.appointments ?? []).filter((a) => inRange(a.starts_at))
  const health = (data.health_records ?? []).filter((a) => inRange(a.date))
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY))
  const sections: PdfSection[] = []

  const walks = act.filter((a) => a.kind === 'passeggiata')
  const totMin = act.filter((a) => a.kind !== 'riposo').reduce((s, a) => s + Number(a.duration_min), 0)
  const km = act.reduce((s, a) => s + (Number(a.distance_km) || 0), 0)
  sections.push({
    heading: 'Attività fisica',
    lines: act.length ? [`${act.length} attività registrate, di cui ${walks.length} passeggiate.`, `Tempo totale: ${totMin} minuti (media ${f1(totMin / days)} min/giorno sul periodo).`, km ? `Distanza registrata: ${f1(km)} km (solo dove inserita).` : 'Distanza non registrata.'] : ['Nessuna attività registrata nel periodo.'],
  })

  const foodMeals = meals.filter((m) => m.kind === 'pasto')
  const grams = foodMeals.reduce((s, m) => s + (Number(m.grams) || 0), 0)
  const mealDays = new Set(foodMeals.map((m) => dayKey(m.at))).size
  sections.push({
    heading: 'Alimentazione',
    lines: meals.length ? [`${foodMeals.length} pasti e ${meals.length - foodMeals.length} snack/integratori registrati in ${mealDays} giorni.`, mealDays ? `Media: ${f1(grams / mealDays, 0)} g di cibo nei giorni con registrazioni.` : ''].filter(Boolean) : ['Nessun pasto registrato nel periodo.'],
  })

  const w = wts.length
    ? p === 'annuale' || wts.length >= 2
      ? [`${wts.length} pesate. Prima: ${f1(wts[0].weight_kg)} kg (${it(wts[0].date)}) → ultima: ${f1(wts[wts.length - 1].weight_kg)} kg (${it(wts[wts.length - 1].date)}), variazione ${f1(wts[wts.length - 1].weight_kg - wts[0].weight_kg)} kg.`]
      : [`Una pesata: ${f1(wts[0].weight_kg)} kg (${it(wts[0].date)}).`]
    : ['Nessuna pesata nel periodo.']
  sections.push({ heading: 'Peso', lines: w })

  const avg = (k: string) => {
    const xs = beh.map((b) => b[k]).filter((x) => x != null).map(Number)
    return xs.length ? f1(xs.reduce((s, x) => s + x, 0) / xs.length) + '/5' : '—'
  }
  const unusual = beh.filter((b) => b.unusual).map((b) => `${it(b.date)}: ${b.unusual}`)
  sections.push({
    heading: 'Benessere e comportamento',
    lines: beh.length ? [`${beh.length} osservazioni. Medie — umore ${avg('mood')}, appetito ${avg('appetite')}, energia ${avg('energy')}, sonno ${avg('sleep')}.`, ...(unusual.length ? ['Episodi segnalati dalla famiglia:', ...unusual.slice(0, 10)] : ['Nessun episodio insolito segnalato.'])] : ['Nessuna osservazione nel periodo.'],
  })

  if (health.length) sections.push({ heading: 'Eventi sanitari', table: { head: ['Data', 'Evento', 'Veterinario'], rows: health.sort((a, b) => a.date.localeCompare(b.date)).map((h) => [it(h.date), h.title, h.vet_name ?? '']) } })

  const done = appts.filter((a) => a.done).length
  sections.push({
    heading: 'Appuntamenti',
    lines: appts.length ? [`${appts.length} eventi, ${done} completati, ${appts.length - done} non completati.`, ...appts.filter((a) => !a.done).slice(0, 8).map((a) => `Da completare: ${a.title} (${it(dayKey(a.starts_at))})`)] : ['Nessun evento nel periodo.'],
  })

  if (p !== 'settimanale') {
    const tot = exp.reduce((s, e) => s + Number(e.amount_eur), 0)
    const byCat = Object.entries(exp.reduce<Record<string, number>>((a, e) => ((a[e.category] = (a[e.category] ?? 0) + Number(e.amount_eur)), a), {})).sort((a, b) => b[1] - a[1])
    sections.push({ heading: 'Spese', lines: exp.length ? [`Totale: ${eur(tot)} (${exp.length} voci).`, ...byCat.map(([c, v]) => `${EXPENSE_CATEGORIES.find((x) => x.value === c)?.label ?? c}: ${eur(v)}`)] : ['Nessuna spesa nel periodo.'] })
  }

  const findings = analyze(data, now)
  sections.push({
    heading: p === 'mensile' || p === 'annuale' ? 'Variazioni da approfondire' : 'Segnalazioni',
    lines: findings.length
      ? findings.flatMap((x) => [`• ${x.title}`, `   Cosa è cambiato: ${x.changed}`, `   Rispetto a: ${x.versus}. Affidabilità: ${x.reliability}. ${x.reliabilityNote}`, `   Informazioni mancanti: ${x.missing.join(' ')}`, `   Approfondimento: ${x.suggestion}`])
      : ['Nessuna variazione significativa rispetto alle abitudini registrate.'],
  })
  sections.push({ heading: 'Nota', lines: ['Questo report riassume solo i dati inseriti dalla famiglia. Non è una diagnosi e non sostituisce il parere del veterinario.'] })
  return { title: `Report ${p} — ${label}`, sections }
}
