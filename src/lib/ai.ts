// Client AI. Nessuna chiave nel browser: le chiamate vanno al server (Edge Function in cloud, server locale in sviluppo).
import { supabase } from './supabase'
import { CLOUD_CONFIGURED } from './config'
import type { Store } from './store'
import type { AskResult, ExtractKind } from '../../supabase/functions/_shared/agents'
import { ALL_TABLES, tablesFor } from '../../supabase/functions/_shared/agents'

export type { AskResult, ExtractKind }
export { ALL_TABLES }

export interface AiStatus {
  configured: boolean
  model: string | null
  where?: string
  reason?: string
}

export class AiClientError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message)
  }
}

async function post(path: string, body: unknown): Promise<any> {
  let res: Response
  try {
    res = await fetch('/api/ai/' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(150_000) })
  } catch (e: any) {
    if (e?.name === 'TimeoutError') throw new AiClientError('Il servizio AI ci sta mettendo troppo. Riprova tra poco.', 'network')
    throw new AiClientError('Servizio AI non raggiungibile. Controlla la connessione.', 'network')
  }
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new AiClientError(j.error ?? `Errore ${res.status}`, j.code)
  return j
}

async function invoke(body: Record<string, any>): Promise<any> {
  if (!supabase) throw new AiClientError('Backend non configurato', 'not_configured')
  const { data, error } = await supabase.functions.invoke('ai-chat', { body })
  if (error) {
    let msg = error.message
    let code: string | undefined
    try {
      const j = await (error as any).context?.json?.()
      if (j?.error) msg = j.error
      code = j?.code
    } catch {
      /* risposta non JSON */
    }
    throw new AiClientError(msg, code)
  }
  if (data?.error) throw new AiClientError(data.error, data.code)
  return data
}

export async function aiStatus(): Promise<AiStatus> {
  try {
    if (CLOUD_CONFIGURED) {
      const d = await invoke({ action: 'status' })
      return { configured: !!d.configured, model: d.model ?? null, where: 'Supabase Edge Function', reason: d.configured ? undefined : 'Chiave GEMINI_API_KEY non impostata tra i segreti di Supabase.' }
    }
    const r = await fetch('/api/ai/status')
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return { configured: false, model: null, reason: 'Il server AI non è attivo (disponibile con “npm run dev/preview” oppure con Supabase).' }
    const d = await r.json()
    return { configured: !!d.configured, model: d.model, where: d.where, reason: d.configured ? undefined : 'Variabile GEMINI_API_KEY non impostata sul PC che esegue l’app.' }
  } catch (e: any) {
    return { configured: false, model: null, reason: 'Servizio AI non raggiungibile.' }
  }
}

export async function askAi(store: Store, question: string, history: { role: 'user' | 'assistant'; text: string }[], conversationId?: string): Promise<AskResult> {
  if (CLOUD_CONFIGURED && store.mode === 'cloud') return invoke({ action: 'ask', question, history, conversation_id: conversationId })
  // locale/demo: il coordinatore sceglie prima gli specialisti, poi inviamo SOLO le tabelle necessarie
  const route = await post('route', { question })
  const tables = tablesFor(route.agents)
  const data: Record<string, any[]> = {}
  for (const t of tables) data[t] = await store.list(t)
  return post('answer', { question, history, route, data })
}

export async function extractFromFile(kind: ExtractKind, file: File): Promise<Record<string, any>> {
  if (file.size > 6_000_000) throw new AiClientError('File troppo grande (massimo 6 MB).')
  const buf = new Uint8Array(await file.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  const data = btoa(bin)
  const body = { action: 'extract', kind, mime: file.type, data }
  const r = CLOUD_CONFIGURED ? await invoke(body) : await post('extract', body)
  return r.fields
}
