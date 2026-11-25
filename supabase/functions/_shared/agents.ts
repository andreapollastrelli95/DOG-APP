// Logica AI condivisa tra la Edge Function Supabase (Deno) e il server locale (Node). Solo fetch standard.
// La chiave Gemini arriva SEMPRE dal chiamante lato server: non esiste in nessun file del frontend.

export type AgentId = 'veterinary' | 'nutrition' | 'behavior' | 'wellness' | 'economist' | 'organizer'

export interface AgentDef {
  id: AgentId
  name: string
  role: string
  tables: string[]
  instructions: string
}

export const AGENTS: Record<AgentId, AgentDef> = {
  veterinary: {
    id: 'veterinary',
    name: 'Veterinary Information',
    role: 'Informazioni veterinarie generali e organizzazione dello storico clinico',
    tables: ['dogs', 'health_records', 'weights', 'appointments'],
    instructions:
      'Spiega informazioni veterinarie di carattere generale in modo comprensibile, aiuta a preparare domande per il veterinario, organizza lo storico clinico, evidenzia informazioni mancanti (es. date di richiamo assenti). Segnala sempre quando è opportuno rivolgersi a un professionista. NON formulare diagnosi, NON indicare dosaggi o terapie: rimanda al veterinario.',
  },
  nutrition: {
    id: 'nutrition',
    name: 'Nutrition Analyst',
    role: 'Alimentazione, consumi, scorte e costi del cibo',
    tables: ['dogs', 'food_products', 'meals', 'weights', 'expenses'],
    instructions:
      'Analizza alimenti registrati, quantità e consumi rispetto al peso, cambiamenti nelle abitudini alimentari, scorte e costi. Prepara riepiloghi nutrizionali. NON prescrivere diete né quantità: per variazioni di dieta rimanda al veterinario.',
  },
  behavior: {
    id: 'behavior',
    name: 'Behavior Analyst',
    role: 'Diario comportamentale, attività e riposo',
    tables: ['dogs', 'behavior_logs', 'activities'],
    instructions: 'Analizza il diario comportamentale, cerca cambiamenti rispetto alle abitudini, analizza attività e riposo, suggerisci attività generali. Non attribuire cause cliniche ai comportamenti.',
  },
  wellness: {
    id: 'wellness',
    name: 'Wellness Analyst',
    role: 'Benessere complessivo e variazioni rispetto alla baseline personale',
    tables: ['dogs', 'weights', 'activities', 'behavior_logs', 'meals'],
    instructions:
      'Analizza peso, attività, appetito e riposo. Individua variazioni rispetto alla baseline personale (confronta ultimi 7 giorni con i 28 precedenti), tendenze e dati anomali. Indica sempre il numero di dati su cui si basa l\'osservazione. Non presentare correlazioni come diagnosi, non attribuire probabilità cliniche.',
  },
  economist: {
    id: 'economist',
    name: 'Family Economist',
    role: 'Spese, ricorrenze, budget e previsioni',
    tables: ['expenses', 'budgets', 'food_products'],
    instructions:
      'Analizza le spese, identifica costi ricorrenti e acquisti ridondanti, prepara previsioni di budget e possibili ottimizzazioni. Non suggerire mai di ridurre cure veterinarie, farmaci o prevenzione necessari.',
  },
  organizer: {
    id: 'organizer',
    name: 'Family Organizer',
    role: 'Appuntamenti, scadenze e attività da completare',
    tables: ['appointments', 'health_records', 'food_products'],
    instructions: 'Organizza appuntamenti e scadenze, evidenzia attività non completate o scadute, prepara riepiloghi settimanali.',
  },
}

export const ALL_TABLES = ['dogs', 'weights', 'health_records', 'food_products', 'meals', 'activities', 'behavior_logs', 'expenses', 'budgets', 'appointments']

const COMMON_RULES = `Regole inderogabili:
- Rispondi in italiano, con tono chiaro e rassicurante ma onesto.
- Usa SOLO i dati forniti. Se un dato manca, dillo: non inventare valori, date o diagnosi.
- Non sei un veterinario: nessuna diagnosi, nessuna terapia, nessun dosaggio, nessuna probabilità clinica. Per sintomi preoccupanti rimanda al veterinario (urgenza: clinica H24).
- Distingui sempre: DATI VERIFICATI (presenti nei dati, con date/numeri), IPOTESI (interpretazioni possibili, dichiarate come tali) e SUGGERIMENTI (azioni pratiche).
- Data odierna: {{TODAY}} (fuso Europe/Rome).`

export interface GeminiClient {
  (req: { system: string; parts: any[]; json?: boolean; temperature?: number }): Promise<string>
}

export class AiError extends Error {
  constructor(
    message: string,
    public code: 'not_configured' | 'rate_limit' | 'auth' | 'bad_model' | 'network' | 'blocked' | 'unknown',
  ) {
    super(message)
  }
}

