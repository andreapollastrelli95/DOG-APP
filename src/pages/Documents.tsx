import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download, File as FileIcon, FileUp, Search, Trash2 } from 'lucide-react'
import { useApp, useTable } from '../lib/app'
import { DOC_CATEGORIES, type Row } from '../lib/schema'
import { uuid } from '../lib/store'
import { supabase } from '../lib/supabase'
import { fmtDate, todayInput } from '../lib/format'
import { Badge, Button, Card, Empty, Modal, inputCls, useUi } from '../components/ui'
import { ExtractButton } from '../components/Extract'

const MAX = 25 * 1024 * 1024
const catLabel = (v: string) => DOC_CATEGORIES.find((c) => c.value === v)?.label ?? v

function useDocUrl(store: ReturnType<typeof useApp>['store'], doc: Row | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let revoke: string | null = null
    let alive = true
    setUrl(null)
    if (!doc) return
    ;(async () => {
      if (store.mode === 'cloud' && supabase) {
        const { data } = await supabase.storage.from('documents').createSignedUrl(doc.storage_path, 300)
        if (alive) setUrl(data?.signedUrl ?? null)
      } else {
        const b = await store.getBlob(doc.id)
        if (b && alive) {
          revoke = URL.createObjectURL(b)
          setUrl(revoke)
        }
      }
    })().catch(() => undefined)
    return () => {
      alive = false
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [store, doc?.id])
  return url
}

function Preview({ doc }: { doc: Row }) {
  const { store } = useApp()
  const url = useDocUrl(store, doc)
  if (!url) return <div className="grid h-40 place-items-center text-sm text-muted">{store.mode === 'cloud' ? 'Anteprima disponibile online' : 'Caricamento…'}</div>
  if (doc.mime?.startsWith('image/')) return <img src={url} alt={doc.title} className="max-h-96 w-full rounded-xl object-contain" />
  if (doc.mime?.startsWith('video/')) return <video src={url} controls className="max-h-96 w-full rounded-xl" />
  if (doc.mime === 'application/pdf') return <iframe src={url} title={doc.title} className="h-96 w-full rounded-xl border border-line" />
  return <div className="grid h-24 place-items-center text-sm text-muted">Anteprima non disponibile per questo tipo di file</div>
}

function Thumb({ doc }: { doc: Row }) {
  const { store } = useApp()
  const isImg = doc.mime?.startsWith('image/')
  const url = useDocUrl(store, isImg ? doc : null)
  return <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface2 text-muted">{url ? <img src={url} alt="" loading="lazy" className="size-full object-cover" /> : <FileIcon size={22} />}</div>
}

