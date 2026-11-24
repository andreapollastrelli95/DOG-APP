// Definizione unica delle tabelle: usata da form, validazione, CSV, report e documentazione.
// I nomi dei campi coincidono con le colonne PostgreSQL (supabase/migrations).

export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'datetime' | 'select' | 'bool' | 'rating'

export interface Option {
  value: string
  label: string
}

export interface Field {
  key: string
  label: string
  type: FieldType
  options?: Option[]
  required?: boolean
  min?: number
  max?: number
  step?: number
  unit?: string
  help?: string
  /** mostra il campo nella tabella */
  column?: boolean
  default?: string | number | boolean
}

export interface TableDef {
  name: string
  label: string
  singular: string
  fields: Field[]
  /** campo data usato per ordinamento/grafici */
  dateField: string
  /** descrizione breve di una riga (per audit e conferme) */
  summary: (r: Row) => string
}

export type Row = Record<string, any> & {
  id: string
  dog_id?: string
  created_at: string
  updated_at: string
  created_by?: string | null
}

const opts = (pairs: [string, string][]): Option[] => pairs.map(([value, label]) => ({ value, label }))

export const HEALTH_KINDS = opts([
  ['visita', 'Visita veterinaria'],
  ['vaccinazione', 'Vaccinazione'],
  ['richiamo', 'Richiamo'],
  ['antiparassitario', 'Antiparassitario'],
  ['farmaco', 'Farmaco / terapia'],
  ['esame', 'Esame diagnostico'],
  ['analisi_sangue', 'Analisi del sangue'],
  ['referto', 'Referto'],
  ['intervento', 'Intervento'],
  ['allergia', 'Allergia'],
  ['patologia', 'Patologia'],
  ['osservazione', 'Osservazione'],
])

export const EXPENSE_CATEGORIES = opts([
  ['alimentazione', 'Alimentazione'],
  ['veterinario', 'Veterinario'],
  ['farmaci', 'Farmaci'],
  ['antiparassitari', 'Antiparassitari'],
  ['toelettatura', 'Toelettatura'],
  ['accessori', 'Accessori'],
  ['giochi', 'Giochi'],
  ['pensione_dogsitter', 'Pensione e dog sitter'],
  ['assicurazione', 'Assicurazione'],
  ['altro', 'Altro'],
])

export const ACTIVITY_KINDS = opts([
  ['passeggiata', 'Passeggiata'],
  ['gioco', 'Gioco'],
  ['esercizio', 'Esercizio fisico'],
  ['riposo', 'Riposo'],
])

export const MEAL_KINDS = opts([
  ['pasto', 'Pasto'],
  ['snack', 'Snack / premio'],
  ['integratore', 'Integratore'],
])

export const FOOD_TYPES = opts([
  ['secco', 'Crocchette'],
  ['umido', 'Umido'],
  ['casalingo', 'Casalingo'],
  ['barf', 'Dieta cruda'],
  ['snack', 'Snack'],
  ['integratore', 'Integratore'],
  ['altro', 'Altro'],
])

export const APPOINTMENT_KINDS = opts([
  ['visita', 'Visita veterinaria'],
  ['vaccinazione', 'Vaccinazione'],
  ['trattamento', 'Trattamento'],
  ['toelettatura', 'Toelettatura'],
  ['acquisto', 'Acquisto da effettuare'],
  ['scadenza', 'Scadenza'],
  ['famiglia', 'Attività familiare'],
  ['pasto', 'Pasto'],
  ['passeggiata', 'Passeggiata'],
])

export const PRIORITIES = opts([
  ['bassa', 'Bassa'],
  ['normale', 'Normale'],
  ['alta', 'Alta'],
])

export const PLACE_KINDS = opts([
  ['veterinario', 'Veterinario'],
  ['clinica_h24', 'Clinica veterinaria H24'],
  ['farmacia', 'Farmacia veterinaria'],
  ['toelettatore', 'Toelettatore'],
  ['dog_sitter', 'Dog sitter'],
  ['pensione', 'Pensione'],
  ['area_cani', 'Area cani'],
  ['negozio', 'Negozio per animali'],
  ['altro', 'Altro'],
])