export function makeGemini(apiKey: string, model: string): GeminiClient {
  const once = makeGeminiOnce(apiKey, model)
  // un solo nuovo tentativo per errori transitori (5xx, timeout, rete); mai per limiti d'uso o chiave non valida
  return async (req) => {
    try {
      return await once(req)
    } catch (e) {
      if (e instanceof AiError && (e.code === 'unknown' || e.code === 'network')) {
        await new Promise((r) => setTimeout(r, 1500))
        return once(req)
      }
      throw e
    }
  }
}

function makeGeminiOnce(apiKey: string, model: string): GeminiClient {
  return async ({ system, parts, json, temperature }) => {
    let res: Response
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        signal: AbortSignal.timeout(45_000), // una richiesta appesa non deve bloccare l'app
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: temperature ?? 0.3, ...(json ? { responseMimeType: 'application/json' } : {}) },
        }),
      })
    } catch (e: any) {
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw new AiError('Il servizio AI non ha risposto in tempo. Riprova tra poco.', 'network')
      throw new AiError('Servizio AI non raggiungibile (rete).', 'network')
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      if (res.status === 429) throw new AiError('Limite di utilizzo del servizio AI raggiunto. Riprova tra qualche minuto.', 'rate_limit')
      if (res.status === 401 || res.status === 403 || /API key/i.test(body)) throw new AiError('La chiave API AI non è valida o non è autorizzata.', 'auth')
      if (res.status === 404) throw new AiError(`Modello AI "${model}" non disponibile per questa chiave.`, 'bad_model')
      throw new AiError(`Errore del servizio AI (${res.status}).`, 'unknown')
    }
    const data: any = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? ''
    if (!text) throw new AiError('Il servizio AI non ha prodotto una risposta (contenuto bloccato o vuoto).', 'blocked')
    return text
  }
}

export interface RouteResult {
  agents: AgentId[]
  rationale: string
}

/** Passo 1 del coordinatore: capisce la richiesta e sceglie gli specialisti (max 2). */
export async function routeQuestion(gemini: GeminiClient, question: string, today: string): Promise<RouteResult> {
  const list = Object.values(AGENTS)
    .map((a) => `- ${a.id}: ${a.role}`)
    .join('\n')
  const out = await gemini({
    system: `Sei il coordinatore di LILLA APP AI. Scegli quali specialisti servono per rispondere alla richiesta (da 1 a 2). Specialisti:\n${list}\nRispondi SOLO con JSON: {"agents": ["id", ...], "rationale": "una frase"}. Se la richiesta è generica sulla salute complessiva usa "wellness". Data: ${today}.`,
    parts: [{ text: question }],
    json: true,
    temperature: 0,
  })
  const j = safeJson(out)
  const ids = (Array.isArray(j?.agents) ? j.agents : []).filter((x: string) => x in AGENTS).slice(0, 2) as AgentId[]
  return { agents: ids.length ? ids : ['wellness'], rationale: String(j?.rationale ?? '') }
}

export function tablesFor(agents: AgentId[]): string[] {
  return [...new Set(agents.flatMap((a) => AGENTS[a].tables))]
}

const DROP = new Set(['household_id', 'created_by', 'photo_data', 'updated_at'])

/** Riduce i dati a ciò che serve: ultime righe per tabella, senza campi inutili, con tetto di dimensione. */
export function compactData(data: Record<string, any[]>, maxRows = 80, maxChars = 24000): string {
  const out: Record<string, any[]> = {}
  for (const [t, rows] of Object.entries(data)) {
    const dateKey = ['date', 'at', 'starts_at', 'purchase_date', 'created_at'].find((k) => rows[0] && k in rows[0]) ?? 'created_at'
    out[t] = [...rows]
      .sort((a, b) => String(b[dateKey] ?? '').localeCompare(String(a[dateKey] ?? '')))
      .slice(0, maxRows)
      .map((r) => Object.fromEntries(Object.entries(r).filter(([k, v]) => !DROP.has(k) && v !== null && v !== '' && k !== 'id')))
  }
  let s = JSON.stringify(out)
  let rows = maxRows
  while (s.length > maxChars && rows > 10) {
    rows = Math.floor(rows * 0.7)
    for (const t of Object.keys(out)) out[t] = out[t].slice(0, rows)
    s = JSON.stringify(out)
  }
  return s
}

export interface FinalAnswer {
  summary: string
  verified: string[]
  hypotheses: string[]
  suggestions: string[]
  see_vet: string | null
  missing_data: string[]
}

export interface AskResult {
  answer: FinalAnswer
  agents: { id: AgentId; name: string }[]
  rationale: string
  tables: string[]
}

