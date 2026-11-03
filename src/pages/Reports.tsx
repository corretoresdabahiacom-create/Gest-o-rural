import { useMemo, useState } from 'react'
import { useApp } from '../contexts/AppContext'
import { useEntries, useRevenues } from '../lib/db'
import { monthRange, today } from '../lib/format'
import { buildReport, REPORTS, type Filters, type ReportId } from '../lib/reports'
import { ReportView } from '../components/ReportView'
import { Button, Card, ErrorBox, Field, Spinner, cx } from '../components/ui'

const ENTRY_REPORTS: ReportId[] = ['geral', 'colaborador', 'tipo', 'categoria', 'mensal', 'comparativo']

export default function Reports() {
  const { farm, collaborators, laborTypes, categories, obligations } = useApp()
  const t = today()
  const [rid, setRid] = useState<ReportId>('geral')
  const [mr] = useState(() => monthRange(t.slice(0, 7)))
  const [f, setF] = useState<Filters>({ start: mr[0], end: mr[1], collaboratorId: '', laborTypeId: '', expenseType: '', compareStart: '', compareEnd: '' })
  const invalid = f.start > f.end || (rid === 'comparativo' && (!f.compareStart || !f.compareEnd || f.compareStart > f.compareEnd))

  const a = useEntries(farm!.id, f.start, f.end)
  const b = useEntries(rid === 'comparativo' && f.compareStart && f.compareEnd ? farm!.id : null, f.compareStart ?? '', f.compareEnd ?? '')
  const rv = useRevenues(farm!.id, f.start, f.end)
  const laborTypeOf = (id: string) => collaborators.find((c) => c.id === id)?.laborTypeId
  const report = useMemo(() => (invalid ? null : buildReport(rid, f, a.data, obligations, t, laborTypeOf, b.data, rv.data)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rid, f, a.data, b.data, rv.data, obligations, t, invalid])

  const quick = (kind: 'month' | 'year' | 'lastMonth') => {
    if (kind === 'year') return setF({ ...f, start: `${t.slice(0, 4)}-01-01`, end: `${t.slice(0, 4)}-12-31` })
    const ym = kind === 'month' ? t.slice(0, 7) : (() => { const d = new Date(t + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7) })()
    const [s, e] = monthRange(ym)
    setF({ ...f, start: s, end: e })
  }
  const set = (k: keyof Filters) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const loading = (ENTRY_REPORTS.includes(rid) && (a.loading || (rid === 'comparativo' && b.loading))) || ((rid === 'receitas' || rid === 'mensal') && rv.loading)

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
        <ReportView report={report} farmName={farm!.name} />
      )}
    </>
  )
}
