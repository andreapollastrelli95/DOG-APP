// Test dal vivo del coordinatore + agenti con Gemini reale. Saltato se GEMINI_API_KEY non è impostata.
import { describe, expect, it } from 'vitest'
import { AGENTS, compactData, makeGemini, routeQuestion, runAgents, tablesFor } from '../supabase/functions/_shared/agents'

const key = process.env.GEMINI_API_KEY
const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite'

describe('agenti (offline)', () => {
  it('ogni agente riceve solo le tabelle che gli servono', () => {
    expect(tablesFor(['economist'])).toEqual(['expenses', 'budgets', 'food_products'])
    expect(tablesFor(['economist'])).not.toContain('health_records')
    expect(Object.keys(AGENTS)).toHaveLength(6)
  })
  it('compactData toglie campi inutili e limita la dimensione', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ id: String(i), household_id: 'h', created_by: 'u', date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, weight_kg: 30, notes: 'x'.repeat(200) }))
    const s = compactData({ weights: rows }, 80, 24000)
    expect(s).not.toContain('household_id')
    expect(s.length).toBeLessThanOrEqual(24000)
  })
})

describe.skipIf(!key)('agenti con Gemini reale', () => {
  it('instrada, analizza e produce una risposta unica strutturata', async () => {
    const g = makeGemini(key!, model)
    const t0 = Date.now()
    const route = await routeQuestion(g, 'Come sta andando il peso?', '2026-11-24')
    console.log('route', route, Date.now() - t0, 'ms')
    expect(route.agents.length).toBeGreaterThan(0)
    const r = await runAgents(g, {
      question: 'Come sta andando il peso?',
      history: [],
      route,
      today: '2026-11-24',
      data: { weights: [{ id: '1', date: '2026-11-01', weight_kg: 29.5 }, { id: '2', date: '2026-11-20', weight_kg: 31.4 }], dogs: [{ id: 'd', name: 'Bella' }] },
    })
    console.log(JSON.stringify(r.answer, null, 1), Date.now() - t0, 'ms')
    expect(r.answer.summary.length).toBeGreaterThan(10)
    expect(r.answer.verified.join(' ')).toMatch(/31[,.]4|29[,.]5/)
    expect(r.agents.length).toBeGreaterThan(0)
  }, 120000)
})