/** Passi 2-3: gli specialisti analizzano i dati autorizzati, il coordinatore produce la risposta unica. */
export async function runAgents(gemini: GeminiClient, args: { question: string; history: { role: 'user' | 'assistant'; text: string }[]; route: RouteResult; data: Record<string, any[]>; today: string }): Promise<AskResult> {
  const { question, history, route, data, today } = args
  const dataJson = compactData(data)
  const hist = history
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'Utente' : 'Assistente'}: ${m.text.slice(0, 600)}`)
    .join('\n')
  const rules = COMMON_RULES.replace('{{TODAY}}', today)

  const notes = await Promise.all(
    route.agents.map(async (id) => {
      const a = AGENTS[id]
      const text = await gemini({
        system: `Sei "${a.name}", specialista di LILLA APP AI. ${a.instructions}\n${rules}\nProduci note di analisi concise (max 250 parole) con tre blocchi: DATI VERIFICATI, IPOTESI, SUGGERIMENTI.`,
        parts: [{ text: `Conversazione recente:\n${hist || '(nessuna)'}\n\nRichiesta: ${question}\n\nDati autorizzati (JSON):\n${dataJson}` }],
      })
      return `### ${a.name}\n${text}`
    }),
  )

  const final = await gemini({
    system: `Sei il coordinatore di LILLA APP AI. Unisci le note degli specialisti in UNA risposta per la famiglia.\n${rules}\nRispondi SOLO con JSON con queste chiavi: {"summary": string (2-4 frasi), "verified": string[] (fatti presenti nei dati, con numeri/date), "hypotheses": string[] (interpretazioni possibili, formulate come ipotesi), "suggestions": string[] (azioni pratiche), "see_vet": string|null (quando rivolgersi al veterinario, se pertinente), "missing_data": string[] (dati che servirebbero)}. Usa array vuoti se non pertinenti.`,
    parts: [{ text: `Richiesta: ${question}\n\nNote degli specialisti:\n${notes.join('\n\n')}` }],
    json: true,
    temperature: 0.2,
  })
  const j = safeJson(final)
  const arr = (x: any) => (Array.isArray(x) ? x.map(String) : [])
  const answer: FinalAnswer = j
    ? { summary: String(j.summary ?? ''), verified: arr(j.verified), hypotheses: arr(j.hypotheses), suggestions: arr(j.suggestions), see_vet: j.see_vet ? String(j.see_vet) : null, missing_data: arr(j.missing_data) }
    : { summary: final.slice(0, 1500), verified: [], hypotheses: [], suggestions: [], see_vet: null, missing_data: [] }
  return { answer, agents: route.agents.map((id) => ({ id, name: AGENTS[id].name })), rationale: route.rationale, tables: tablesFor(route.agents) }
}

export type ExtractKind = 'food_label' | 'receipt' | 'document'

const EXTRACT: Record<ExtractKind, { prompt: string; fields: string }> = {
  food_label: {
    prompt: 'Leggi l\'etichetta di una confezione di alimento per cani.',
    fields: '{"brand": string|null, "name": string|null, "type": "secco"|"umido"|"snack"|"integratore"|"altro"|null, "notes": string|null (ingredienti/analisi principali leggibili), "daily_grams": number|null (SOLO se riportato esplicitamente)}',
  },
  receipt: {
    prompt: 'Leggi uno scontrino o una fattura relativa a spese per un cane.',
    fields: '{"date": "YYYY-MM-DD"|null, "description": string|null (negozio/voce principale), "amount_eur": number|null (totale), "category": "alimentazione"|"veterinario"|"farmaci"|"antiparassitari"|"toelettatura"|"accessori"|"giochi"|"pensione_dogsitter"|"assicurazione"|"altro"|null}',
  },
  document: {
    prompt: 'Leggi un documento (referto, certificato, vaccinazione) relativo a un cane.',
    fields: '{"title": string|null, "date": "YYYY-MM-DD"|null, "vet_name": string|null, "summary": string|null (max 3 frasi, solo ciò che è scritto), "next_due_date": "YYYY-MM-DD"|null}',
  },
}

/** Estrazione da immagine/PDF: restituisce SOLO proposte da confermare, mai dati certi. */
export async function extractFromFile(gemini: GeminiClient, kind: ExtractKind, mime: string, base64: string): Promise<Record<string, any>> {
  const e = EXTRACT[kind]
  const out = await gemini({
    system: `${e.prompt} Estrai solo ciò che è realmente leggibile; se un campo non è leggibile usa null. Non indovinare e non inventare. Rispondi SOLO con JSON: ${e.fields}`,
    parts: [{ inlineData: { mimeType: mime, data: base64 } }, { text: 'Estrai i dati.' }],
    json: true,
    temperature: 0,
  })
  const j = safeJson(out)
  if (!j || typeof j !== 'object') throw new AiError('Non sono riuscito a leggere il contenuto del file.', 'unknown')
  return j
}

function safeJson(s: string): any {
  try {
    return JSON.parse(s)
  } catch {
    const m = s.match(/\{[\s\S]*\}/)
    if (m) {
      try {
        return JSON.parse(m[0])
      } catch {
        /* ignora */
      }
    }
    return null
  }
}
