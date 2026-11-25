import { useEffect, useRef, useState } from 'react'
import { Bot, ShieldAlert, Send, Trash2, MessageSquare, Plus } from 'lucide-react'
import { useApp, useTable } from '../lib/app'
import { aiStatus, askAi, type AiStatus, type AskResult } from '../lib/ai'
import { Badge, Button, Card, Empty, inputCls, useUi } from '../components/ui'
import { fmtDateTime } from '../lib/format'
import type { Row } from '../lib/schema'

const SUGGESTED = ['Come sta andando il peso rispetto alle ultime settimane?', 'Prepara le domande da fare al veterinario alla prossima visita.', 'Ci sono cambiamenti nell’appetito o nell’energia da tenere d’occhio?', 'Quanto abbiamo speso nelle ultime settimane e quali spese si ripetono?', 'Cosa c’è da fare questa settimana?']

export default function AiChat() {
  const { store } = useApp()
  const { toast, confirm } = useUi()
  const { rows: convs } = useTable('ai_conversations')
  const { rows: msgs } = useTable('ai_messages')
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void aiStatus().then(setStatus)
  }, [])
  const sorted = [...convs].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  useEffect(() => {
    if (!active && sorted[0]) setActive(sorted[0].id)
  }, [sorted.length])
  const thread = msgs.filter((m) => m.conversation_id === active).sort((a, b) => a.created_at.localeCompare(b.created_at))
  useEffect(() => {
    end.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [thread.length, busy])

  async function send(q: string) {
    q = q.trim()
    if (!q || busy) return
    setBusy(true)
    setError('')
    setText('')
    try {
      let cid = active
      if (!cid) {
        const c = await store.insert('ai_conversations', { title: q.slice(0, 60) })
        cid = c.id
        setActive(cid)
      }
      const history = thread.slice(-6).map((m) => ({ role: m.role as 'user' | 'assistant', text: m.content as string }))
      await store.insert('ai_messages', { conversation_id: cid, role: 'user', content: q })
      let res: AskResult
      try {
        res = await askAi(store, q, history, cid)
      } catch (e: any) {
        setError(e?.message ?? 'Errore del servizio AI')
        return
      }
      await store.insert('ai_messages', { conversation_id: cid, role: 'assistant', content: res.answer.summary, result: res })
      await store.update('ai_conversations', cid, { title: sorted.find((c) => c.id === cid)?.title ?? q.slice(0, 60) })
    } catch (e: any) {
      toast(e?.message ?? 'Errore', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function removeConv(c: Row) {
    if (!(await confirm(`Eliminare la conversazione “${c.title}”?`))) return
    for (const m of msgs.filter((m) => m.conversation_id === c.id)) await store.remove('ai_messages', m.id)
    await store.remove('ai_conversations', c.id)
    if (active === c.id) setActive(null)
  }

  const unavailable = status && !status.configured

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
      <div className="space-y-2">
        <h1 className="font-display text-2xl">LILLA APP AI</h1>
        <Button variant="soft" className="w-full" onClick={() => setActive(null)}>
          <Plus size={16} /> Nuova conversazione
        </Button>
        <ul className="space-y-1">
          {sorted.map((c) => (
            <li key={c.id} className="flex items-center gap-1">
              <button onClick={() => setActive(c.id)} className={'flex min-h-10 flex-1 items-center gap-2 truncate rounded-xl px-3 text-left text-sm ' + (active === c.id ? 'bg-primary text-primary-fg' : 'hover:bg-surface2')}>
                <MessageSquare size={14} className="shrink-0" />
                <span className="truncate">{c.title}</span>
              </button>
              <button aria-label="Elimina conversazione" onClick={() => void removeConv(c)} className="rounded-lg p-2 text-muted hover:text-danger">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">Sei agenti specialistici (veterinaria, alimentazione, comportamento, benessere, economia, organizzazione) coordinati da un unico assistente.</p>
      </div>

      <div className="flex min-h-[60dvh] flex-col">
        {status && (
          <Card className={'mb-3 text-sm ' + (unavailable ? 'border-warn/40 bg-warn/5' : '')}>
            {unavailable ? (
              <>
                <strong className="text-warn">AI non disponibile.</strong> {status.reason} Il resto dell'app funziona normalmente; analisi e segnalazioni nella pagina “Analisi e report” non usano l'AI.
              </>
            ) : (
              <span className="text-muted">
                Provider: Google Gemini ({status.model}) · {status.where}. L'assistente non sostituisce il veterinario e non fa diagnosi.
              </span>
            )}
          </Card>
        )}
        <div className="flex-1 space-y-3">
          {!thread.length && !busy && (
            <Empty>
              <p className="mb-3">Chiedi qualcosa sulla tua cagnolina. Verranno usati solo i dati necessari alla domanda.</p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTED.map((s) => (
                  <button key={s} disabled={!!unavailable} onClick={() => void send(s)} className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs hover:bg-surface2 disabled:opacity-50">
                    {s}
                  </button>
                ))}
              </div>
            </Empty>
          )}
          {thread.map((m) => (m.role === 'user' ? <UserBubble key={m.id} text={m.content} /> : <AnswerCard key={m.id} res={m.result as AskResult} when={m.created_at} />))}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Bot size={16} className="animate-pulse" /> Gli specialisti stanno analizzando i dati…
            </div>
          )}
          {error && (
            <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
              {error}
            </div>
          )}
          <div ref={end} />
        </div>
        <form
          className="sticky bottom-20 mt-3 flex gap-2 rounded-2xl border border-line bg-surface p-2 md:bottom-2"
          onSubmit={(e) => {
            e.preventDefault()
            void send(text)
          }}
        >
          <input className={inputCls + ' border-0'} placeholder={unavailable ? 'AI non disponibile' : 'Scrivi la tua domanda…'} value={text} onChange={(e) => setText(e.target.value)} disabled={!!unavailable || busy} maxLength={2000} aria-label="Domanda" />
          <Button type="submit" disabled={!text.trim() || busy || !!unavailable} aria-label="Invia">
            <Send size={16} />
          </Button>
        </form>
      </div>
    </div>
  )
}

function UserBubble({ text }: { text: string }) {
  return <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-fg">{text}</div>
}

function AnswerCard({ res, when }: { res: AskResult; when: string }) {
  const a = res?.answer
  if (!a) return null
  const Section = ({ title, items, tone }: { title: string; items: string[]; tone: 'good' | 'gold' | 'neutral' }) =>
    items.length ? (
      <div>
        <Badge tone={tone}>{title}</Badge>
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">
          {items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </div>
    ) : null
  return (
    <Card className="max-w-[95%] space-y-3">
      <p className="text-sm">{a.summary}</p>
      <Section title="Dati verificati" items={a.verified} tone="good" />
      <Section title="Ipotesi (non diagnosi)" items={a.hypotheses} tone="gold" />
      <Section title="Suggerimenti" items={a.suggestions} tone="neutral" />
      <Section title="Dati che mancano" items={a.missing_data} tone="neutral" />
      {a.see_vet && (
        <div className="flex gap-2 rounded-xl bg-warn/10 p-3 text-sm text-warn">
          <ShieldAlert size={18} className="shrink-0" /> {a.see_vet}
        </div>
      )}
      <p className="text-[11px] text-muted">
        Specialisti: {res.agents.map((x) => x.name).join(', ')} · {fmtDateTime(when)}
      </p>
    </Card>
  )
}
