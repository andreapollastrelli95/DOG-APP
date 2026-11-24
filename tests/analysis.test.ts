import { describe, expect, it } from 'vitest'
import { analyze, ageText, detectRecurring, runOutDate, weightFinding, dayKey } from '../src/lib/analysis'
import { normalize, validate, TABLES } from '../src/lib/schema'

const NOW = new Date('2026-06-30T12:00:00')
const day = (offset: number) => dayKey(new Date(NOW.getTime() - offset * 86400000))
const row = (o: Record<string, any>) => ({ id: Math.random().toString(36), created_at: '', updated_at: '', ...o }) as any

describe('analisi', () => {
  it('non segnala nulla con troppo pochi dati', () => {
    const f = analyze({ behavior_logs: [row({ date: day(1), energy: 1 })], weights: [row({ date: day(2), weight_kg: 30 })] }, NOW)
    expect(f.find((x) => x.metric === 'energy')).toBeUndefined()
    expect(f.find((x) => x.metric === 'weight' && x.id === 'weight-change')).toBeUndefined()
  })

  it('segnala un calo di energia rispetto alla baseline, con affidabilità e dati mancanti', () => {
    const logs = []
    for (let i = 8; i <= 33; i++) logs.push(row({ date: day(i), energy: i % 2 ? 4 : 5 }))
    for (let i = 0; i <= 6; i++) logs.push(row({ date: day(i), energy: 2 }))
    const f = analyze({ behavior_logs: logs, weights: [row({ date: day(1), weight_kg: 30 })] }, NOW).find((x) => x.metric === 'energy')!
    expect(f).toBeDefined()
    expect(f.title).toMatch(/più basso/)
    expect(f.reliability).toBe('alta')
    expect(f.versus).toMatch(/28 giorni/)
    expect(f.missing.length).toBeGreaterThan(0)
    expect(f.suggestion).toMatch(/non è una diagnosi/i)
  })

  it('non segnala fluttuazioni normali', () => {
    const logs = []
    for (let i = 0; i <= 33; i++) logs.push(row({ date: day(i), energy: i % 2 ? 4 : 5 }))
    expect(analyze({ behavior_logs: logs }, NOW).find((x) => x.metric === 'energy')).toBeUndefined()
  })

  it('segnala variazioni di peso >= 5% e riporta il numero di pesate', () => {
    const w = [row({ date: day(80), weight_kg: 30 }), row({ date: day(60), weight_kg: 30.2 }), row({ date: day(40), weight_kg: 29.8 }), row({ date: day(20), weight_kg: 30 }), row({ date: day(0), weight_kg: 32 })]
    const f = weightFinding(w, NOW)!
    expect(f.title).toMatch(/aumentato/)
    expect(f.reliability).toBe('media')
    expect(weightFinding([...w.slice(0, 4), row({ date: day(0), weight_kg: 30.3 })], NOW)).toBeNull()
  })

  it('segnala dati mancanti: nessuna pesata', () => {
    expect(analyze({}, NOW).some((x) => x.id === 'gap-weight')).toBe(true)
  })

  it('segnala eventi scaduti e richiami superati', () => {
    const f = analyze({ weights: [row({ date: day(1), weight_kg: 30 })], appointments: [row({ title: 'Vaccino', starts_at: new Date(NOW.getTime() - 5 * 86400000).toISOString(), done: false })], health_records: [row({ title: 'Rabbia', next_due_date: day(3) })] }, NOW)
    expect(f.some((x) => x.id === 'gap-overdue')).toBe(true)
    expect(f.some((x) => x.id === 'gap-due')).toBe(true)
  })

  it('individua spese ricorrenti', () => {
    const ex = [0, 1, 2, 3].map((m) => row({ description: 'Assicurazione', category: 'assicurazione', date: `2026-0${m + 3}-05`, amount_eur: 25 }))
    ex.push(row({ description: 'Palla', category: 'giochi', date: '2026-03-02', amount_eur: 5 }))
    const r = detectRecurring(ex)
    expect(r).toHaveLength(1)
    expect(Math.round(r[0].yearlyEstimate)).toBe(300)
  })

  it('stima la data di esaurimento e l’età', () => {
    expect(dayKey(runOutDate(3000, 300, NOW)!)).toBe('2026-07-10')
    expect(runOutDate(null, 300)).toBeNull()
    expect(ageText('2023-03-15', NOW)).toBe('3 anni e 3 mesi')
  })
})

describe('validazione', () => {
  it('rifiuta peso fuori range e campi obbligatori mancanti', () => {
    expect(validate(TABLES.weights, { date: '2026-01-01', weight_kg: 500 }).weight_kg).toMatch(/Massimo/)
    expect(validate(TABLES.weights, { weight_kg: 30 }).date).toBeDefined()
    expect(validate(TABLES.weights, { date: '2026-01-01', weight_kg: 30 })).toEqual({})
  })
  it('normalizza numeri e vuoti', () => {
    const n = normalize(TABLES.expenses, { date: '2026-01-01', category: 'giochi', description: 'x', amount_eur: '12.5', recurring: '' })
    expect(n.amount_eur).toBe(12.5)
    expect(n.recurring).toBeNull()
  })
})
