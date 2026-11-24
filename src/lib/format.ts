const TZ = 'Europe/Rome'
export const eur = (n: number | null | undefined) => (n === null || n === undefined || Number.isNaN(Number(n)) ? '—' : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(n)))
export const num = (n: number | null | undefined, d = 1) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('it-IT', { maximumFractionDigits: d }))

/** "2026-03-04" o ISO → "04/03/2026" */
export function fmtDate(v?: string | null): string {
  if (!v) return '—'
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T12:00:00') : new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('it-IT', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}
export function fmtDateTime(v?: string | null): string {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('it-IT', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d)
}
export function fmtTime(v: string): string {
  return new Intl.DateTimeFormat('it-IT', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(v))
}
/** ISO → valore per <input type="datetime-local"> nel fuso locale */
export function toInputDateTime(v?: string | null): string {
  const d = v ? new Date(v) : new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
export const todayInput = () => toInputDateTime().slice(0, 10)

export function relativeDay(v: string): string {
  const d = new Date(v)
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const n = new Date()
  const b = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()
  const diff = Math.round((a - b) / 86400000)
  if (diff === 0) return 'oggi'
  if (diff === 1) return 'domani'
  if (diff === -1) return 'ieri'
  if (diff > 1) return `tra ${diff} giorni`
  return `${-diff} giorni fa`
}

export function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
/** CSV con separatore ";" e BOM: si apre correttamente in Excel italiano. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  return '﻿' + [headers, ...rows].map((r) => r.map(csvEscape).join(';')).join('\r\n')
}
export function download(name: string, content: BlobPart, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
