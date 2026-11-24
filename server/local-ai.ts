// Server AI locale (solo per uso sul PC con `npm run dev` / `npm run preview`).
// La chiave Gemini viene letta dalla variabile d'ambiente del PC ed è usata SOLO qui, mai inviata al browser.
import type { Plugin } from 'vite'
import { AiError, makeGemini, routeQuestion, runAgents, extractFromFile, type ExtractKind } from '../supabase/functions/_shared/agents'

const hits = new Map<string, number[]>()
function limited(ip: string, max = 30): boolean {
  const now = Date.now()
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000)
  arr.push(now)
  hits.set(ip, arr)
  return arr.length > max
}

function readBody(req: any, limit = 8_000_000): Promise<any> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) {
        reject(new AiError('Richiesta troppo grande.', 'unknown'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        reject(new AiError('Richiesta non valida.', 'unknown'))
      }
    })
  })
}

function handler(env: Record<string, string | undefined>) {
  return async (req: any, res: any, next: () => void) => {
    const url: string = req.url ?? ''
    if (!url.startsWith('/api/ai/')) return next()
    const send = (status: number, body: unknown) => {
      res.statusCode = status
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(body))
    }
    const key = env.GEMINI_API_KEY
    const model = env.GEMINI_MODEL || 'gemini-3.1-flash-lite'
    const route = url.slice('/api/ai/'.length).split('?')[0]
    if (route === 'status') return send(200, { configured: Boolean(key), model: key ? model : null, provider: 'Google Gemini', where: 'server locale' })
    if (req.method !== 'POST') return send(405, { error: 'Metodo non consentito' })
    if (!key) return send(503, { error: 'Servizio AI non configurato: manca la chiave GEMINI_API_KEY sul server.', code: 'not_configured' })
    if (limited(req.socket?.remoteAddress ?? 'x')) return send(429, { error: 'Troppe richieste: attendi un minuto.', code: 'rate_limit' })
    try {
      const body = await readBody(req)
      const gemini = makeGemini(key, model)
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
      if (route === 'route') {
        if (typeof body.question !== 'string' || !body.question.trim() || body.question.length > 2000) return send(400, { error: 'Domanda non valida' })
        return send(200, await routeQuestion(gemini, body.question, today))
      }
      if (route === 'answer') {
        if (typeof body.question !== 'string' || !body.question.trim() || body.question.length > 2000) return send(400, { error: 'Domanda non valida' })
        const r = await runAgents(gemini, { question: body.question, history: Array.isArray(body.history) ? body.history : [], route: body.route, data: body.data ?? {}, today })
        return send(200, r)
      }
      if (route === 'extract') {
        const kinds: ExtractKind[] = ['food_label', 'receipt', 'document']
        if (!kinds.includes(body.kind) || typeof body.data !== 'string' || !/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(body.mime)) return send(400, { error: 'File non supportato (usa JPG, PNG, WEBP o PDF).' })
        return send(200, { fields: await extractFromFile(gemini, body.kind, body.mime, body.data) })
      }
      return send(404, { error: 'Percorso sconosciuto' })
    } catch (e: any) {
      if (e instanceof AiError) return send(e.code === 'rate_limit' ? 429 : e.code === 'auth' ? 502 : 502, { error: e.message, code: e.code })
      return send(500, { error: 'Errore interno del server AI.' })
    }
  }
}

export function localAi(env: Record<string, string | undefined>): Plugin {
  return {
    name: 'dog-manager-local-ai',
    configureServer(s) {
      s.middlewares.use(handler(env))
    },
    configurePreviewServer(s) {
      s.middlewares.use(handler(env))
    },
  }
}
