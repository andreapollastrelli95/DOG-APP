import { useMemo, useState, type ReactNode } from 'react'
import { Download, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useApp, useTable } from '../lib/app'
import { TABLES, normalize, validate, type Field, type Row, type TableDef } from '../lib/schema'
import { fmtDate, fmtDateTime, num, eur, toCsv, download, toInputDateTime, todayInput } from '../lib/format'
import { Badge, Button, Card, Empty, Modal, cx, inputCls, useUi } from './ui'

function initialValues(def: TableDef, row?: Row, defaults?: Record<string, any>): Record<string, any> {
  const v: Record<string, any> = {}
  for (const f of def.fields) {
    const src = row ? row[f.key] : defaults?.[f.key] ?? f.default
    if (f.type === 'datetime') v[f.key] = src ? toInputDateTime(src) : row ? '' : toInputDateTime()
    else if (f.type === 'date') v[f.key] = src ?? (row ? '' : todayInput())
    else if (f.type === 'bool') v[f.key] = !!src
    else if (f.key === 'remind_before_min') v[f.key] = src === null || src === undefined ? '' : String(src)
    else v[f.key] = src ?? ''
  }
  return v
}

export function FieldInput({ f, value, onChange, error }: { f: Field; value: any; onChange: (v: any) => void; error?: string }) {
  const id = 'f-' + f.key
  const label = (
    <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">
      {f.label}
      {f.required && <span className="text-danger"> *</span>}
      {f.unit && <span> ({f.unit})</span>}
    </label>
  )
  let input: ReactNode
  if (f.type === 'textarea') input = <textarea id={id} rows={2} className={cx(inputCls, 'py-2')} value={value} onChange={(e) => onChange(e.target.value)} />
  else if (f.type === 'select')
    input = (
      <select id={id} className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {!f.required && !f.options?.some((o) => o.value === '') && <option value="">—</option>}
        {f.options!.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    )
  else if (f.type === 'bool')
    input = (
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input id={id} type="checkbox" className="size-5 accent-[var(--primary)]" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        {f.label}
      </label>
    )
  else if (f.type === 'rating')
    input = (
      <div className="flex gap-1.5" role="radiogroup" aria-label={f.label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            role="radio"
            aria-checked={Number(value) === n}
            onClick={() => onChange(Number(value) === n ? '' : n)}
            className={cx('size-11 rounded-xl border text-sm font-medium', Number(value) === n ? 'border-primary bg-primary text-primary-fg' : 'border-line bg-bg text-ink')}
          >
            {n}
          </button>
        ))}
      </div>
    )
  else
    input = (
      <input
        id={id}
        className={inputCls}
        type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'datetime' ? 'datetime-local' : 'text'}
        inputMode={f.type === 'number' ? 'decimal' : undefined}
        step={f.step}
        min={f.type === 'number' ? f.min : undefined}
        max={f.type === 'number' ? f.max : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  return (
    <div>
      {f.type !== 'bool' && label}
      {input}
      {f.help && !error && <p className="mt-1 text-xs text-muted">{f.help}</p>}
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export function ResourceDialog({ table, row, defaults, onClose, onSaved }: { table: string; row?: Row; defaults?: Record<string, any>; onClose: () => void; onSaved?: (r: Row) => void }) {
  const def = TABLES[table]
  const { store } = useApp()
  const { toast } = useUi()
  const [values, setValues] = useState(() => initialValues(def, row, defaults))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate(def, values)
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      const data = normalize(def, values)
      const saved = row ? await store.update(table, row.id, data) : await store.insert(table, data)
      toast(row ? 'Modifica salvata' : 'Salvato')
      onSaved?.(saved)
      onClose()
    } catch (err: any) {
      toast(err?.message ?? 'Salvataggio non riuscito', 'err')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`${row ? 'Modifica' : 'Nuova'} ${def.singular}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        {def.fields.map((f) => (
          <FieldInput key={f.key} f={f} value={values[f.key]} error={errors[f.key]} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
        ))}
        {row && (
          <p className="text-xs text-muted">
            Inserito da {store.authorName(row.created_by)} il {fmtDateTime(row.created_at)}
            {row.updated_at !== row.created_at && ` · ultima modifica ${fmtDateTime(row.updated_at)}`}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="soft" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Salvataggio…' : 'Salva'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export function cellValue(f: Field, r: Row): ReactNode {
  const v = r[f.key]
  if (v === null || v === undefined || v === '') return <span className="text-muted">—</span>
  if (f.type === 'date') return fmtDate(v)
  if (f.type === 'datetime') return fmtDateTime(v)
  if (f.type === 'bool') return v ? <Badge tone="gold">Sì</Badge> : <span className="text-muted">No</span>
  if (f.type === 'select') return f.options?.find((o) => o.value === String(v))?.label ?? String(v)
  if (f.type === 'rating') return <Badge tone={Number(v) >= 4 ? 'good' : Number(v) <= 2 ? 'warn' : 'neutral'}>{v}/5</Badge>
  if (f.type === 'number') return f.unit === '€' ? eur(v) : `${num(v, 2)}${f.unit ? ' ' + f.unit : ''}`
  return String(v)
}

export function csvValue(f: Field, r: Row): string | number {
  const v = r[f.key]
  if (v === null || v === undefined) return ''
  if (f.type === 'select') return f.options?.find((o) => o.value === String(v))?.label ?? String(v)
  if (f.type === 'bool') return v ? 'Sì' : 'No'
  if (f.type === 'date') return fmtDate(v)
  if (f.type === 'datetime') return fmtDateTime(v)
  return v
}

export function ResourcePage({
  table,
  title,
  intro,
  header,
  defaults,
  extraCell,
  rowFilter,
  emptyText,
  onRowClick,
}: {
  table: string
  title?: string
  intro?: ReactNode
  header?: (rows: Row[]) => ReactNode
  defaults?: Record<string, any>
  extraCell?: (r: Row) => ReactNode
  rowFilter?: { key: string; label: string }
  emptyText?: string
  onRowClick?: (r: Row) => void
}) {
  const def = TABLES[table]
  const { store } = useApp()
  const { toast, confirm } = useUi()
  const { rows, loading } = useTable(table)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState<Row | 'new' | null>(null)
  const cols = def.fields.filter((f) => f.column)
  const filterField = rowFilter ? def.fields.find((f) => f.key === rowFilter.key) : def.fields.find((f) => f.type === 'select' && f.column)

  const sorted = useMemo(() => [...rows].sort((a, b) => String(b[def.dateField] ?? b.created_at).localeCompare(String(a[def.dateField] ?? a.created_at))), [rows, def])
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return sorted.filter((r) => {
      if (filter && String(r[filterField!.key]) !== filter) return false
      if (!needle) return true
      return def.fields.some((f) => {
        const v = r[f.key]
        if (v === null || v === undefined) return false
        const shownText = f.type === 'select' ? (f.options?.find((o) => o.value === String(v))?.label ?? '') : String(v)
        return shownText.toLowerCase().includes(needle)
      })
    })
  }, [sorted, q, filter, def, filterField])

  async function del(r: Row) {
    if (!(await confirm(`Eliminare definitivamente questo elemento (${def.summary(r)})? L'operazione non si può annullare.`))) return
    try {
      await store.remove(table, r.id)
      toast('Eliminato')
    } catch (e: any) {
      toast(e?.message ?? 'Eliminazione non riuscita', 'err')
    }
  }

  function exportCsv() {
    download(`${table}.csv`, toCsv([...def.fields.map((f) => f.label), 'Inserito da', 'Creato il'], shown.map((r) => [...def.fields.map((f) => csvValue(f, r)), store.authorName(r.created_by), r.created_at])))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">{title ?? def.label}</h1>
          {intro && <p className="mt-1 max-w-2xl text-sm text-muted">{intro}</p>}
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus size={18} /> Aggiungi
        </Button>
      </div>

      {header?.(rows)}

      <Card className="p-3">
        <div className="mb-3 flex flex-wrap gap-2">
          <div className="relative min-w-40 flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input aria-label="Cerca" className={cx(inputCls, 'pl-9')} placeholder="Cerca…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {filterField?.options && (
            <select aria-label="Filtra" className={cx(inputCls, 'w-auto')} value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">{filterField.label}: tutti</option>
              {filterField.options
                .filter((o) => o.value !== '')
                .map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
            </select>
          )}
          <Button variant="soft" onClick={exportCsv} disabled={!shown.length} title="Esporta CSV">
            <Download size={16} /> CSV
          </Button>
        </div>

        {loading ? (
          <p className="p-6 text-center text-sm text-muted">Caricamento…</p>
        ) : !shown.length ? (
          <Empty>{rows.length ? 'Nessun risultato con questi filtri.' : (emptyText ?? `Nessun elemento. Premi “Aggiungi” per inserire la prima ${def.singular}.`)}</Empty>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    {cols.map((f) => (
                      <th key={f.key} className="px-2 py-2 font-medium">
                        {f.label}
                      </th>
                    ))}
                    {extraCell && <th className="px-2 py-2" />}
                    <th className="px-2 py-2 font-medium">Da</th>
                    <th className="w-24" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id} className={cx('border-b border-line/60 last:border-0 hover:bg-surface2/50', onRowClick && 'cursor-pointer')} onClick={() => onRowClick?.(r)}>
                      {cols.map((f) => (
                        <td key={f.key} className="max-w-64 truncate px-2 py-2.5">
                          {cellValue(f, r)}
                        </td>
                      ))}
                      {extraCell && <td className="px-2">{extraCell(r)}</td>}
                      <td className="px-2 text-xs text-muted">{store.authorName(r.created_by)}</td>
                      <td className="px-2 text-right">
                        <button aria-label="Modifica" className="rounded-lg p-2 hover:bg-surface2" onClick={(e) => (e.stopPropagation(), setEditing(r))}>
                          <Pencil size={16} />
                        </button>
                        <button aria-label="Elimina" className="rounded-lg p-2 text-danger hover:bg-danger/10" onClick={(e) => (e.stopPropagation(), void del(r))}>
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="space-y-2 md:hidden">
              {shown.map((r) => (
                <li key={r.id} className="rounded-xl border border-line bg-bg p-3" onClick={() => setEditing(r)}>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                    {cols.map((f) => (
                      <div key={f.key} className={cx(f.type === 'textarea' && 'col-span-2')}>
                        <div className="text-[11px] uppercase tracking-wide text-muted">{f.label}</div>
                        <div className="break-words">{cellValue(f, r)}</div>
                      </div>
                    ))}
                  </div>
                  {extraCell && <div className="mt-2">{extraCell(r)}</div>}
                  <div className="mt-2 flex items-center justify-between text-xs text-muted">
                    <span>{store.authorName(r.created_by)}</span>
                    <button aria-label="Elimina" className="rounded-lg p-2 text-danger" onClick={(e) => (e.stopPropagation(), void del(r))}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {editing && <ResourceDialog table={table} row={editing === 'new' ? undefined : editing} defaults={defaults} onClose={() => setEditing(null)} />}
    </div>
  )
}
