import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ImagePlus, Images, Trash2 } from 'lucide-react'
import { useApp, useTable } from '../lib/app'
import { uuid } from '../lib/store'
import { supabase } from '../lib/supabase'
import { todayInput } from '../lib/format'
import type { Row } from '../lib/schema'
import { Button, Card, Modal, useUi } from './ui'

const MAX = 25 * 1024 * 1024
const isPhoto = (d: Row) => String(d.mime ?? '').startsWith('image/') && (d.category === 'foto' || d.category === 'ricordo')

/** Riduce la foto (lato lungo 1600 px) per risparmiare spazio; se il formato non è leggibile resta l'originale. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * k)
    c.height = Math.round(bmp.height * k)
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(bmp, 0, 0, c.width, c.height)
    const out = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.85))
    return out && out.size < file.size ? out : file
  } catch {
    return file
  }
}

/** Indirizzi temporanei delle foto: URL firmati in cloud, blob locali altrimenti. */
function usePhotoUrls(photos: Row[]) {
  const { store } = useApp()
  const [urls, setUrls] = useState<Record<string, string>>({})
  const key = photos.map((p) => p.id).join(',')
  useEffect(() => {
    let alive = true
    const local: string[] = []
    ;(async () => {
      const next: Record<string, string> = {}
      if (store.mode === 'cloud' && supabase) {
        if (photos.length) {
          const { data } = await supabase.storage.from('documents').createSignedUrls(photos.map((p) => p.storage_path), 3600)
          data?.forEach((d, i) => {
            if (d.signedUrl) next[photos[i].id] = d.signedUrl
          })
        }
      } else {
        for (const p of photos) {
          const b = await store.getBlob(p.id)
          if (b) local.push((next[p.id] = URL.createObjectURL(b)))
        }
      }
      if (alive) setUrls(next)
      else local.forEach((u) => URL.revokeObjectURL(u))
    })().catch(() => undefined)
    return () => {
      alive = false
      local.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [store, key])
  return urls
}

export function PhotoGallery() {
  const { store } = useApp()
  const { toast, confirm } = useUi()
  const { rows } = useTable('documents')
  const photos = useMemo(() => rows.filter(isPhoto).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))), [rows])
  const urls = usePhotoUrls(photos)
  const [open, setOpen] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const strip = useRef<HTMLDivElement>(null)
  const current = open === null ? null : photos[Math.min(open, photos.length - 1)]

  const step = (n: number) => setOpen((i) => (i === null ? i : (i + n + photos.length) % photos.length))
  const scroll = (n: number) => strip.current?.scrollBy({ left: n * strip.current.clientWidth * 0.8, behavior: 'smooth' })

  async function add(files: File[]) {
    if (!files.length) return
    setBusy(true)
    let saved = 0
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) {
          toast(`${file.name}: non è una foto`, 'err')
          continue
        }
        const blob = await shrink(file)
        if (blob.size > MAX) {
          toast(`${file.name}: troppo grande (massimo 25 MB)`, 'err')
          continue
        }
        const id = uuid()
        const path = `${store.householdId}/${id}`
        const mime = blob.type || file.type
        if (store.mode === 'cloud') {
          if (!navigator.onLine || !supabase) throw new Error('Per caricare le foto serve la connessione.')
          const { error } = await supabase.storage.from('documents').upload(path, blob, { contentType: mime })
          if (error) throw error
        } else await store.putBlob(id, blob)
        await store.insert('documents', { id, title: file.name.replace(/\.[^.]+$/, '') || 'Foto', category: 'foto', date: todayInput(), tags: [], notes: null, file_name: file.name, mime, size_bytes: blob.size, storage_path: path })
        saved++
      }
      if (saved) toast(saved === 1 ? 'Foto aggiunta' : `${saved} foto aggiunte`)
    } catch (e: any) {
      toast(e?.message ?? 'Caricamento non riuscito', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function remove(d: Row) {
    if (!(await confirm(`Eliminare definitivamente la foto “${d.title}”?`))) return
    try {
      if (store.mode === 'cloud') {
        if (!navigator.onLine || !supabase) throw new Error('Per eliminare le foto serve la connessione.')
        const { error } = await supabase.storage.from('documents').remove([d.storage_path])
        if (error) throw error
      } else await store.deleteBlob(d.id)
      await store.remove('documents', d.id)
      setOpen(null)
      toast('Foto eliminata')
    } catch (e: any) {
      toast(e?.message ?? 'Eliminazione non riuscita', 'err')
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-medium">
          <Images size={18} className="text-primary" /> Album foto
        </h2>
        <div className="flex items-center gap-1">
          {photos.length > 1 && (
            <span className="hidden gap-1 sm:flex">
              <button aria-label="Foto precedenti" onClick={() => scroll(-1)} className="grid size-9 place-items-center rounded-full bg-surface2 text-primary">
                <ChevronLeft size={18} />
              </button>
              <button aria-label="Foto successive" onClick={() => scroll(1)} className="grid size-9 place-items-center rounded-full bg-surface2 text-primary">
                <ChevronRight size={18} />
              </button>
            </span>
          )}
          <Button size="sm" disabled={busy} onClick={() => picker.current?.click()}>
            <ImagePlus size={16} /> {busy ? 'Carico…' : 'Aggiungi foto'}
          </Button>
        </div>
        <input
          ref={picker}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          aria-label="Scegli foto"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            void add(files)
          }}
        />
      </div>

      {!photos.length ? (
        <p className="text-sm text-muted">Ancora nessuna foto. Tocca “Aggiungi foto” per iniziare l'album.</p>
      ) : (
        <div ref={strip} className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
          {photos.map((p, i) => (
            <div key={p.id} className="relative shrink-0 snap-center">
              <button onClick={() => setOpen(i)} aria-label={`Apri foto ${p.title}`} className="block h-64 w-52 overflow-hidden rounded-2xl border border-line bg-surface2">
                {urls[p.id] ? <img src={urls[p.id]} alt={p.title} loading="lazy" className="size-full object-cover" /> : <span className="grid size-full place-items-center px-2 text-xs text-muted">{p.title}</span>}
              </button>
              <button onClick={() => void remove(p)} aria-label={`Elimina foto ${p.title}`} className="absolute right-2 top-2 grid size-9 place-items-center rounded-full bg-black/55 text-white">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {current && (
        <Modal title={current.title} onClose={() => setOpen(null)} wide>
          {urls[current.id] ? <img src={urls[current.id]} alt={current.title} className="max-h-[65vh] w-full rounded-xl object-contain" /> : <p className="py-10 text-center text-sm text-muted">Foto non disponibile senza connessione.</p>}
          <div className="mt-3 flex items-center justify-between gap-2">
            <Button variant="danger" onClick={() => void remove(current)}>
              <Trash2 size={16} /> Elimina
            </Button>
            {photos.length > 1 && (
              <div className="flex gap-2">
                <Button variant="soft" onClick={() => step(-1)}>
                  <ChevronLeft size={16} /> Indietro
                </Button>
                <Button variant="soft" onClick={() => step(1)}>
                  Avanti <ChevronRight size={16} />
                </Button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </Card>
  )
}
