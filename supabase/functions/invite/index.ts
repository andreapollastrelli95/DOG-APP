// Edge Function "invite": un amministratore invita un familiare via email.
// Usa la service role SOLO qui (server). Verifica che il chiamante sia admin della famiglia.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: u } = await user.auth.getUser()
  if (!u.user) return json(401, { error: 'Non autenticato' })
  const { email, household_id } = await req.json().catch(() => ({}))
  if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email) || typeof household_id !== 'string') return json(400, { error: 'Dati non validi' })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: m } = await admin.from('household_members').select('role').eq('household_id', household_id).eq('user_id', u.user.id).maybeSingle()
  if (m?.role !== 'admin') return json(403, { error: 'Solo un amministratore può invitare' })

  const { error: ie } = await admin.from('household_invites').upsert({ household_id, email: email.toLowerCase(), invited_by: u.user.id }, { onConflict: 'household_id,email' })
  if (ie) return json(500, { error: ie.message })
  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: Deno.env.get('SITE_URL') ?? undefined })
  // utente già registrato: l'invito resta in attesa e verrà collegato al prossimo accesso senza famiglia
  if (error && !/already.*registered|exists/i.test(error.message)) return json(500, { error: error.message })
  return json(200, { ok: true, existing: Boolean(error) })
})
