// Dati di ESEMPIO. Vengono scritti solo nel database "demo" (separato dai dati reali) e il nome è marcato (ESEMPIO).
import type { Store } from './store'

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}
const iso = (d: Date) => d.toISOString()
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export async function seedDemo(store: Store, now = new Date()) {
  if ((await store.list('dogs')).length) return
  const r = rng(42)
  const daysAgo = (n: number, h = 8) => {
    const d = new Date(now)
    d.setDate(d.getDate() - n)
    d.setHours(h, Math.floor(r() * 50), 0, 0)
    return d
  }
  await store.insert('dogs', {
    name: 'Luna (ESEMPIO)',
    breed: 'Labrador Retriever',
    birth_date: ymd(new Date(now.getFullYear() - 3, now.getMonth(), 10)),
    sex: 'F',
    size: 'grande',
    coat: 'Mantello color miele',
    sterilized: true,
    adoption_date: ymd(new Date(now.getFullYear() - 3, now.getMonth() + 2, 1)),
    allergies: 'Dato di esempio',
    notes: 'Questi sono dati di ESEMPIO per provare l’app: non sono reali.',
  })
  for (let i = 0; i < 10; i++) await store.insert('weights', { date: ymd(daysAgo(i * 14)), weight_kg: Math.round((29.5 + (r() - 0.5) * 0.8 + (i < 1 ? 1.9 : 0)) * 10) / 10, notes: i === 0 ? 'Pesata di esempio' : null })
  for (let i = 0; i < 70; i++) {
    const d = daysAgo(i)
    const recent = i < 7
    for (const [h, grams] of [[8, 190], [19, 190]] as const) await store.insert('meals', { at: iso(new Date(new Date(d).setHours(h, 0))), kind: 'pasto', food_name: 'Crocchette adult large', grams: Math.round(grams + (r() - 0.5) * 20), appetite: recent ? (r() < 0.5 ? 3 : 4) : r() < 0.5 ? 4 : 5 })
    await store.insert('activities', { at: iso(daysAgo(i, 7)), kind: 'passeggiata', duration_min: Math.round((recent ? 30 : 45) + r() * 10), distance_km: Math.round((recent ? 2 : 3.2) * 10) / 10, route: 'Giro del parco' })
    if (r() < 0.8) await store.insert('activities', { at: iso(daysAgo(i, 18)), kind: 'passeggiata', duration_min: Math.round((recent ? 25 : 40) + r() * 10), distance_km: 2.5 })
    await store.insert('behavior_logs', { date: ymd(d), mood: 4, appetite: recent ? 3 : r() < 0.5 ? 4 : 5, energy: recent ? 2 + (r() < 0.4 ? 1 : 0) : r() < 0.5 ? 4 : 5, sleep: 4, sociality: 4 })
  }
  await store.insert('health_records', { date: ymd(daysAgo(150)), kind: 'vaccinazione', title: 'Vaccino polivalente (esempio)', vet_name: 'Dott. Esempio', next_due_date: ymd(new Date(now.getTime() + 20 * 86400000)), cost_eur: 55 })
  await store.insert('health_records', { date: ymd(daysAgo(40)), kind: 'visita', title: 'Controllo annuale (esempio)', vet_name: 'Dott. Esempio', cost_eur: 60, description: 'Visita di controllo di esempio.' })
  await store.insert('health_records', { date: ymd(daysAgo(20)), kind: 'antiparassitario', title: 'Antiparassitario (esempio)', dosage: 'Come da indicazioni del veterinario', next_due_date: ymd(new Date(now.getTime() + 10 * 86400000)), cost_eur: 18 })
  await store.insert('food_products', { brand: 'Marca Esempio', name: 'Crocchette adult large 12 kg', type: 'secco', daily_grams: 380, stock_grams: 6200, purchase_date: ymd(daysAgo(18)), cost_eur: 62 })
  for (let m = 0; m < 5; m++) {
    const base = new Date(now.getFullYear(), now.getMonth() - m, 3)
    await store.insert('expenses', { date: ymd(base), category: 'alimentazione', description: 'Sacco crocchette', amount_eur: 62, recurring: 'mensile' })
    await store.insert('expenses', { date: ymd(new Date(base.getTime() + 86400000)), category: 'assicurazione', description: 'Assicurazione animali', amount_eur: 24.5, recurring: 'mensile' })
    if (m % 2 === 0) await store.insert('expenses', { date: ymd(new Date(base.getTime() + 5 * 86400000)), category: 'toelettatura', description: 'Toelettatura', amount_eur: 45 })
  }
  await store.insert('expenses', { date: ymd(daysAgo(40)), category: 'veterinario', description: 'Controllo annuale', amount_eur: 60 })
  await store.insert('budgets', { period: 'mensile', category: null, amount_eur: 180 })
  const inDays = (n: number, h: number) => iso(new Date(new Date(now.getTime() + n * 86400000).setHours(h, 0, 0, 0)))
  await store.insert('appointments', { starts_at: inDays(5, 10), kind: 'visita', title: 'Visita di controllo (esempio)', assignee: 'Mamma', priority: 'alta', remind_before_min: 1440, done: false })
  await store.insert('appointments', { starts_at: inDays(2, 16), kind: 'toelettatura', title: 'Toelettatura (esempio)', assignee: 'Papà', priority: 'normale', done: false })
  await store.insert('appointments', { starts_at: inDays(-3, 9), kind: 'acquisto', title: 'Comprare crocchette (esempio)', priority: 'normale', done: false })
  await store.insert('places', { kind: 'veterinario', name: 'Studio Veterinario Esempio', phone: '000 0000000', address: 'Via Esempio 1', hours: 'Lun-Ven 9-18', emergency: true, notes: 'Dato di esempio' })
}
