import { useState } from 'react'
import { FileDown, FileSpreadsheet, FileText, Printer } from 'lucide-react'
import { friendlyError } from '../lib/db'
import { exportCsv, exportPdf, exportXlsx, formatCell } from '../lib/export'
import type { ReportResult } from '../lib/reports'
import { Button, Card, Empty, cx, useToast } from './ui'

/** Tabela de relatório com totalização e exportação (Excel, PDF, CSV, impressão). */
export function ReportView({ report, farmName }: { report: ReportResult; farmName: string }) {
  const toast = useToast()
  const [busy, setBusy] = useState('')
  const right = (type?: string) => ['money', 'number', 'percent', 'kg'].includes(type ?? '')
  async function run(kind: string, fn: () => unknown) {
    setBusy(kind)
    try { await fn() } catch (e) { toast('error', friendlyError(e)) } finally { setBusy('') }
  }
  return (
    <Card title={<span>{report.title}<span className="block text-xs font-normal text-stone-500">{farmName} · {report.subtitle}</span></span>}
      action={
        <div className="no-print flex flex-wrap justify-end gap-1">
          <Button size="sm" variant="secondary" loading={busy === 'xlsx'} disabled={!report.rows.length} onClick={() => run('xlsx', () => exportXlsx(report, farmName))}><FileSpreadsheet className="size-4" />Excel</Button>
          <Button size="sm" variant="secondary" loading={busy === 'pdf'} disabled={!report.rows.length} onClick={() => run('pdf', () => exportPdf(report, farmName))}><FileText className="size-4" />PDF</Button>
          <Button size="sm" variant="secondary" disabled={!report.rows.length} onClick={() => exportCsv(report, farmName)}><FileDown className="size-4" />CSV</Button>
          <Button size="sm" variant="secondary" disabled={!report.rows.length} onClick={() => window.print()}><Printer className="size-4" />Imprimir</Button>
        </div>
      }>
      {report.rows.length === 0 ? <Empty title="Nenhum resultado para os filtros selecionados" /> : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-stone-200 dark:border-stone-800">
              <tr>{report.columns.map((c) => <th key={c.key} className={cx('th', right(c.type) && 'text-right')}>{c.label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {report.rows.map((row, i) => (
                <tr key={i}>{report.columns.map((c) => <td key={c.key} className={cx('td', right(c.type) && 'tabular text-right', c.type === 'date' && 'tabular')}>{formatCell(row[c.key], c)}</td>)}</tr>
              ))}
            </tbody>
            {report.totals && (
              <tfoot className="border-t-2 border-stone-300 bg-stone-50 font-semibold dark:border-stone-700 dark:bg-stone-800/50">
                <tr>{report.columns.map((c) => <td key={c.key} className={cx('td', right(c.type) && 'tabular text-right')}>{report.totals![c.key] == null ? '' : formatCell(report.totals![c.key], c)}</td>)}</tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </Card>
  )
}
