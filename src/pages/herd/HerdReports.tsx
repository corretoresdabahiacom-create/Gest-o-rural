import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../contexts/AppContext'
import { useHerd } from '../../contexts/HerdContext'
import { friendlyError } from '../../lib/db'
import { fetchMovements, fetchOps } from '../../lib/herdDb'
import { monthRange, today } from '../../lib/format'
import { MOVEMENT_LABEL, type HerdMovement, type Sex } from '../../lib/herd'
import { buildHerdReport, HERD_REPORTS, type Death, type HerdFilters, type HerdReportId, type Purchase, type Sale, type Transfer } from '../../lib/herdReports'
import { Button, Card, ErrorBox, Field, Spinner, cx } from '../../components/ui'
import { ReportView } from '../../components/ReportView'
import { unitLabel } from '../../components/herd/UnitFields'

const NEEDS_PERIOD: HerdReportId[] = ['evolucao', 'compras', 'vendas', 'mortes', 'transferencias', 'movimentos', 'investido', 'bruto', 'despesas', 'liquido', 'custo', 'vac_lote', 'vac_hist']

export default function HerdReports() {
  const { farm } = useApp()
  const { lots, categories, vaccinations, catName, lotName, arroba, ready } = useHerd()
  const t = today()
  const [rid, setRid] = useState<HerdReportId>('atual')
  const [f, setF] = useState<HerdFilters>({ start: `${t.slice(0, 4)}-01-01`, end: t, lotId: '', categoryId: '', sex: '', movType: '', seller: '', buyer: '' })
  const [data, setData] = useState<{ movs: HerdMovement[]; purchases: Purchase[]; sales: Sale[]; deaths: Death[]; transfers: Transfer[] } | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    const id = farm!.id
    Promise.all([fetchMovements(id), fetchOps<Purchase>(id, 'purchases'), fetchOps<Sale>(id, 'sales'), fetchOps<Death>(id, 'mortalityRecords'), fetchOps<Transfer>(id, 'herdTransfers')])
      .then(([movs, purchases, sales, deaths, transfers]) => setData({ movs, purchases, sales, deaths, transfers })).catch((e) => setErr(friendlyError(e)))
  }, [farm, lots])
  const invalid = f.start > f.end
  const report = useMemo(() => (!data || invalid ? null : buildHerdReport(rid, f, { ...data, lots, vaccinations, catName, lotName, unitName: (u) => unitLabel(u, arroba.outraLabel), today: t })),
    [rid, f, data, lots, vaccinations, catName, lotName, arroba.outraLabel, t, invalid])
  const set = (k: keyof HerdFilters) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const showSeller = ['compras', 'investido', 'custo'].includes(rid), showBuyer = showSeller || ['vendas', 'bruto', 'liquido', 'despesas'].includes(rid)

  if (!ready) return <Spinner />
  return (
    <>
      <div className="no-print mb-4 space-y-2">
        {HERD_REPORTS.map((g) => (
          <div key={g.group} className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-stone-500">{g.group}</span>
            {g.items.map((r) => <button key={r.id} onClick={() => setRid(r.id)} className={cx('shrink-0 rounded-full border px-3 py-1 text-sm', rid === r.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-300 bg-white dark:border-stone-700 dark:bg-stone-900')}>{r.label}</button>)}
          </div>
        ))}
      </div>
      <Card className="no-print mb-5">
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {(NEEDS_PERIOD.includes(rid) || rid === 'data') && <>
            {rid !== 'data' && <Field label="Data inicial"><input type="date" className="input" value={f.start} onChange={set('start')} /></Field>}
            <Field label={rid === 'data' ? 'Inventário na data' : 'Data final'}><input type="date" className="input" value={f.end} max={rid === 'data' ? t : undefined} onChange={set('end')} /></Field>
          </>}
          <Field label="Lote"><select className="input" value={f.lotId} onChange={set('lotId')}><option value="">Todos</option>{lots.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
          <Field label="Categoria"><select className="input" value={f.categoryId} onChange={set('categoryId')}><option value="">Todas</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Sexo"><select className="input" value={f.sex} onChange={(e) => setF({ ...f, sex: e.target.value as Sex | '' })}><option value="">Ambos</option><option value="M">Machos</option><option value="F">Fêmeas</option></select></Field>
          {rid === 'movimentos' && <Field label="Tipo de movimentação"><select className="input" value={f.movType} onChange={set('movType')}><option value="">Todos</option>{Object.entries(MOVEMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>}
          {showSeller && <Field label="Vendedor"><input className="input" value={f.seller} onChange={set('seller')} placeholder="Contém…" /></Field>}
          {showBuyer && <Field label={showSeller ? 'Quem comprou' : 'Comprador'}><input className="input" value={f.buyer} onChange={set('buyer')} placeholder="Contém…" /></Field>}
          {NEEDS_PERIOD.includes(rid) && <div className="flex flex-wrap items-end gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => { const [s, e] = monthRange(t.slice(0, 7)); setF({ ...f, start: s, end: e }) }}>Este mês</Button>
            <Button size="sm" variant="secondary" onClick={() => setF({ ...f, start: `${t.slice(0, 4)}-01-01`, end: `${t.slice(0, 4)}-12-31` })}>Este ano</Button>
          </div>}
        </div>
      </Card>
      {err ? <ErrorBox>{err}</ErrorBox> : invalid ? <ErrorBox>A data inicial deve ser anterior ou igual à final.</ErrorBox> : !report ? <Spinner /> : <ReportView report={report} farmName={farm!.name} />}
    </>
  )
}
