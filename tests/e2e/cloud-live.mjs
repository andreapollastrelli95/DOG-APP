// Prova sull'app pubblicata: login reale, creazione famiglia, AI cloud. Utente di prova creato e poi eliminato.
// Uso: BASE=https://lilla-app.pages.dev node tests/e2e/cloud-live.mjs  (richiede .env.local)
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')), l.slice(l.indexOf('=')+1).trim()]))
const BASE = process.env.BASE ?? 'https://lilla-app.pages.dev'
const ref = env.SUPABASE_PROJECT_REF, url = `https://${ref}.supabase.co`
const mg = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, { headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`} })).json()
const svc = mg.find(k=>k.name==='service_role').api_key
const email = `test-ui-${Date.now()}@example.com`, password = 'Prova!' + Date.now()
const u = await (await fetch(`${url}/auth/v1/admin/users`, { method:'POST', headers:{apikey:svc,Authorization:`Bearer ${svc}`,'Content-Type':'application/json'}, body: JSON.stringify({ email, password, email_confirm:true }) })).json()
let failed = 0
const check = (n, ok, d='') => { if(!ok) failed++; console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`) }
const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true })
try {
  const page = await browser.newPage({ viewport:{ width:1280, height:900 } })
  const errs = []; page.on('pageerror', e => errs.push(e.message))
  await page.goto(BASE, { waitUntil:'networkidle' })
  check('la pagina pubblica mostra l\'accesso', await page.getByRole('button', { name: 'Accedi' }).first().isVisible())
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder(/Password/).fill(password)
  await page.getByRole('button', { name: 'Accedi' }).last().click()
  await page.getByPlaceholder('Nome della famiglia').waitFor({ timeout: 15000 })
  check('login riuscito, chiede di creare la famiglia', true)
  await page.getByPlaceholder('Nome della famiglia').fill('Famiglia di prova')
  await page.getByRole('button', { name: 'Crea famiglia' }).click()
  await page.waitForFunction(() => !document.querySelector('input[placeholder="Nome della famiglia"]'), null, { timeout: 15000 })
  check('famiglia creata sul cloud', true)
  await page.goto(BASE + '/profilo', { waitUntil: 'networkidle' })
  const body = await page.locator('body').innerText()
  check('app cloud caricata (nessun errore JS)', errs.length === 0, errs.join(' | ').slice(0, 200))
  check('nessuna scritta "modalità demo" in cloud', !/dati di esempio/i.test(body.slice(0, 400)))
  await page.goto(BASE + '/impostazioni', { waitUntil: 'networkidle' })
  const imp = await page.locator('body').innerText()
  check('Impostazioni: AI risulta attiva', /gemini|attiva|disponibile/i.test(imp) && !/non disponibile/i.test(imp.split('Intelligenza')[1]?.slice(0, 300) ?? ''))
} catch (e) { failed++; console.log('FAIL  eccezione:', e.message.split('\n')[0]) }
finally {
  await browser.close()
  await fetch(`${url}/auth/v1/admin/users/${u.id}`, { method:'DELETE', headers:{apikey:svc,Authorization:`Bearer ${svc}`} })
}
process.exit(failed ? 1 : 0)
