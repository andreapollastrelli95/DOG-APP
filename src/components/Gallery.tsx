import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ImagePlus, Images, LayoutGrid, Play, Square, Trash2 } from 'lucide-react'
import { useApp, useTable } from '../lib/app'
import { uuid } from '../lib/store'
import { supabase } from '../lib/supabase'
import { fmtDate, todayInput } from '../lib/format'
import type { Row } from '../lib/schema'
import { Button, Card, useUi } from './ui'

const MAX = 25 * 1024 * 1024
const PER_PAGE = 6
const isVideo = (d: Row) => String(d.mime ?? '').startsWith('video/')
const isMedia = (d: Row) => (String(d.mime ?? '').startsWith('image/') || isVideo(d)) && ['foto', 'video', 'ricordo'].includes(d.category)

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

/** Indirizzi temporanei solo per gli elementi visibili: URL firmati in cloud, blob locali altrimenti. */
function useMediaUrls(items: Row[]) {
  const { store } = useApp()
  const [urls, setUrls] = useState<Record<string, string>>({})
  const cache = useRef<Record<string, string>>({})
  const key = items.map((p) => p.id).join(',')
  useEffect(() => {
    let alive = true
    ;(async () => {
      const missing = items.filter((p) => !cache.current[p.id])
      if (missing.length) {
        if (store.mode === 'cloud' && supabase) {
          const { data } = await supabase.storage.from('documents').createSignedUrls(missing.map((p) => p.storage_path), 3600)
          data?.forEach((d, i) => {
            if (d.signedUrl) cache.current[missing[i].id] = d.signedUrl
          })
        } else {
          for (const p of missing) {
            const b = await store.getBlob(p.id)
            if (b) cache.current[p.id] = URL.createObjectURL(b)
          }
        }
      }
      if (alive) setUrls({ ...cache.current })
    })().catch(() => undefined)
    return () => {
      alive = false
    }
  }, [store, key])
  useEffect(
    () => () => {
      Object.values(cache.current).forEach((u) => u.startsWith('blob:') && URL.revokeObjectURL(u))
      cache.current = {}
    },
    [store],
  )
  return urls
}

const arrow = 'absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white'

