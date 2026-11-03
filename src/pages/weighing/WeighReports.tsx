import { useMemo, useState } from 'react'
import { useApp } from '../../contexts/AppContext'
import { useHerd } from '../../contexts/HerdContext'
import { today } from '../../lib/format'
import { buildWeighReport, WEIGH_REPORTS, type WeighFilters, type WeighReportId } from '../../lib/weighingReports'
import { ARROBA_LABEL, type ArrobaUnit } from '../../lib/herd'
import { Card, Field, cx } from '../../components/ui'
import { ReportView } from '../../components/ReportView'
import { useWeigh } from './WeighContext'

export default function WeighReports() {
  const { farm } = useApp()
  const { lots, animals, categories, lotName, catName, arroba } = useHerd()
  const { weighings } = useWeigh()
  const t = today()
  const [rid, setRid] = useState<WeighReportId>('periodo')
  const [unit, setUnit] = useState<ArrobaUnit>('vivo')
  const [f, setF] = useState<WeighFilters>({ start: `${t.slice(0, 4)}-01-01`, end: t, lotId: '', categoryId: '', animalId: '', mode: '', sex: '' })
  const kg = unit === 'vivo' ? arroba.vivo : unit === 'carcaca' ? arroba.carcaca : arroba.outra
  const report = useMemo(() => buildWeighReport(rid, f, weighings, { lotName, catName, sexOf: (id) => animals.find((a) => a.id === id)?.sex, kgPerArroba: kg, arrobaLabel: unit === 'outra' ? arroba.outraLabel : ARROBA_LABEL[unit] }),
    [rid, f, weighings, lotName, catName, animals, kg, unit, arroba.outraLabel])
  const set = (k: keyof WeighFilters) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  return (
    <>
      <div className="no-print mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {WEIGH_REPORTS.map((r) => <button key={r.id} onClick={() => setRid(r.id)} className={cx('shrink-0 rounded-full border px-3 py-1 text-sm', rid === r.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-300 bg-white dark:border-stone-700 dark:bg-stone-900')}>{r.label}</button>)}
      </div>
      <Card className="no-print mb-5"><div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Data inicial"><input type="date" className="input" value={f.start} onChange={set('start')} /></Field>
        <Field label="Data final"><input type="date" className="input" value={f.end} onChange={set('end')} /></Field>
        <Field label="Lote"><select className="input" value={f.lotId} onChange={set('lotId')}><option value="">Todos</option>{lots.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        <Field label="Categoria"><select className="input" value={f.categoryId} onChange={set('categoryId')}><option value="">Todas</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Animal"><select className="input" value={f.animalId} onChange={set('animalId')}><option value="">Todos</option>{animals.map((a) => <option key={a.id} value={a.id}>{a.tag}</option>)}</select></Field>
        <Field label="Sexo"><select className="input" value={f.sex} onChange={set('sex')}><option value="">Ambos</option><option value="M">Machos</option><option value="F">Fêmeas</option></select></Field>
        <Field label="Tipo de pesagem"><select className="input" value={f.mode} onChange={set('mode')}><option value="">Todas</option><option value="individual">Individual</option><option value="collective">Coletiva</option></select></Field>
        <Field label="Unidade para arrobas"><select className="input" value={unit} onChange={(e) => setUnit(e.target.value as ArrobaUnit)}><option value="vivo">@ peso vivo ({arroba.vivo} kg)</option><option value="carcaca">@ carcaça ({arroba.carcaca} kg)</option><option value="outra">{arroba.outraLabel} ({arroba.outra} kg)</option></select></Field>
      </div></Card>
      {f.start > f.end ? <p className="text-sm text-red-600">A data inicial deve ser anterior à final.</p> : <ReportView report={report} farmName={farm!.name} />}
    </>
  )
}
