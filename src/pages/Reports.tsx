import { useMemo, useState } from 'react'
import { FileDown, FileSpreadsheet, FileText, Printer } from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import { useEntries, friendlyError } from '../lib/db'
import { monthRange, today } from '../lib/format'
import { buildReport, REPORTS, type Filters, type ReportId } from '../lib/reports'
import { exportCsv, exportPdf, exportXlsx, formatCell } from '../lib/export'
import { Button, Card, Empty, ErrorBox, Field, Spinner, cx, useToast } from '../components/ui'

const ENTRY_REPORTS: ReportId[] = ['geral', 'colaborador', 'tipo', 'categoria', 'mensal', 'comparativo']

export default function Reports() {
  const { farm, collaborators, laborTypes, categories, obligations } = useApp()
  const toast = useToast()
  const t = today()
  const [rid, setRid] = useState<ReportId>('geral')
  const [mr] = useState(() => monthRange(t.slice(0, 7)))
  const [f, setF] = useState<Filters>({ start: mr[0], end: mr[1], collaboratorId: '', laborTypeId: '', expenseType: '', compareStart: '', compareEnd: '' })
  const [busy, setBusy] = useState('')
  const invalid = f.start > f.end || (rid === 'comparativo' && (!f.compareStart || !f.compareEnd || f.compareStart > f.compareEnd))

  const a = useEntries(farm!.id, f.start, f.end)
  const b = useEntries(rid === 'comparativo' && f.compareStart && f.compareEnd ? farm!.id : null, f.compareStart ?? '', f.compareEnd ?? '')
  const laborTypeOf = (id: string) => collaborators.find((c) => c.id === id)?.laborTypeId
  const report = useMemo(() => (invalid ? null : buildReport(rid, f, a.data, obligations, t, laborTypeOf, b.data)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rid, f, a.data, b.data, obligations, t, invalid])

  const quick = (kind: 'month' | 'year' | 'lastMonth') => {
    if (kind === 'year') return setF({ ...f, start: `${t.slice(0, 4)}-01-01`, end: `${t.slice(0, 4)}-12-31` })
    const ym = kind === 'month' ? t.slice(0, 7) : (() => { const d = new Date(t + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7) })()
    const [s, e] = monthRange(ym)
    setF({ ...f, start: s, end: e })
  }
  async function run(kind: string, fn: () => unknown) {
    setBusy(kind)
    try { await fn() } catch (e) { toast('error', friendlyError(e)) } finally { setBusy('') }
  }
  const set = (k: keyof Filters) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const loading = ENTRY_REPORTS.includes(rid) && (a.loading || (rid === 'comparativo' && b.loading))
  const right = (type?: string) => ['money', 'number', 'percent'].includes(type ?? '')

  return (
    <>
      <div className="no-print mb-5"><h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Relatórios</h1><p className="text-sm text-stone-500">Filtros combináveis com totalização automática</p></div>
      <div className="no-print mb-4 flex gap-2 overflow-x-auto pb-1">
        {REPORTS.map((r) => (
          <button key={r.id} onClick={() => setRid(r.id)}
            className={cx('shrink-0 rounded-full border px-3 py-1.5 text-sm', rid === r.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-300 bg-white text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300')}>
            {r.label}
          </button>
        ))}
      </div>
      <Card className="no-print mb-5">
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={rid === 'comparativo' ? 'Período A — início' : 'Data inicial'}><input type="date" className="input" value={f.start} onChange={set('start')} /></Field>
          <Field label={rid === 'comparativo' ? 'Período A — fim' : 'Data final'}><input type="date" className="input" value={f.end} onChange={set('end')} /></Field>
          {rid === 'comparativo' && <>
            <Field label="Período B — início"><input type="date" className="input" value={f.compareStart} onChange={set('compareStart')} /></Field>
            <Field label="Período B — fim"><input type="date" className="input" value={f.compareEnd} onChange={set('compareEnd')} /></Field>
          </>}
          <Field label="Colaborador">
            <select className="input" value={f.collaboratorId} onChange={set('collaboratorId')}>
              <option value="">Todos</option>
              {collaborators.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? '' : ' (inativo)'}</option>)}
            </select>
          </Field>
          <Field label="Tipo de mão de obra">
            <select className="input" value={f.laborTypeId} onChange={set('laborTypeId')}>
              <option value="">Todos</option>
              {laborTypes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          {ENTRY_REPORTS.includes(rid) && (
            <Field label="Tipo de despesa">
              <select className="input" value={f.expenseType} onChange={set('expenseType')}>
                <option value="">Todas</option>
                <option value="labor">Mão de obra</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          )}
          <div className="flex flex-wrap items-end gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => quick('month')}>Este mês</Button>
            <Button size="sm" variant="secondary" onClick={() => quick('lastMonth')}>Mês anterior</Button>
            <Button size="sm" variant="secondary" onClick={() => quick('year')}>Este ano</Button>
          </div>
        </div>
        {(f.collaboratorId || f.laborTypeId) && ENTRY_REPORTS.includes(rid) && (
          <p className="px-4 pb-3 text-xs text-stone-500">Com filtro de colaborador ou tipo, apenas pagamentos de mão de obra são incluídos.</p>
        )}
      </Card>

      {invalid ? <ErrorBox>Verifique as datas: a data inicial deve ser anterior ou igual à final{rid === 'comparativo' ? ' e o período B deve ser preenchido' : ''}.</ErrorBox>
        : a.error ? <ErrorBox>{a.error}</ErrorBox>
        : loading || !report ? <Spinner /> : (
        <Card title={<span>{report.title}<span className="block text-xs font-normal text-stone-500">{farm!.name} · {report.subtitle}</span></span>}
          action={
            <div className="no-print flex flex-wrap justify-end gap-1">
              <Button size="sm" variant="secondary" loading={busy === 'xlsx'} disabled={!report.rows.length} onClick={() => run('xlsx', () => exportXlsx(report, farm!.name))}><FileSpreadsheet className="size-4" />Excel</Button>
              <Button size="sm" variant="secondary" loading={busy === 'pdf'} disabled={!report.rows.length} onClick={() => run('pdf', () => exportPdf(report, farm!.name))}><FileText className="size-4" />PDF</Button>
              <Button size="sm" variant="secondary" disabled={!report.rows.length} onClick={() => exportCsv(report, farm!.name)}><FileDown className="size-4" />CSV</Button>
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
      )}
    </>
  )
}
