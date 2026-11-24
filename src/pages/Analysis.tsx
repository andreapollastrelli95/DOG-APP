import { useState } from 'react'
import { FileText, Info } from 'lucide-react'
import { useApp, useTables } from '../lib/app'
import { analyze, type Finding } from '../lib/analysis'
import { buildReport, periodRange, type Period } from '../lib/reports'
import { buildPdf } from '../lib/pdf'
import { Badge, Button, Card, Empty, useUi } from '../components/ui'
import { ALL_TABLES } from '../lib/ai'

function FindingCard({ f }: { f: Finding }) {
  return (
    <Card className={f.level === 'attenzione' ? 'border-warn/40' : ''}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{f.title}</h3>
        <Badge tone={f.level === 'attenzione' ? 'warn' : 'neutral'}>{f.level === 'attenzione' ? 'Da osservare' : 'Informazione'}</Badge>
        <Badge tone={f.reliability === 'alta' ? 'good' : f.reliability === 'media' ? 'gold' : 'neutral'}>Affidabilità {f.reliability}</Badge>
      </div>
      <dl className="space-y-1.5 text-sm">
        <div>
          <dt className="inline font-medium">1. Cosa è cambiato: </dt>
          <dd className="inline">{f.changed}</dd>
        </div>
        <div>
          <dt className="inline font-medium">2. Rispetto a: </dt>
          <dd className="inline">{f.versus}</dd>
        </div>
        <div>
          <dt className="inline font-medium">3. Affidabilità: </dt>
          <dd className="inline">{f.reliabilityNote}</dd>
        </div>
        <div>
          <dt className="inline font-medium">4. Informazioni mancanti: </dt>
          <dd className="inline">{f.missing.join(' ')}</dd>
        </div>
        <div>
          <dt className="inline font-medium">5. Approfondimento: </dt>
          <dd className="inline">{f.suggestion}</dd>
        </div>
      </dl>
    </Card>
  )
}

export default function Analysis() {
  const { store } = useApp()
  const { toast } = useUi()
  const { data, loading } = useTables(ALL_TABLES)
  const [period, setPeriod] = useState<Period>('settimanale')
  if (loading) return <p className="text-muted">Caricamento…</p>
  const findings = analyze(data)
  const report = buildReport(period, data)

  async function pdf() {
    const dog = await store.dog()
    buildPdf(report.title, dog?.name ?? 'Cagnolina', report.sections).save(`report-${period}.pdf`)
    toast('PDF generato')
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl">Analisi e report</h1>
        <p className="mt-1 flex max-w-2xl gap-2 text-sm text-muted">
          <Info size={16} className="mt-0.5 shrink-0" />
          Confrontiamo gli ultimi 7 giorni con la baseline personale (28 giorni precedenti) usando solo i dati registrati da voi. Sono osservazioni, non diagnosi: per qualsiasi dubbio sentite il veterinario.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-medium">Segnalazioni attuali</h2>
        {findings.length ? findings.map((f) => <FindingCard key={f.id} f={f} />) : <Empty>Nessuna variazione significativa. Più dati registrate (peso, benessere, attività), più l'analisi è affidabile.</Empty>}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Report</h2>
          <div className="flex gap-2">
            <div className="inline-flex gap-1 rounded-xl bg-surface2 p-1 text-sm" role="tablist">
              {(['settimanale', 'mensile', 'annuale'] as Period[]).map((p) => (
                <button key={p} role="tab" aria-selected={period === p} onClick={() => setPeriod(p)} className={'min-h-9 rounded-lg px-3 capitalize ' + (period === p ? 'bg-surface font-medium shadow-sm' : 'text-muted')}>
                  {p}
                </button>
              ))}
            </div>
            <Button onClick={() => void pdf()}>
              <FileText size={16} /> PDF
            </Button>
          </div>
        </div>
        <Card>
          <h3 className="mb-3 font-display text-lg">{report.title}</h3>
          <div className="space-y-4 text-sm">
            {report.sections.map((s) => (
              <div key={s.heading}>
                <h4 className="mb-1 font-medium text-primary">{s.heading}</h4>
                {s.lines?.map((l, i) => (
                  <p key={i} className="whitespace-pre-wrap">
                    {l}
                  </p>
                ))}
                {s.table && (
                  <table className="w-full text-xs">
                    <tbody>
                      {s.table.rows.map((r, i) => (
                        <tr key={i} className="border-b border-line/60">
                          {r.map((c, j) => (
                            <td key={j} className="py-1 pr-2">
                              {c}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Periodo: {periodRange(period, new Date()).label}</p>
        </Card>
      </section>
    </div>
  )
}