export const DOC_CATEGORIES = opts([
  ['referto', 'Referto'],
  ['vaccinazione', 'Vaccinazione'],
  ['certificato', 'Certificato'],
  ['fattura', 'Fattura'],
  ['scontrino', 'Scontrino'],
  ['identificativo', 'Documento identificativo'],
  ['foto', 'Fotografia'],
  ['video', 'Video'],
  ['ricordo', 'Ricordo'],
  ['altro', 'Altro'],
])

const eur = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n)

export const TABLES: Record<string, TableDef> = {
  weights: {
    name: 'weights',
    label: 'Pesate',
    singular: 'pesata',
    dateField: 'date',
    fields: [
      { key: 'date', label: 'Data', type: 'date', required: true, column: true },
      { key: 'weight_kg', label: 'Peso', type: 'number', required: true, min: 0.1, max: 120, step: 0.1, unit: 'kg', column: true },
      { key: 'notes', label: 'Note', type: 'textarea', column: true },
    ],
    summary: (r) => `${r.weight_kg} kg il ${r.date}`,
  },
  health_records: {
    name: 'health_records',
    label: 'Cartella clinica',
    singular: 'evento sanitario',
    dateField: 'date',
    fields: [
      { key: 'date', label: 'Data', type: 'date', required: true, column: true },
      { key: 'kind', label: 'Tipologia', type: 'select', options: HEALTH_KINDS, required: true, column: true, default: 'visita' },
      { key: 'title', label: 'Titolo', type: 'text', required: true, column: true },
      { key: 'description', label: 'Descrizione', type: 'textarea' },
      { key: 'vet_name', label: 'Veterinario', type: 'text', column: true },
      { key: 'dosage', label: 'Dose / posologia (come da veterinario)', type: 'text', help: 'Riporta solo quanto indicato dal veterinario.' },
      { key: 'next_due_date', label: 'Prossima scadenza / richiamo', type: 'date' },
      { key: 'cost_eur', label: 'Costo', type: 'number', min: 0, step: 0.01, unit: '€', column: true },
      { key: 'notes', label: 'Note', type: 'textarea' },
    ],
    summary: (r) => `${r.title} (${r.date})`,
  },
  food_products: {
    name: 'food_products',
    label: 'Alimenti e scorte',
    singular: 'alimento',
    dateField: 'purchase_date',
    fields: [
      { key: 'brand', label: 'Marca', type: 'text', column: true },
      { key: 'name', label: 'Prodotto', type: 'text', required: true, column: true },
      { key: 'type', label: 'Tipologia', type: 'select', options: FOOD_TYPES, required: true, column: true, default: 'secco' },
      { key: 'daily_grams', label: 'Quantità giornaliera', type: 'number', min: 0, step: 1, unit: 'g', column: true, help: 'Serve a stimare la data di esaurimento.' },
      { key: 'stock_grams', label: 'Scorta disponibile', type: 'number', min: 0, step: 1, unit: 'g', column: true },
      { key: 'purchase_date', label: 'Data di acquisto', type: 'date', column: true },
      { key: 'cost_eur', label: 'Costo', type: 'number', min: 0, step: 0.01, unit: '€' },
      { key: 'avoid', label: 'Sconsigliato / intolleranza', type: 'bool', help: 'Segna gli alimenti da evitare.' },
      { key: 'notes', label: 'Note / ingredienti', type: 'textarea' },
    ],
    summary: (r) => `${r.brand ? r.brand + ' ' : ''}${r.name}`,
  },
  meals: {
    name: 'meals',
    label: 'Pasti',
    singular: 'pasto',
    dateField: 'at',
    fields: [
      { key: 'at', label: 'Quando', type: 'datetime', required: true, column: true },
      { key: 'kind', label: 'Tipo', type: 'select', options: MEAL_KINDS, required: true, column: true, default: 'pasto' },
      { key: 'food_name', label: 'Cosa', type: 'text', column: true },
      { key: 'grams', label: 'Quantità', type: 'number', min: 0, step: 1, unit: 'g', column: true },
      { key: 'appetite', label: 'Appetito', type: 'rating', min: 1, max: 5, help: '1 = poco, 5 = ottimo' },
      { key: 'notes', label: 'Note', type: 'textarea' },
    ],
    summary: (r) => `${r.kind} ${r.food_name ?? ''} ${r.grams ?? ''}g`,
  },
  activities: {
    name: 'activities',
    label: 'Attività fisica',
    singular: 'attività',
    dateField: 'at',
    fields: [
      { key: 'at', label: 'Quando', type: 'datetime', required: true, column: true },
      { key: 'kind', label: 'Tipo', type: 'select', options: ACTIVITY_KINDS, required: true, column: true, default: 'passeggiata' },
      { key: 'duration_min', label: 'Durata', type: 'number', required: true, min: 1, max: 1440, step: 1, unit: 'min', column: true },
      { key: 'distance_km', label: 'Distanza', type: 'number', min: 0, max: 200, step: 0.1, unit: 'km', column: true },
      { key: 'route', label: 'Percorso', type: 'text' },
      { key: 'notes', label: 'Osservazioni', type: 'textarea', column: true },
    ],
    summary: (r) => `${r.kind} ${r.duration_min} min`,
  },
  behavior_logs: {
    name: 'behavior_logs',
    label: 'Comportamento e benessere',
    singular: 'osservazione',
    dateField: 'date',
    fields: [
      { key: 'date', label: 'Data', type: 'date', required: true, column: true },
      { key: 'mood', label: 'Umore', type: 'rating', min: 1, max: 5, column: true },
      { key: 'appetite', label: 'Appetito', type: 'rating', min: 1, max: 5, column: true },
      { key: 'energy', label: 'Energia', type: 'rating', min: 1, max: 5, column: true },
      { key: 'sleep', label: 'Sonno', type: 'rating', min: 1, max: 5, column: true },
      { key: 'sociality', label: 'Socialità', type: 'rating', min: 1, max: 5 },
      { key: 'unusual', label: 'Comportamenti insoliti / disagio', type: 'textarea', column: true },
      { key: 'notes', label: 'Note', type: 'textarea' },
    ],
    summary: (r) => `Benessere del ${r.date}`,
  },
  expenses: {
    name: 'expenses',
    label: 'Spese',
    singular: 'spesa',
    dateField: 'date',
    fields: [
      { key: 'date', label: 'Data', type: 'date', required: true, column: true },
      { key: 'category', label: 'Categoria', type: 'select', options: EXPENSE_CATEGORIES, required: true, column: true, default: 'alimentazione' },
      { key: 'description', label: 'Descrizione', type: 'text', required: true, column: true },
      { key: 'amount_eur', label: 'Importo', type: 'number', required: true, min: 0.01, step: 0.01, unit: '€', column: true },
      { key: 'recurring', label: 'Ricorrente', type: 'select', options: opts([['', 'No'], ['mensile', 'Mensile'], ['trimestrale', 'Trimestrale'], ['annuale', 'Annuale']]), column: true },
      { key: 'notes', label: 'Note', type: 'textarea' },
    ],
    summary: (r) => `${r.description} ${eur(Number(r.amount_eur))}`,
  },
  budgets: {
    name: 'budgets',
    label: 'Budget',
    singular: 'budget',
    dateField: 'created_at',
    fields: [
      { key: 'period', label: 'Periodo', type: 'select', options: opts([['mensile', 'Mensile'], ['annuale', 'Annuale']]), required: true, column: true, default: 'mensile' },
      { key: 'category', label: 'Categoria (vuoto = totale)', type: 'select', options: [{ value: '', label: 'Totale' }, ...EXPENSE_CATEGORIES], column: true },
      { key: 'amount_eur', label: 'Importo', type: 'number', required: true, min: 1, step: 1, unit: '€', column: true },
    ],
    summary: (r) => `Budget ${r.period} ${eur(Number(r.amount_eur))}`,
  },
  appointments: {
    name: 'appointments',
    label: 'Agenda',
    singular: 'evento',
    dateField: 'starts_at',
    fields: [
      { key: 'starts_at', label: 'Data e ora', type: 'datetime', required: true, column: true },
      { key: 'kind', label: 'Tipo', type: 'select', options: APPOINTMENT_KINDS, required: true, column: true, default: 'visita' },
      { key: 'title', label: 'Titolo', type: 'text', required: true, column: true },
      { key: 'description', label: 'Descrizione', type: 'textarea' },
      { key: 'assignee', label: 'Responsabile', type: 'text', column: true },
      { key: 'priority', label: 'Priorità', type: 'select', options: PRIORITIES, column: true, default: 'normale' },
      {
        key: 'remind_before_min',
        label: 'Promemoria',
        type: 'select',
        options: opts([['', 'Nessuno'], ['0', 'All’ora dell’evento'], ['60', '1 ora prima'], ['1440', '1 giorno prima'], ['10080', '1 settimana prima']]),
      },
      { key: 'done', label: 'Completato', type: 'bool', column: true },
    ],
    summary: (r) => `${r.title} (${r.starts_at})`,
  },
  places: {
    name: 'places',
    label: 'Luoghi e servizi',
    singular: 'contatto',
    dateField: 'created_at',
    fields: [
      { key: 'kind', label: 'Tipo', type: 'select', options: PLACE_KINDS, required: true, column: true, default: 'veterinario' },
      { key: 'name', label: 'Nome', type: 'text', required: true, column: true },
      { key: 'phone', label: 'Telefono', type: 'text', column: true },
      { key: 'address', label: 'Indirizzo', type: 'text', column: true },
      { key: 'hours', label: 'Orari', type: 'text' },
      { key: 'website', label: 'Sito web', type: 'text' },
      { key: 'emergency', label: 'Contatto di emergenza', type: 'bool', column: true },
      { key: 'notes', label: 'Note', type: 'textarea' },
    ],
    summary: (r) => String(r.name),
  },
}

