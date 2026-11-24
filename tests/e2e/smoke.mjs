// Collaudo end-to-end su Edge reale contro `vite preview` (modalità locale, senza cloud).
// Uso: npm run build; npx vite preview --port 4173; BASE=http://localhost:4173 node tests/e2e/smoke.mjs
// Le chiamate AI usano il server locale e la GEMINI_API_KEY dell'ambiente (chiamate reali).
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BASE = process.env.BASE ?? 'http://localhost:4173'
const SHOTS = process.env.SHOTS ?? ''
const EDGE = process.env.EDGE ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const WITH_AI = process.env.WITH_AI !== '0'
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}
const until = async (fn, ms = 6000) => {
  const t = Date.now()
  while (Date.now() - t < ms) {
    try {
      if (await fn()) return true
    } catch {}
    await new Promise((r) => setTimeout(r, 100))
  }
  return false
}
const shot = async (page, n) => SHOTS && (await page.screenshot({ path: `${SHOTS}/${n}.png` }))

// PNG 64x64 di prova
function png() {
  const s = 64
  const raw = Buffer.alloc((s * 3 + 1) * s)
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) raw.set([200, 150, 90], y * (s * 3 + 1) + 1 + x * 3)
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (b) => { let r = 0xffffffff; for (const x of b) r = crcT[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0 }
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]) }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(s, 0); ih.writeUInt32BE(s, 4); ih[8] = 8; ih[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const tmp = process.env.TMPDIR ?? process.env.TEMP ?? '.'
const PNG = `${tmp}/dm-test.png`
writeFileSync(PNG, png())

const browser = await chromium.launch({ executablePath: EDGE, headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

const quick = (name) => page.getByRole('button', { name, exact: false }).first()
const save = () => page.getByRole('button', { name: 'Salva', exact: true }).click()

try {
  // ---------- avvio ----------
  await page.goto(BASE)
  await page.getByText('Benvenuti in DOG MANAGER').waitFor()
  check('App si carica in modalità locale senza dati finti', true)
  check('Indicatore "solo su questo dispositivo" visibile', await page.getByText('Solo su questo dispositivo').first().isVisible())
  check('Nessuna pesata/ultima passeggiata inventata', (await page.getByText('Nessuna pesata').count()) > 0)
  await shot(page, '01-dashboard-vuota')

  // ---------- profilo ----------
  await page.goto(BASE + '/profilo')
  await page.locator('#f-name').waitFor()
  await page.getByRole('button', { name: 'Salva profilo' }).click()
  check('Profilo: nome obbligatorio (validazione)', await page.getByText('Campo obbligatorio').isVisible())
  await page.locator('#f-name').fill('Bella')
  await page.locator('#f-breed').fill('Labrador')
  await page.locator('#f-birth_date').fill('2022-05-10')
  await page.locator('#f-microchip').fill('380260000000000')
  await page.setInputFiles('input[aria-label="Carica fotografia"]', PNG)
  await page.getByRole('button', { name: 'Salva profilo' }).click()
  await page.getByText('Profilo salvato').waitFor()
  check('Profilo salvato', true)
  check('Profilo: elenco "Da completare" mostra campi vuoti, nessun dato inventato', await page.getByText('Da completare:').isVisible())

  // ---------- dashboard con quick actions ----------
  await page.goto(BASE)
  await page.getByRole('heading', { name: 'Bella' }).waitFor()
  check('Dashboard mostra nome e età', (await page.getByText(/Labrador · \d+ anni/).count()) > 0)
  check('Foto del profilo mostrata', (await page.locator('img[alt="Bella"]').count()) > 0)

  // peso: validazione
  await quick('Registra peso').click()
  await page.locator('#f-weight_kg').fill('500')
  await save()
  check('Peso fuori range rifiutato', await page.getByText('Massimo 120').isVisible())
  await page.locator('#f-weight_kg').fill('29.4')
  await save()
  await page.getByText('Salvato', { exact: true }).waitFor()
  check('Dashboard si aggiorna: ultimo peso 29,4 kg', await until(async () => (await page.getByText('29,4 kg').count()) > 0))

  // pasto e passeggiata
  await quick('Registra pasto').click()
  await page.locator('#f-food_name').fill('Crocchette')
  await page.locator('#f-grams').fill('200')
  await save()
  await quick('Registra passeggiata').click()
  await page.locator('#f-duration_min').fill('40')
  await page.locator('#f-distance_km').fill('2.5')
  await save()
  check('Dashboard: ultima passeggiata "oggi" 40 min', await until(async () => (await page.getByText('40 min · 2,5 km').count()) > 0))

  // spesa
  await quick('Registra spesa').click()
  await page.locator('#f-description').fill('Sacco crocchette')
  await page.locator('#f-amount_eur').fill('62.5')
  await save()
  check('Dashboard: spese del mese 62,50 €', await until(async () => (await page.locator('text=/62,50/').count()) > 0))

  // ---------- eventi/agenda ----------
  await page.goto(BASE + '/agenda')
  await page.getByRole('button', { name: 'Aggiungi' }).click()
  await page.locator('#f-title').fill('Visita di controllo')
  await page.locator('#f-assignee').fill('Mamma')
  await page.locator('#f-remind_before_min').selectOption('1440')
  const future = new Date(Date.now() + 3 * 86400000)
  const p2 = (n) => String(n).padStart(2, '0')
  await page.locator('#f-starts_at').fill(`${future.getFullYear()}-${p2(future.getMonth() + 1)}-${p2(future.getDate())}T10:30`)
  await save()
  await page.getByText('Visita di controllo').first().waitFor()
  check('Agenda: evento creato e visibile', true)
  await page.getByLabel('Completato').first().click()
  check('Agenda: evento segnato completato', await until(async () => await page.getByLabel('Completato').first().isChecked()))

  // modifica
  await page.getByRole('button', { name: 'Modifica' }).first().click()
  await page.locator('#f-title').fill('Visita annuale')
  await save()
  check('Modifica salvata e mostrata', await until(async () => (await page.getByText('Visita annuale').count()) > 0))

  // cronologia modifiche
  await page.goto(BASE + '/impostazioni')
  check('Cronologia: registra chi ha fatto cosa', await until(async () => (await page.getByText(/ha modificato: Visita annuale/).count()) > 0))
  await shot(page, '02-impostazioni')

  // eliminazione con conferma
  await page.goto(BASE + '/agenda')
  await page.getByRole('button', { name: 'Elimina' }).first().click()
  check('Eliminazione chiede conferma', await page.getByText(/Eliminare definitivamente/).isVisible())
  await page.getByRole('button', { name: 'Annulla' }).click()
  check('Annulla non elimina', (await page.getByText('Visita annuale').count()) > 0)
  await page.getByRole('button', { name: 'Elimina' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Elimina' }).click()
  check('Elimina dopo conferma', await until(async () => (await page.getByText('Visita annuale').count()) === 0))

  // ---------- salute / PDF / CSV ----------
  await page.goto(BASE + '/salute')
  await page.getByRole('button', { name: 'Aggiungi' }).click()
  await page.locator('#f-title').fill('Vaccino rabbia')
  await page.locator('#f-kind').selectOption('vaccinazione')
  await page.locator('#f-vet_name').fill('Dott. Verdi')
  await page.locator('#f-cost_eur').fill('45')
  await page.locator('#f-next_due_date').fill('2027-05-01')
  await save()
  await page.getByText('Vaccino rabbia').first().waitFor()
  check('Salute: evento clinico salvato con autore', (await page.getByText('Io').count()) > 0)
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Esporta cartella clinica/ }).click()])
  const pdfPath = `${tmp}/dm-cartella.pdf`
  await pdf.saveAs(pdfPath)
  const { readFileSync } = await import('node:fs')
  const head = readFileSync(pdfPath).subarray(0, 5).toString()
  check('Cartella clinica PDF scaricata (%PDF)', head === '%PDF-' && readFileSync(pdfPath).length > 1500, `${readFileSync(pdfPath).length} byte`)
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV' }).click()])
  await csv.saveAs(`${tmp}/dm-health.csv`)
  const csvText = readFileSync(`${tmp}/dm-health.csv`, 'utf8')
  check('CSV contiene la riga e il separatore ;', csvText.includes('Vaccino rabbia') && csvText.includes(';'))

  // ---------- documenti ----------
  await page.goto(BASE + '/archivio')
  await page.getByRole('button', { name: 'Carica' }).first().click()
  await page.setInputFiles('input[aria-label="Scegli file"]', PNG)
  await page.getByLabel('Titolo').fill('Foto di prova')
  await page.getByLabel('Tag').fill('foto, test')
  await page.getByRole('button', { name: 'Salva', exact: true }).click()
  await page.getByText('Documento salvato').waitFor()
  check('Documento caricato e in elenco', await page.getByText('Foto di prova').first().isVisible())
  await page.getByText('Foto di prova').first().click()
  check('Anteprima immagine mostrata', await until(async () => (await page.locator('[role=dialog] img').count()) > 0))
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Scarica' }).click()])
  await dl.saveAs(`${tmp}/dm-down.png`)
  check('Download restituisce lo stesso file', readFileSync(`${tmp}/dm-down.png`).equals(readFileSync(PNG)))
  await page.getByRole('button', { name: 'Elimina' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Elimina' }).last().click()
  check('Documento eliminato', await until(async () => (await page.getByText('Foto di prova').count()) === 0))

  // ---------- persistenza ----------
  await page.goto(BASE)
  await page.reload()
  await page.getByRole('heading', { name: 'Bella' }).waitFor()
  check('Dati persistenti dopo ricarica', (await page.getByText('29,4 kg').count()) > 0)

  // ---------- demo ----------
  await page.goto(BASE + '/impostazioni')
  await page.getByRole('button', { name: 'Prova la demo' }).click()
  await page.getByText('Stai vedendo dati di ESEMPIO').waitFor()
  check('Demo: banner evidente', true)
  await page.goto(BASE + '/')
  check('Demo: il nome è marcato (ESEMPIO)', await until(async () => await page.getByRole('heading', { name: 'Luna (ESEMPIO)' }).isVisible(), 20000))
  await page.goto(BASE + '/analisi')
  check('Analisi: variazione di energia rilevata rispetto alla baseline', await until(async () => (await page.getByText(/Energia: valore più basso/).count()) > 0, 8000))
  check('Analisi: variazione di peso rilevata (+5%)', (await page.getByText(/Peso aumentato/).count()) > 0)
  check('Analisi: mostra i 5 punti (cosa/rispetto a/affidabilità/mancanti/approfondimento)', (await page.getByText('5. Approfondimento').count()) > 0 && (await page.getByText('2. Rispetto a').count()) > 0)
  await shot(page, '03-analisi-demo')
  const [rp] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF' }).click()])
  await rp.saveAs(`${tmp}/dm-report.pdf`)
  check('Report PDF scaricato', readFileSync(`${tmp}/dm-report.pdf`).subarray(0, 5).toString() === '%PDF-')
  await page.goto(BASE + '/spese')
  check('Spese: ricorrenze rilevate (assicurazione/sacco)', await until(async () => (await page.getByText('Spese ricorrenti rilevate').count()) > 0))
  check('Spese: grafici renderizzati', (await page.locator('.recharts-surface').count()) >= 2)
  await shot(page, '04-spese-demo')
  await page.goto(BASE + '/attivita')
  check('Attività: grafici settimanali', (await page.locator('.recharts-surface').count()) >= 2)
  await page.goto(BASE + '/benessere')
  check('Benessere: grafico temporale', await until(async () => (await page.locator('.recharts-surface').count()) >= 1))
  await page.goto(BASE + '/alimentazione')
  check('Alimentazione: grafico consumi', await until(async () => (await page.locator('.recharts-surface').count()) >= 1))
  await page.goto(BASE + '/')
  await shot(page, '05-dashboard-demo')

  // ---------- AI ----------
  await page.goto(BASE + '/ai')
  const status = await page.evaluate(() => fetch('/api/ai/status').then((r) => r.json()))
  if (status.configured && WITH_AI) {
    await page.getByText(/Provider: Google Gemini/).waitFor()
    await page.getByLabel('Domanda').fill('Come sta andando l\'energia di Luna nell\'ultima settimana rispetto alle precedenti?')
    await page.getByRole('button', { name: 'Invia' }).click()
    const ok = await until(async () => (await page.getByText('Dati verificati').count()) > 0 || (await page.locator('[role=alert]').count()) > 0, 150000)
    const err = await page.locator('[role=alert]').allInnerTexts()
    check('AI: risposta strutturata del coordinatore (dati verificati/ipotesi/suggerimenti)', ok && (await page.getByText('Dati verificati').count()) > 0, err.join('|'))
    check('AI: indica gli specialisti usati', (await page.getByText(/Specialisti:/).count()) > 0)
    await shot(page, '06-ai')
    check('AI: conversazione salvata nello storico', (await page.locator('aside, div').getByText(/energia di Luna/).count()) > 0)
  } else if (WITH_AI) {
    check('AI: servizio non configurato → modalità non disponibile chiaramente mostrata', (await page.getByText('AI non disponibile').count()) > 0)
  }

  // ---------- lettura scontrino con AI (proposta da confermare) ----------
  if (status.configured && WITH_AI) {
    const rp = await ctx.newPage()
    await rp.setContent('<body style="font:28px monospace;padding:30px;background:#fff;width:520px"><h2>PET SHOP ROSSI</h2><p>Via Roma 12</p><p>Data: 15/11/2026</p><hr><p>Crocchette adult 12kg ... 62,00</p><p>Giochino corda ........... 4,50</p><hr><h2>TOTALE EUR 66,50</h2></body>')
    const receiptPng = `${tmp}/dm-receipt.png`
    await rp.screenshot({ path: receiptPng })
    await rp.close()
    await page.goto(BASE + '/impostazioni')
    await page.getByRole('button', { name: 'Esci dalla demo' }).first().click().catch(() => {})
    await page.goto(BASE + '/spese')
    const before = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('dm-local'); r.onsuccess = () => { const q = r.result.transaction('expenses').objectStore('expenses').getAll(); q.onsuccess = () => res(q.result.length) } }))
    await page.setInputFiles('input[aria-label="Leggi scontrino da foto"]', receiptPng)
    const proposed = await until(async () => (await page.getByRole('dialog').count()) > 0, 90000)
    check('Scontrino: l AI propone i dati in un modulo da confermare', proposed)
    if (proposed) {
      const amount = await page.locator('#f-amount_eur').inputValue()
      check('Scontrino: importo letto correttamente (66,50)', Math.abs(Number(amount) - 66.5) < 0.01, 'letto: ' + amount)
      const afterOpen = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('dm-local'); r.onsuccess = () => { const q = r.result.transaction('expenses').objectStore('expenses').getAll(); q.onsuccess = () => res(q.result.length) } }))
      check('Scontrino: nulla salvato prima della conferma', afterOpen === before)
      await shot(page, '06b-scontrino')
      await save()
      check('Scontrino: salvato solo dopo conferma', await until(async () => (await page.getByText('66,50').count()) > 0))
    }
  }

  // ---------- responsive ----------
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(BASE + '/')
  check('Mobile: menu inferiore visibile, sidebar nascosta', (await page.getByRole('navigation', { name: 'Navigazione principale' }).isVisible()) && !(await page.locator('aside').isVisible()))
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  check('Mobile: nessuno scroll orizzontale (dashboard)', !overflow)
  await shot(page, '07-mobile')
  for (const p of ['/spese', '/agenda', '/salute', '/archivio', '/ai', '/impostazioni']) {
    await page.goto(BASE + p)
    await page.waitForTimeout(300)
    const o = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    if (o) check(`Mobile: scroll orizzontale su ${p}`, false)
  }
  await page.setViewportSize({ width: 820, height: 1100 })
  await page.goto(BASE + '/spese')
  await shot(page, '08-tablet-spese')

  // ---------- tema ----------
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(BASE + '/')
  await page.getByRole('button', { name: /Tema scuro/ }).click()
  check('Tema scuro applicato', await page.evaluate(() => document.documentElement.classList.contains('dark')))
  await shot(page, '09-dark')

  // ---------- uscita demo: i dati reali sono intatti ----------
  await page.goto(BASE + '/impostazioni')
  await page.getByRole('button', { name: 'Esci dalla demo' }).first().click({ timeout: 3000 }).catch(() => {})
  await page.goto(BASE + '/')
  await page.getByRole('heading', { name: 'Bella' }).waitFor()
  check('Uscita dalla demo: dati reali separati e intatti', (await page.getByText('Luna (ESEMPIO)').count()) === 0 && (await page.getByText('29,4 kg').count()) > 0)

  // ---------- PWA / offline ----------
  const reg = await page.evaluate(async () => { const r = await navigator.serviceWorker?.getRegistration(); return !!r })
  check('Service worker registrato', await until(async () => await page.evaluate(async () => !!(await navigator.serviceWorker?.getRegistration()))), String(reg))
  const manifest = await page.evaluate(() => fetch('/manifest.webmanifest').then((r) => r.json()))
  check('Manifest valido (nome, icone, standalone)', manifest.name === 'DOG MANAGER' && manifest.display === 'standalone' && manifest.icons.length >= 3)
  await page.waitForTimeout(1500)
  await page.reload() // assicura che il SW controlli la pagina
  await page.waitForTimeout(1000)
  await ctx.setOffline(true)
  await page.reload()
  await page.getByRole('heading', { name: 'Bella' }).waitFor({ timeout: 8000 }).catch(() => {})
  check('Offline: app si apre dalla cache e mostra i dati', (await page.getByRole('heading', { name: 'Bella' }).count()) > 0)
  await quick('Registra peso').click()
  await page.locator('#f-weight_kg').fill('29.8')
  await save()
  check('Offline: registrazione salvata localmente', await until(async () => (await page.getByText('Salvato', { exact: true }).count()) > 0))
  await page.reload()
  await page.getByRole('heading', { name: 'Bella' }).waitFor({ timeout: 8000 })
  const saved = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('dm-local'); r.onsuccess = () => { const q = r.result.transaction('weights').objectStore('weights').getAll(); q.onsuccess = () => res(q.result.map((w) => w.weight_kg)) } }))
  check('Offline: la pesata offline è nel database locale dopo il riavvio', saved.includes(29.8), JSON.stringify(saved))
  await ctx.setOffline(false)

  const real = errors.filter((e) => !/favicon|Failed to load resource.*(404|503)|ERR_INTERNET_DISCONNECTED|net::ERR/i.test(e))
  check('Nessun errore JavaScript in console', real.length === 0, real.slice(0, 3).join(' | '))
} catch (e) {
  failed++
  console.log('FAIL  eccezione:', e.message.split('\n')[0])
  await shot(page, 'errore')
} finally {
  await browser.close()
}
console.log(failed ? `\n${failed} CONTROLLI FALLITI` : '\nTUTTI I CONTROLLI SUPERATI')
process.exit(failed ? 1 : 0)