export function PhotoGallery() {
  const { store } = useApp()
  const { toast, confirm } = useUi()
  const { rows } = useTable('documents')
  const media = useMemo(() => rows.filter(isMedia).sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')) || String(b.created_at).localeCompare(String(a.created_at))), [rows])
  const [grid, setGrid] = useState(false)
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const touch = useRef<number | null>(null)

  const i = Math.max(0, Math.min(index, media.length - 1))
  const page = Math.floor(i / PER_PAGE)
  const pages = Math.ceil(media.length / PER_PAGE)
  const current = media[i]
  const visible = grid ? media.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE) : media.length ? [current, media[(i + 1) % media.length]] : []
  const urls = useMediaUrls(visible)

  const step = (n: number) => setIndex((i + n + media.length) % media.length)
  const turn = (n: number) => setIndex(((page + n + pages) % pages) * PER_PAGE)

  async function add(files: File[]) {
    if (!files.length) return
    let saved = 0
    try {
      for (const [k, file] of files.entries()) {
        setBusy(files.length > 1 ? `Carico ${k + 1}/${files.length}…` : 'Carico…')
        const video = file.type.startsWith('video/')
        if (!video && !file.type.startsWith('image/')) {
          toast(`${file.name}: non è una foto né un video`, 'err')
          continue
        }
        const blob = video ? file : await shrink(file)
        if (blob.size > MAX) {
          toast(`${file.name}: troppo grande (massimo 25 MB)`, 'err')
          continue
        }
        const id = uuid()
        const path = `${store.householdId}/${id}`
        const mime = blob.type || file.type
        if (store.mode === 'cloud') {
          if (!navigator.onLine || !supabase) throw new Error('Per caricare foto e video serve la connessione.')
          const { error } = await supabase.storage.from('documents').upload(path, blob, { contentType: mime })
          if (error) throw error
        } else await store.putBlob(id, blob)
        await store.insert('documents', { id, title: file.name.replace(/\.[^.]+$/, '') || (video ? 'Video' : 'Foto'), category: video ? 'video' : 'foto', date: todayInput(), tags: [], notes: null, file_name: file.name, mime, size_bytes: blob.size, storage_path: path })
        saved++
      }
      if (saved) {
        setIndex(0)
        toast(saved === 1 ? 'Aggiunto all’album' : `${saved} elementi aggiunti`)
      }
    } catch (e: any) {
      toast(e?.message ?? 'Caricamento non riuscito', 'err')
    } finally {
      setBusy('')
    }
  }

  async function remove(d: Row) {
    if (!(await confirm(`Eliminare definitivamente ${isVideo(d) ? 'il video' : 'la foto'} “${d.title}”?`))) return
    try {
      if (store.mode === 'cloud') {
        if (!navigator.onLine || !supabase) throw new Error('Per eliminare serve la connessione.')
        const { error } = await supabase.storage.from('documents').remove([d.storage_path])
        if (error) throw error
      } else await store.deleteBlob(d.id)
      await store.remove('documents', d.id)
      toast('Eliminato')
    } catch (e: any) {
      toast(e?.message ?? 'Eliminazione non riuscita', 'err')
    }
  }

  const trash = (d: Row) => (
    <button onClick={() => void remove(d)} aria-label={`Elimina ${d.title}`} className="absolute right-2 top-2 grid size-9 place-items-center rounded-full bg-black/55 text-white">
      <Trash2 size={16} />
    </button>
  )

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-medium">
          <Images size={18} className="text-primary" /> Album foto
          {media.length > 0 && <span className="text-xs text-muted">({media.length})</span>}
        </h2>
        <div className="flex items-center gap-2">
          {media.length > 1 && (
            <Button size="sm" variant="soft" onClick={() => setGrid(!grid)}>
              {grid ? <Square size={16} /> : <LayoutGrid size={16} />} {grid ? 'Foto grande' : 'Griglia'}
            </Button>
          )}
          <Button size="sm" disabled={!!busy} onClick={() => picker.current?.click()}>
            <ImagePlus size={16} /> {busy || 'Aggiungi'}
          </Button>
        </div>
        <input
          ref={picker}
          type="file"
          accept="image/*,video/*"
          multiple
          className="sr-only"
          aria-label="Scegli foto o video"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            void add(files)
          }}
        />
      </div>

      {!media.length ? (
        <p className="text-sm text-muted">Ancora nessuna foto. Tocca “Aggiungi” per caricare foto o video.</p>
      ) : grid ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {visible.map((p, k) => (
              <div key={p.id} className="relative">
                <button
                  onClick={() => {
                    setIndex(page * PER_PAGE + k)
                    setGrid(false)
                  }}
                  aria-label={`Apri ${p.title}`}
                  data-testid="cella-album"
                  className="relative block aspect-square w-full overflow-hidden rounded-xl bg-surface2"
                >
                  {urls[p.id] && (isVideo(p) ? <video src={urls[p.id] + '#t=0.1'} preload="metadata" muted playsInline className="size-full object-cover" /> : <img src={urls[p.id]} alt={p.title} className="size-full object-cover" />)}
                  {isVideo(p) && (
                    <span className="absolute inset-0 grid place-items-center">
                      <span className="grid size-11 place-items-center rounded-full bg-black/55 text-white">
                        <Play size={20} />
                      </span>
                    </span>
                  )}
                </button>
                {trash(p)}
              </div>
            ))}
          </div>
          {pages > 1 && (
            <div className="mt-3 flex items-center justify-between gap-2 text-sm">
              <Button size="sm" variant="soft" onClick={() => turn(-1)}>
                <ChevronLeft size={16} /> Precedenti
              </Button>
              <span className="text-muted">
                Pagina {page + 1} di {pages}
              </span>
              <Button size="sm" variant="soft" onClick={() => turn(1)}>
                Successive <ChevronRight size={16} />
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <div
            className="relative h-[55vh] max-h-[32rem] min-h-64 overflow-hidden rounded-2xl bg-surface2"
            onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
            onTouchEnd={(e) => {
              if (touch.current === null) return
              const dx = e.changedTouches[0].clientX - touch.current
              touch.current = null
              if (Math.abs(dx) > 50 && media.length > 1) step(dx < 0 ? 1 : -1)
            }}
          >
            {!urls[current.id] ? (
              <span className="grid size-full place-items-center text-sm text-muted">Carico…</span>
            ) : isVideo(current) ? (
              <video key={current.id} src={urls[current.id] + '#t=0.1'} controls playsInline preload="metadata" className="size-full object-contain" />
            ) : (
              <img src={urls[current.id]} alt={current.title} className="size-full object-contain" />
            )}
            {media.length > 1 && (
              <>
                <button aria-label="Precedente" onClick={() => step(-1)} className={arrow + ' left-2'}>
                  <ChevronLeft size={22} />
                </button>
                <button aria-label="Successiva" onClick={() => step(1)} className={arrow + ' right-2'}>
                  <ChevronRight size={22} />
                </button>
              </>
            )}
            {trash(current)}
          </div>
          <p className="mt-2 flex justify-between text-xs text-muted">
            <span>{fmtDate(current.date)}</span>
            <span data-testid="posizione-album">
              {i + 1} di {media.length}
            </span>
          </p>
        </>
      )}
    </Card>
  )
}
