// Edge Function "ai-chat" (Deno). Azioni: status | ask | extract.
// - verifica il JWT dell'utente; i dati vengono letti con il token dell'utente, quindi valgono le policy RLS
// - la chiave GEMINI_API_KEY è un segreto di Supabase (`supabase secrets set GEMINI_API_KEY=...`), mai nel frontend
import { createClient } from 'npm:@supabase/supabase-js@2'
import { AiError, makeGemini, routeQuestion, runAgents, extractFromFile, tablesFor, type ExtractKind } from '../_shared/agents.ts'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const auth = req.headers.get('Authorization') ?? ''
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
  const { data: u, error: ue } = await sb.auth.getUser()
  if (ue || !u.user) return json(401, { error: 'Non autenticato', code: 'auth' })

  const key = Deno.env.get('GEMINI_API_KEY')
  const model = Deno.env.get('GEMINI_MODEL') || 'gemini-3.1-flash-lite'
  let body: any
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Richiesta non valida' })
  }
  if (body.action === 'status') return json(200, { configured: Boolean(key), model: key ? model : null })
  if (!key) return json(503, { error: 'Servizio AI non configurato: manca il segreto GEMINI_API_KEY.', code: 'not_configured' })

  // limiti di utilizzo per utente: 10/minuto e 150/giorno (conteggiati dai messaggi utente)
  const since = (ms: number) => new Date(Date.now() - ms).toISOString()
  const count = async (ms: number) => (await sb.from('ai_messages').select('id', { count: 'exact', head: true }).eq('created_by', u.user.id).eq('role', 'user').gte('created_at', since(ms))).count ?? 0
  if (body.action === 'ask') {
    if ((await count(60_000)) > 10) return json(429, { error: 'Troppe richieste: attendi un minuto.', code: 'rate_limit' })
    if ((await count(86_400_000)) > 150) return json(429, { error: 'Limite giornaliero di richieste raggiunto.', code: 'rate_limit' })
  }

  try {
    const gemini = makeGemini(key, model)
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
    if (body.action === 'ask') {
      const q = String(body.question ?? '').trim()
      if (!q || q.length > 2000) return json(400, { error: 'Domanda non valida' })
      const route = await routeQuestion(gemini, q, today)
      const data: Record<string, any[]> = {}
      for (const t of tablesFor(route.agents)) {
        const { data: rows, error } = await sb.from(t).select('*').limit(1500)
        if (error) throw new Error(error.message)
        data[t] = rows ?? []
      }
      const history = Array.isArray(body.history) ? body.history : []
      return json(200, await runAgents(gemini, { question: q, history, route, data, today }))
    }
    if (body.action === 'extract') {
      const kinds: ExtractKind[] = ['food_label', 'receipt', 'document']
      if (!kinds.includes(body.kind) || typeof body.data !== 'string' || body.data.length > 9_000_000 || !/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(body.mime)) return json(400, { error: 'File non supportato (JPG, PNG, WEBP o PDF, max 6 MB).' })
      return json(200, { fields: await extractFromFile(gemini, body.kind, body.mime, body.data) })
    }
    return json(400, { error: 'Azione sconosciuta' })
  } catch (e) {
    if (e instanceof AiError) return json(e.code === 'rate_limit' ? 429 : 502, { error: e.message, code: e.code })
    return json(500, { error: 'Errore interno del servizio AI.' })
  }
})
