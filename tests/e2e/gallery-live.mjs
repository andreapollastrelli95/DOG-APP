// Album foto contro Supabase reale: carica, mostra, ingrandisce, elimina. Dati di prova rimossi alla fine.
// Uso: BASE=http://localhost:4174 node tests/e2e/gallery-live.mjs  (richiede .env.local)
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const BASE = process.env.BASE ?? 'https://lilla-app.pages.dev'
const SHOTS = process.env.SHOTS
const ref = env.SUPABASE_PROJECT_REF, url = `https://${ref}.supabase.co`
const mgmt = { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }
const sql = async (query) => (await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: mgmt, body: JSON.stringify({ query }) })).json()
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, { headers: mgmt })).json()
const svc = keys.find((k) => k.name === 'service_role').api_key
const admin = { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' }
const email = `test-album-${Date.now()}@example.com`, password = 'Prova!' + Date.now()
const user = await (await fetch(`${url}/auth/v1/admin/users`, { method: 'POST', headers: admin, body: JSON.stringify({ email, password, email_confirm: true }) })).json()
let failed = 0
const check = (n, ok, d = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`) }
const objects = async () => (await sql(`select o.name from storage.objects o join households h on o.name like h.id::text || '/%' join household_members m on m.household_id = h.id where m.user_id = '${user.id}'`)).length
const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder(/Password/).fill(password)
  await page.getByRole('button', { name: 'Accedi' }).last().click()
  await page.getByPlaceholder('Nome della famiglia').fill('Famiglia album prova')
  await page.getByRole('button', { name: 'Crea famiglia' }).click()
  await page.getByText('Album foto').waitFor({ timeout: 20000 })
  check('la Home mostra l\'album', true)
  // 7 foto: la griglia mostra 6 elementi per pagina
  const png = readFileSync('public/icon-192.png')
  await page.getByLabel('Scegli foto o video').setInputFiles(Array.from({ length: 7 }, (_, k) => ({ name: `prova-${k + 1}.png`, mimeType: 'image/png', buffer: png })))
  const pos = page.getByTestId('posizione-album')
  await page.waitForFunction(() => document.querySelector('[data-testid="posizione-album"]')?.textContent === '1 di 7', null, { timeout: 60000 })
  check('sette foto caricate', true)
  check('sette file nello Storage privato', (await objects()) === 7)
  const big = page.locator('img[alt^="prova-"]').first()
  await big.waitFor({ timeout: 20000 })
  if (SHOTS) await page.screenshot({ path: SHOTS + '/album.png' })
  await page.getByRole('button', { name: 'Successiva', exact: true }).click()
  check('freccia destra: foto successiva', (await pos.textContent()) === '2 di 7')
  await page.getByRole('button', { name: 'Precedente', exact: true }).click()
  check('freccia sinistra: foto precedente', (await pos.textContent()) === '1 di 7')
  await page.getByRole('button', { name: 'Griglia' }).click()
  check('griglia: 6 elementi nella prima pagina', (await page.getByTestId('cella-album').count()) === 6)
  if (SHOTS) await page.screenshot({ path: SHOTS + '/griglia.png', fullPage: true })
  await page.getByRole('button', { name: 'Successive' }).click()
  check('seconda pagina: 1 elemento', (await page.getByTestId('cella-album').count()) === 1)
  await page.getByRole('button', { name: /^Elimina prova-/ }).click()
  await page.getByRole('button', { name: 'Elimina', exact: true }).last().click()
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="cella-album"]').length === 6, null, { timeout: 20000 })
  check('eliminazione dalla griglia', true)
  await page.waitForTimeout(1500)
  check('file eliminato anche dallo Storage', (await objects()) === 6)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForFunction(() => document.querySelector('[data-testid="posizione-album"]')?.textContent === '1 di 6', null, { timeout: 30000 })
  check('foto presenti dopo ricarica', true)
  if (process.env.VIDEO) {
    await page.getByLabel('Scegli foto o video').setInputFiles(process.env.VIDEO)
    await page.waitForFunction(() => document.querySelector('[data-testid="posizione-album"]')?.textContent === '1 di 7', null, { timeout: 60000 })
    await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2, null, { timeout: 30000 })
    const t = await page.evaluate(async () => {
      const v = document.querySelector('video')
      v.muted = true
      await v.play()
      await new Promise((r) => setTimeout(r, 1500))
      return v.currentTime
    })
    check('video caricato e riprodotto', t > 0.5, 'tempo ' + t)
  }
  const wide = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  check('nessuno scorrimento orizzontale della pagina a 390 px', wide)
  check('nessun errore JS', errs.length === 0, errs.join(' | ').slice(0, 200))
} catch (e) {
  failed++
  console.log('FAIL  eccezione:', e.message.split('\n')[0])
} finally {
  await browser.close()
  const mine = await sql(`select household_id from household_members where user_id = '${user.id}'`)
  for (const { household_id } of mine) {
    const list = await sql(`select name from storage.objects where name like '${household_id}/%'`)
    if (list.length) await fetch(`${url}/storage/v1/object/documents`, { method: 'DELETE', headers: admin, body: JSON.stringify({ prefixes: list.map((o) => o.name) }) })
    await sql(`delete from households where id = '${household_id}'`)
  }
  await fetch(`${url}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: admin })
  const left = await sql(`select count(*)::int n from auth.users where email = '${email}'`)
  console.log('utente di prova rimosso:', left[0]?.n === 0)
}
process.exit(failed ? 1 : 0)