export const TABLE_NAMES = Object.keys(TABLES)

/** Tabelle gestite internamente (non hanno una pagina CRUD generica). */
export const INTERNAL_TABLES = ['dogs', 'documents', 'ai_conversations', 'ai_messages', 'audit_logs', 'notifications']

export type ValidationErrors = Record<string, string>

/** Validazione condivisa: in cloud è replicata dai CHECK della migrazione SQL. */
export function validate(def: TableDef, values: Record<string, any>): ValidationErrors {
  const errors: ValidationErrors = {}
  for (const f of def.fields) {
    const v = values[f.key]
    const empty = v === undefined || v === null || v === ''
    if (f.required && empty && f.type !== 'bool') {
      errors[f.key] = 'Campo obbligatorio'
      continue
    }
    if (empty) continue
    if (f.type === 'number' || f.type === 'rating') {
      const n = Number(v)
      if (!Number.isFinite(n)) errors[f.key] = 'Inserisci un numero'
      else if (f.min !== undefined && n < f.min) errors[f.key] = `Minimo ${f.min}`
      else if (f.max !== undefined && n > f.max) errors[f.key] = `Massimo ${f.max}`
    }
    if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) errors[f.key] = 'Data non valida'
    if (f.type === 'datetime' && Number.isNaN(Date.parse(String(v)))) errors[f.key] = 'Data/ora non valida'
    if (f.type === 'select' && f.options && !f.options.some((o) => o.value === String(v))) errors[f.key] = 'Valore non valido'
  }
  return errors
}

/** Converte i valori del form nei tipi del DB (numeri, null per vuoti). */
export function normalize(def: TableDef, values: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const f of def.fields) {
    const v = values[f.key]
    if (f.type === 'number' || f.type === 'rating') out[f.key] = v === '' || v == null ? null : Number(v)
    else if (f.type === 'bool') out[f.key] = !!v
    else if (f.type === 'datetime') out[f.key] = v ? new Date(v).toISOString() : null
    else if (f.key === 'remind_before_min') out[f.key] = v === '' || v == null ? null : Number(v)
    else out[f.key] = v === '' || v === undefined ? null : v
  }
  return out
}
