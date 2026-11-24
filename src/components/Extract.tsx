import { useEffect, useRef, useState } from 'react'
import { ScanLine } from 'lucide-react'
import { aiStatus, extractFromFile, type AiStatus, type ExtractKind } from '../lib/ai'
import { TABLES, type Row } from '../lib/schema'
import { Button, useUi } from './ui'
import { ResourceDialog } from './Resource'

/** Estrae dati da una foto con l'AI e li propone in un modulo da verificare: nulla viene salvato senza conferma. */
export function ExtractButton({ kind, table, label, onProposal, accept = 'image/*,application/pdf' }: { kind: ExtractKind; table: string; label: string; onProposal?: (fields: Record<string, any>, file: File) => void; accept?: string }) {
  const { toast } = useUi()
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [proposal, setProposal] = useState<Record<string, any> | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void aiStatus().then(setStatus)
  }, [])

  async function onFile(file: File) {
    setBusy(true)
    try {
      const fields = await extractFromFile(kind, file)
      const def = TABLES[table]
      const clean: Record<string, any> = {}
      for (const f of def.fields) {
        const v = fields[f.key]
        if (v === null || v === undefined || v === '') continue
        if (f.type === 'number' && !Number.isFinite(Number(v))) continue
        if (f.type === 'select' && !f.options?.some((o) => o.value === String(v))) continue
        if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) continue
        clean[f.key] = v
      }
      if (onProposal) onProposal(clean, file)
      else setProposal(clean)
      toast('Dati proposti dall’AI: controllali prima di salvare')
    } catch (e: any) {
      toast(e?.message ?? 'Lettura non riuscita', 'err')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const unavailable = status && !status.configured
  return (
    <>
      <input ref={input} type="file" accept={accept} capture={undefined} className="sr-only" aria-label={label} onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
      <Button variant="soft" disabled={busy || !status || !!unavailable} onClick={() => input.current?.click()} title={unavailable ? `Non disponibile: ${status?.reason}` : 'Legge la foto con l’AI e propone i dati da confermare'}>
        <ScanLine size={16} /> {busy ? 'Leggo…' : label}
      </Button>
      {unavailable && <span className="text-xs text-muted">AI non disponibile: {status?.reason}</span>}
      {proposal && <ResourceDialog table={table} defaults={proposal} onClose={() => setProposal(null)} />}
    </>
  )
}

export type { Row }
