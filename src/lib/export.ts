import { fmtDate, money } from './format'
import type { Column, ReportResult } from './reports'

const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 })

export function formatCell(v: string | number | null | undefined, c: Column): string {
  if (v == null || v === '') return c.type === 'money' || c.type === 'date' ? '—' : ''
  switch (c.type) {
    case 'money': return money(Number(v))
    case 'date': return fmtDate(String(v))
    case 'percent': return pct.format(Number(v))
    case 'number': return Number(v).toLocaleString('pt-BR')
    case 'kg': return `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`
    case 'decimal': return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    default: return String(v)
  }
}

function slug(s: string) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
const allRows = (r: ReportResult) => (r.totals ? [...r.rows, r.totals] : r.rows)

/** CSV no padrão brasileiro (separador ;, decimal com vírgula, BOM para o Excel). */
export function toCsv(r: ReportResult): string {
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const cell = (v: string | number | null | undefined, c: Column) => {
    if (v == null) return ''
    if (c.type === 'money') return (Number(v) / 100).toFixed(2).replace('.', ',')
    if (c.type === 'percent') return (Number(v) * 100).toFixed(1).replace('.', ',') + '%'
    if (c.type === 'date') return fmtDate(String(v))
    if (c.type === 'kg' || c.type === 'decimal') return String(Math.round(Number(v) * 100) / 100).replace('.', ',')
    return String(v)
  }
  return [r.columns.map((c) => esc(c.label)).join(';'), ...allRows(r).map((row) => r.columns.map((c) => esc(cell(row[c.key], c))).join(';'))].join('\r\n')
}

export function exportCsv(r: ReportResult, farm: string) {
  download(new Blob(['﻿' + toCsv(r)], { type: 'text/csv;charset=utf-8' }), `${slug(farm)}-${slug(r.title)}.csv`)
}

export async function exportXlsx(r: ReportResult, farm: string) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Relatório')
  ws.addRow([`${farm} — ${r.title}`]).font = { bold: true, size: 14 }
  ws.addRow([r.subtitle]).font = { color: { argb: 'FF666666' } }
  ws.addRow([])
  const head = ws.addRow(r.columns.map((c) => c.label))
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  head.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C643D' } } })
  for (const row of allRows(r)) {
    const xr = ws.addRow(r.columns.map((c) => {
      const v = row[c.key]
      if (v == null) return null
      if (c.type === 'money') return Number(v) / 100
      if (c.type === 'date') { const [y, m, d] = String(v).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
      return v
    }))
    r.columns.forEach((c, i) => {
      const cell = xr.getCell(i + 1)
      if (c.type === 'money') cell.numFmt = '"R$" #,##0.00'
      if (c.type === 'date') cell.numFmt = 'dd/mm/yyyy'
      if (c.type === 'percent') cell.numFmt = '0.0%'
      if (c.type === 'kg') cell.numFmt = '#,##0.0 "kg"'
      if (c.type === 'decimal') cell.numFmt = '#,##0.00'
    })
    if (row === r.totals) xr.font = { bold: true }
  }
  ws.columns.forEach((col, i) => { col.width = Math.max(12, Math.min(45, ...[r.columns[i]?.label.length ?? 10, ...r.rows.map((x) => String(x[r.columns[i]?.key] ?? '').length)].map((n) => n + 4))) })
  const buf = await wb.xlsx.writeBuffer()
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${slug(farm)}-${slug(r.title)}.xlsx`)
}

export async function exportPdf(r: ReportResult, farm: string) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: r.columns.length > 5 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
  doc.setFontSize(14); doc.text(`${farm} — ${r.title}`, 40, 40)
  doc.setFontSize(9); doc.setTextColor(110); doc.text(r.subtitle, 40, 56)
  const right = (c: Column) => ['money', 'number', 'percent', 'kg', 'decimal'].includes(c.type ?? '')
  autoTable(doc, {
    startY: 70,
    head: [r.columns.map((c) => c.label)],
    body: r.rows.map((row) => r.columns.map((c) => formatCell(row[c.key], c))),
    foot: r.totals ? [r.columns.map((c) => formatCell(r.totals![c.key], c))] : undefined,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [44, 100, 61] },
    footStyles: { fillColor: [235, 240, 236], textColor: 20, fontStyle: 'bold' },
    columnStyles: Object.fromEntries(r.columns.map((c, i) => [i, right(c) ? { halign: 'right' } : {}])),
    didDrawPage: () => {
      doc.setFontSize(8); doc.setTextColor(150)
      doc.text(`AgroGestão · gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Bahia' })}`, 40, doc.internal.pageSize.getHeight() - 20)
    },
  })
  doc.save(`${slug(farm)}-${slug(r.title)}.pdf`)
}
