// Verifica reale del backend Supabase (richiede .env.local con SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF).
// Crea due utenti di prova, li usa, poi li elimina. Non stampa mai chiavi.
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')), l.slice(l.indexOf('=')+1).trim()]))
const ref = env.SUPABASE_PROJECT_REF, url = `https://${ref}.supabase.co`
const mg = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, { headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`} })).json()
const svc = mg.find(k=>k.name==='service_role').api_key, anon = env.VITE_SUPABASE_ANON_KEY
let ok = 0, ko = 0
const check = (n, c, extra='') => { c ? ok++ : ko++; console.log(`${c?'OK ':'KO '} ${n}${c?'':' '+extra}`) }
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
const stamp = Date.now()
const users = []
async function mkUser(tag) {
  const email = `test-${tag}-${stamp}@example.com`, password = 'Prova!'+stamp
  const r = await fetch(`${url}/auth/v1/admin/users`, { method:'POST', headers:{apikey:svc,Authorization:`Bearer ${svc}`,'Content-Type':'application/json'}, body: JSON.stringify({ email, password, email_confirm:true }) })
  const u = await j(r)
  const l = await j(await fetch(`${url}/auth/v1/token?grant_type=password`, { method:'POST', headers:{apikey:anon,'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) }))
  const o = { id:u.id, email, token:l.access_token }; users.push(o); return o
}
const rest = (u, path, opt={}) => fetch(`${url}/rest/v1/${path}`, { ...opt, headers:{ apikey:anon, Authorization:`Bearer ${u.token}`, 'Content-Type':'application/json', Prefer:'return=representation', ...(opt.headers||{}) } })
try {
  const A = await mkUser('a'), B = await mkUser('b')
  check('utenti di prova creati e login riuscito', !!A.token && !!B.token)
  // famiglia
  const rh = await rest(A, 'rpc/create_household', { method:'POST', body: JSON.stringify({ p_name:'Famiglia prova' }) })
  const hh = await j(rh); console.log('  create_household ->', rh.status, JSON.stringify(hh).slice(0,160))
  check('create_household', rh.ok)
  const hid = typeof hh === 'string' ? hh : (hh?.id ?? hh?.[0]?.id ?? hh?.[0])
  // scrittura e lettura
  const wid = crypto.randomUUID()
  const rw = await rest(A, 'weights', { method:'POST', body: JSON.stringify({ id:wid, household_id:hid, date:'2026-11-24', weight_kg:30.5 }) })
  const w = await j(rw); console.log('  insert weight ->', rw.status, JSON.stringify(w).slice(0,200))
  check('A inserisce un peso', rw.ok)
  check('trigger: created_by impostato dal server', rw.ok && w[0]?.created_by === A.id)
  const rA = await j(await rest(A, 'weights?select=id'))
  check('A rilegge il proprio peso', Array.isArray(rA) && rA.length === 1)
  // isolamento RLS
  const rB = await j(await rest(B, 'weights?select=id'))
  check('RLS: B (estraneo) non vede i dati di A', Array.isArray(rB) && rB.length === 0, JSON.stringify(rB))
  const rBw = await rest(B, 'weights', { method:'POST', body: JSON.stringify({ id:crypto.randomUUID(), household_id:hid, date:'2026-11-24', weight_kg:99 }) })
  check('RLS: B non può scrivere nella famiglia di A', !rBw.ok, String(rBw.status))
  const rBd = await rest(B, `weights?id=eq.${wid}`, { method:'DELETE' }); const del = await j(rBd)
  check('RLS: B non può cancellare i dati di A', Array.isArray(del) ? del.length === 0 : !rBd.ok)
  // audit
  const au = await j(await rest(A, 'audit_logs?select=*'))
  check('audit log scritto dal trigger', Array.isArray(au) && au.length >= 1, JSON.stringify(au).slice(0,100))
  const auW = await rest(A, 'audit_logs', { method:'POST', body: JSON.stringify({ household_id:hid, table_name:'x', action:'insert' }) })
  check('audit log non falsificabile dal client', !auW.ok, String(auW.status))
  // anonimo
  const an = await j(await fetch(`${url}/rest/v1/weights?select=id`, { headers:{apikey:anon} }))
  check('anonimo non vede nulla', Array.isArray(an) ? an.length === 0 : true)
  // invito (membro: solo admin può)
  const inv = await fetch(`${url}/functions/v1/invite`, { method:'POST', headers:{apikey:anon,Authorization:`Bearer ${B.token}`,'Content-Type':'application/json'}, body: JSON.stringify({ household_id:hid, email:'x@example.com' }) })
  check('invite: un estraneo viene rifiutato', inv.status >= 400, String(inv.status))
  // AI
  const st = await fetch(`${url}/functions/v1/ai-chat`, { method:'POST', headers:{apikey:anon,Authorization:`Bearer ${A.token}`,'Content-Type':'application/json'}, body: JSON.stringify({ action:'status' }) })
  const stj = await j(st); console.log('  ai status ->', st.status, JSON.stringify(stj).slice(0,200))
  check('ai-chat raggiungibile e AI configurata', st.ok && (stj.configured === true || stj.available === true || stj.ok === true))
  const noauth = await fetch(`${url}/functions/v1/ai-chat`, { method:'POST', headers:{apikey:anon,'Content-Type':'application/json'}, body: JSON.stringify({ action:'status' }) })
  check('ai-chat senza login rifiutata', noauth.status === 401 || noauth.status === 403, String(noauth.status))
} finally {
  for (const u of users) if (u.id) {
    await fetch(`${url}/rest/v1/rpc/delete_my_account`, { method:'POST', headers:{apikey:anon,Authorization:`Bearer ${u.token}`,'Content-Type':'application/json'}, body:'{}' }).catch(()=>{})
    await fetch(`${url}/auth/v1/admin/users/${u.id}`, { method:'DELETE', headers:{apikey:svc,Authorization:`Bearer ${svc}`} }).catch(()=>{})
  }
}
console.log(`\n${ok} ok, ${ko} falliti`); process.exit(ko ? 1 : 0)
