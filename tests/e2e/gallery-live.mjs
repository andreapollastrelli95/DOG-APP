// Album foto contro Supabase reale: carica, mostra, ingrandisce, elimina. Dati di prova rimossi alla fine.
// Uso: BASE=http://localhost:4174 node tests/e2e/gallery-live.mjs  (richiede .env.local)
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const BASE = process.env.BASE ?? 'https://dog-app.pages.dev'
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
  const files = ['volantino/foto-cagnolina.png', 'public/icon-512.png'].map((f) => f)
  await page.getByLabel('Scegli foto').setInputFiles(files)
  await page.waitForFunction(() => document.querySelectorAll('img[alt="foto-cagnolina"], img[alt="icon-512"]').length === 2, null, { timeout: 30000 })
  await page.waitForFunction(() => [...document.querySelectorAll('img[alt="foto-cagnolina"], img[alt="icon-512"]')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 20000 })
  check('due foto caricate e visibili', true)
  check('due file nello Storage privato', (await objects()) === 2)
  if (SHOTS) await page.screenshot({ path: SHOTS + '/album.png' })
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('img[alt="foto-cagnolina"]').waitFor({ timeout: 20000 })
  check('foto presenti dopo ricarica', true)
  await page.getByRole('button', { name: 'Apri foto foto-cagnolina' }).click()
  check('foto ingrandita', await page.getByRole('button', { name: 'Avanti' }).isVisible())
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Elimina foto icon-512' }).click()
  await page.getByRole('button', { name: 'Elimina', exact: true }).last().click()
  await page.waitForFunction(() => !document.querySelector('img[alt="icon-512"]'), null, { timeout: 20000 })
  check('foto eliminata dalla Home', true)
  await page.waitForTimeout(1500)
  check('file eliminato anche dallo Storage', (await objects()) === 1)
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