function UploadDialog({ onClose, initialFile }: { onClose: () => void; initialFile?: File | null }) {
  const { store } = useApp()
  const { toast } = useUi()
  const [file, setFile] = useState<File | null>(initialFile ?? null)
  const [f, setF] = useState({ title: '', category: 'referto', date: todayInput(), tags: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const picker = useRef<HTMLInputElement>(null)

  function choose(file: File) {
    if (file.size > MAX) return setErr('File troppo grande (massimo 25 MB).')
    setErr('')
    setFile(file)
    setF((s) => ({ ...s, title: s.title || file.name.replace(/\.[^.]+$/, '') }))
  }
  useEffect(() => {
    if (initialFile) choose(initialFile)
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return setErr('Scegli un file.')
    if (!f.title.trim()) return setErr('Inserisci un titolo.')
    setBusy(true)
    try {
      const id = uuid()
      const path = `${store.householdId}/${id}`
      if (store.mode === 'cloud') {
        if (!navigator.onLine || !supabase) throw new Error('Per caricare documenti serve la connessione.')
        const { error } = await supabase.storage.from('documents').upload(path, file, { contentType: file.type || 'application/octet-stream' })
        if (error) throw error
      } else await store.putBlob(id, file)
      await store.insert('documents', { id, title: f.title.trim(), category: f.category, date: f.date || null, tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean), notes: f.notes || null, file_name: file.name, mime: file.type || 'application/octet-stream', size_bytes: file.size, storage_path: path })
      toast('Documento salvato')
      onClose()
    } catch (e: any) {
      setErr(e?.message ?? 'Caricamento non riuscito')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Carica documento" onClose={onClose}>
      <form onSubmit={save} className="space-y-3" noValidate>
        <input ref={picker} type="file" accept="image/*,application/pdf,video/*" className="sr-only" aria-label="Scegli file" onChange={(e) => e.target.files?.[0] && choose(e.target.files[0])} />
        <Button variant="soft" className="w-full" onClick={() => picker.current?.click()}>
          <FileUp size={18} /> {file ? `${file.name} (${(file.size / 1024).toFixed(0)} KB)` : 'Scegli un file (foto, PDF, video)'}
        </Button>
        {file && (file.type.startsWith('image/') || file.type === 'application/pdf') && (
          <div className="flex flex-wrap items-center gap-2">
            <ExtractButton
              kind="document"
              table="health_records"
              label="Leggi con l’AI"
              onProposal={(fields) => setF((s) => ({ ...s, title: fields.title ?? s.title, date: fields.date ?? s.date, notes: [fields.description, fields.vet_name && 'Veterinario: ' + fields.vet_name, s.notes].filter(Boolean).join('\n') }))}
            />
            <span className="text-xs text-muted">L'AI propone titolo e data: controlla prima di salvare.</span>
          </div>
        )}
        <input className={inputCls} placeholder="Titolo *" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} aria-label="Titolo" />
        <div className="grid grid-cols-2 gap-2">
          <select className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} aria-label="Categoria">
            {DOC_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <input className={inputCls} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="Data" />
        </div>
        <input className={inputCls} placeholder="Tag separati da virgola" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} aria-label="Tag" />
        <textarea className={inputCls + ' py-2'} rows={2} placeholder="Note" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} aria-label="Note" />
        {err && (
          <p role="alert" className="text-sm text-danger">
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="soft" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Salvataggio…' : 'Salva'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default function Documents() {
  const { store } = useApp()
  const { toast, confirm } = useUi()
  const { rows } = useTable('documents')
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState<Row | null>(null)
  const [adding, setAdding] = useState(params.get('nuovo') === '1')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [limit, setLimit] = useState(30)

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return [...rows]
      .sort((a, b) => String(b.date ?? b.created_at).localeCompare(String(a.date ?? a.created_at)))
      .filter((d) => (!cat || d.category === cat) && (!n || [d.title, d.notes, d.file_name, ...(d.tags ?? [])].some((x) => String(x ?? '').toLowerCase().includes(n))))
  }, [rows, q, cat])

  async function download(d: Row) {
    let blob: Blob | undefined
    if (store.mode === 'cloud' && supabase) {
      const r = await supabase.storage.from('documents').download(d.storage_path)
      if (r.error) return toast('Download non riuscito (sei online?)', 'err')
      blob = r.data
    } else blob = await store.getBlob(d.id)
    if (!blob) return toast('File non trovato', 'err')
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = d.file_name || d.title
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1500)
  }

  async function remove(d: Row) {
    if (!(await confirm(`Eliminare definitivamente “${d.title}” e il relativo file?`))) return
    try {
      if (store.mode === 'cloud' && supabase) await supabase.storage.from('documents').remove([d.storage_path])
      else await store.deleteBlob(d.id)
      await store.remove('documents', d.id)
      setOpen(null)
      toast('Documento eliminato')
    } catch (e: any) {
      toast(e?.message ?? 'Eliminazione non riuscita', 'err')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Archivio documenti e ricordi</h1>
          <p className="mt-1 text-sm text-muted">Referti, vaccinazioni, certificati, fatture, foto e video. I file sono privati.</p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <FileUp size={18} /> Carica
        </Button>
      </div>
      <Card className="p-3">
        <div className="mb-3 flex flex-wrap gap-2">
          <div className="relative min-w-40 flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input aria-label="Cerca documenti" className={inputCls + ' pl-9'} placeholder="Cerca per titolo, tag, note…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select aria-label="Categoria" className={inputCls + ' w-auto'} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Tutte le categorie</option>
            {DOC_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        {!shown.length ? (
          <Empty>{rows.length ? 'Nessun risultato.' : 'Nessun documento. Carica il primo con “Carica”.'}</Empty>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {shown.slice(0, limit).map((d) => (
              <li key={d.id}>
                <button onClick={() => setOpen(d)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-bg p-2 text-left hover:bg-surface2">
                  <Thumb doc={d} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{d.title}</span>
                    <span className="block text-xs text-muted">
                      {catLabel(d.category)} · {fmtDate(d.date)}
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      {(d.tags ?? []).slice(0, 3).map((t: string) => (
                        <Badge key={t}>{t}</Badge>
                      ))}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {shown.length > limit && (
          <Button variant="soft" className="mt-3 w-full" onClick={() => setLimit(limit + 30)}>
            Mostra altri ({shown.length - limit})
          </Button>
        )}
      </Card>
      {adding && (
        <UploadDialog
          onClose={() => {
            setAdding(false)
            if (params.get('nuovo')) setParams({})
          }}
        />
      )}
      {open && (
        <Modal title={open.title} onClose={() => setOpen(null)} wide>
          <Preview doc={open} />
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-xs text-muted">Categoria</dt>
              <dd>{catLabel(open.category)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Data</dt>
              <dd>{fmtDate(open.date)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">File</dt>
              <dd className="break-all">
                {open.file_name} ({Math.round((open.size_bytes ?? 0) / 1024)} KB)
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Caricato da</dt>
              <dd>{store.authorName(open.created_by)}</dd>
            </div>
            {open.notes && (
              <div className="col-span-2">
                <dt className="text-xs text-muted">Note</dt>
                <dd className="whitespace-pre-wrap">{open.notes}</dd>
              </div>
            )}
          </dl>
          <div className="mt-4 flex justify-between gap-2">
            <Button variant="danger" onClick={() => void remove(open)}>
              <Trash2 size={16} /> Elimina
            </Button>
            <Button onClick={() => void download(open)}>
              <Download size={16} /> Scarica
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
