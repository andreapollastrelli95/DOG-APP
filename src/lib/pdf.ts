import { jsPDF } from 'jspdf'

export interface PdfSection {
  heading: string
  lines?: string[]
  table?: { head: string[]; rows: (string | number)[][] }
}

/** PDF semplice, testuale e leggibile: titolo, intestazione, sezioni con righe o tabelle. */
export function buildPdf(title: string, subtitle: string, sections: PdfSection[]): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const M = 16
  let y = 20
  const ensure = (h: number) => {
    if (y + h > 285) {
      doc.addPage()
      y = 20
    }
  }
  doc.setFillColor(47, 74, 58)
  doc.rect(0, 0, W, 12, 'F')
  doc.setTextColor(35, 48, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text(title, M, y + 4)
  y += 11
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(117, 111, 99)
  doc.text(subtitle, M, y)
  y += 10
  for (const s of sections) {
    ensure(16)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(47, 74, 58)
    doc.text(s.heading, M, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(35, 48, 42)
    for (const l of s.lines ?? []) {
      const wrapped = doc.splitTextToSize(l, W - 2 * M) as string[]
      ensure(wrapped.length * 5 + 1)
      doc.text(wrapped, M, y)
      y += wrapped.length * 5 + 1
    }
    if (s.table) {
      const cols = s.table.head.length
      const cw = (W - 2 * M) / cols
      ensure(8)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      s.table.head.forEach((h, i) => doc.text(h, M + i * cw, y))
      y += 2
      doc.setDrawColor(200, 190, 160)
      doc.line(M, y, W - M, y)
      y += 4
      doc.setFont('helvetica', 'normal')
      for (const r of s.table.rows) {
        const cells = r.map((c, i) => doc.splitTextToSize(String(c ?? ''), cw - 2) as string[])
        const h = Math.max(...cells.map((c) => c.length)) * 4.2
        ensure(h + 2)
        cells.forEach((c, i) => doc.text(c, M + i * cw, y))
        y += h + 1.5
      }
    }
    y += 5
  }
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150, 145, 130)
    doc.text(`DOG MANAGER · generato il ${new Date().toLocaleDateString('it-IT')} · pagina ${i}/${pages}`, M, 292)
  }
  return doc
}
