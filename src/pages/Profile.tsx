import { useEffect, useState } from 'react'
import { Camera, PawPrint } from 'lucide-react'
import { useApp, useTable } from '../lib/app'
import { validate, normalize, type Field, type TableDef } from '../lib/schema'
import { ageText } from '../lib/analysis'
import { Button, Card, useUi } from '../components/ui'
import { FieldInput } from '../components/Resource'
import { num } from '../lib/format'

const DOG_FIELDS: Field[] = [
  { key: 'name', label: 'Nome', type: 'text', required: true },
  { key: 'breed', label: 'Razza', type: 'text' },
  { key: 'birth_date', label: 'Data di nascita', type: 'date' },
  { key: 'sex', label: 'Sesso', type: 'select', options: [{ value: 'F', label: 'Femmina' }, { value: 'M', label: 'Maschio' }] },
  { key: 'size', label: 'Taglia', type: 'select', options: [{ value: 'grande', label: 'Grande' }, { value: 'gigante', label: 'Gigante' }, { value: 'media', label: 'Media' }], default: 'grande' },
  { key: 'coat', label: 'Colore e caratteristiche fisiche', type: 'textarea' },
  { key: 'microchip', label: 'Microchip', type: 'text' },
  { key: 'registration_number', label: 'Numero di registrazione', type: 'text' },
  { key: 'adoption_date', label: 'Data di adozione', type: 'date' },
  { key: 'sterilized', label: 'Sterilizzata', type: 'bool' },
  { key: 'vet_name', label: 'Veterinario di riferimento', type: 'text' },
  { key: 'vet_phone', label: 'Telefono del veterinario', type: 'text' },
  { key: 'emergency_contacts', label: 'Contatti di emergenza', type: 'textarea', help: 'Anche in Luoghi → “Contatto di emergenza”.' },
  { key: 'allergies', label: 'Allergie e intolleranze', type: 'textarea' },
  { key: 'conditions', label: 'Patologie note (inserite da voi)', type: 'textarea' },
  { key: 'notes', label: 'Note e particolarità', type: 'textarea' },
]
const DOG_DEF: TableDef = { name: 'dogs', label: 'Profilo', singular: 'profilo', fields: DOG_FIELDS, dateField: 'created_at', summary: (r) => String(r.name) }

async function resizeImage(file: File, max = 640): Promise<string> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale)
  c.height = Math.round(bmp.height * scale)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.82)
}

export default function Profile() {
  const { store } = useApp()
  const { toast } = useUi()
  const { rows, loading } = useTable('dogs')
  const { rows: weights } = useTable('weights')
  const dog = rows[0]
  const [values, setValues] = useState<Record<string, any>>({})
  const [photo, setPhoto] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (loading) return
    const v: Record<string, any> = {}
    for (const f of DOG_FIELDS) v[f.key] = f.type === 'bool' ? !!dog?.[f.key] : (dog?.[f.key] ?? f.default ?? '')
    setValues(v)
    setPhoto(dog?.photo_data ?? null)
  }, [dog?.id, dog?.updated_at, loading])

  if (loading) return <p className="text-muted">Caricamento…</p>

  const missing = DOG_FIELDS.filter((f) => f.type !== 'bool' && !dog?.[f.key] && f.key !== 'notes' && f.key !== 'conditions').map((f) => f.label)
  const lastW = [...weights].sort((a, b) => b.date.localeCompare(a.date))[0]

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate(DOG_DEF, values)
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      const data = { ...normalize(DOG_DEF, values), photo_data: photo }
      if (dog) await store.update('dogs', dog.id, data)
      else await store.insert('dogs', data)
      toast('Profilo salvato')
    } catch (err: any) {
      toast(err?.message ?? 'Salvataggio non riuscito', 'err')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <h1 className="font-display text-2xl">Profilo della cagnolina</h1>
      <Card className="flex flex-col items-center gap-4 sm:flex-row">
        <label className="group relative grid size-28 cursor-pointer place-items-center overflow-hidden rounded-3xl bg-surface2 text-primary">
          {photo ? <img src={photo} alt="Foto" className="size-full object-cover" /> : <PawPrint size={44} />}
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/50 py-1 text-xs text-white">
            <Camera size={12} /> Foto
          </span>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Carica fotografia"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) setPhoto(await resizeImage(f).catch(() => (toast('Immagine non leggibile', 'err'), photo)))
            }}
          />
        </label>
        <div className="text-center sm:text-left">
          <div className="font-display text-2xl">{values.name || 'Nuovo profilo'}</div>
          <div className="text-sm text-muted">{[ageText(values.birth_date), lastW ? `ultimo peso ${num(lastW.weight_kg)} kg` : ''].filter(Boolean).join(' · ')}</div>
        </div>
      </Card>

      {dog && missing.length > 0 && (
        <Card className="border-gold/40 bg-gold/10 text-sm">
          <strong>Da completare:</strong> {missing.join(', ')}. Non inseriamo dati al posto vostro: lasciate vuoto ciò che non sapete.
        </Card>
      )}

      <Card className="grid gap-3 sm:grid-cols-2">
        {DOG_FIELDS.map((f) => (
          <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
            <FieldInput f={f} value={values[f.key] ?? ''} error={errors[f.key]} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
          </div>
        ))}
      </Card>
      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? 'Salvataggio…' : 'Salva profilo'}
        </Button>
      </div>
    </form>
  )
}
