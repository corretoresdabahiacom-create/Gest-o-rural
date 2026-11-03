import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useHerd } from '../../contexts/HerdContext'
import { fmtDate, number } from '../../lib/format'
import { collectiveComparison, lotSeries, sessionStats, type Weighing } from '../../lib/weighing'
import { Card, Empty, cx } from '../../components/ui'
import { LineChart } from '../../components/Charts'
import { useWeigh } from './WeighContext'
import { gainTone } from './NewWeighing'

/** Avaliação de um lote: últimas duas pesagens, ganho e GMD só quando metodologicamente válidos. */
export function lotAssessment(lotId: string, active: Weighing[], movs: Parameters<typeof collectiveComparison>[2]) {
  const series = lotSeries(active, lotId)
  const last = series[series.length - 1], prev = series[series.length - 2]
  if (!last) return null
  let gmdVal: number | null = null, note = '', comparable = false
  if (prev) {
    const lastRecs = active.filter((w) => w.sessionId === last.sessionId)
    if (last.mode === 'individual' && lastRecs.length) {
      // Mesmos animais: GMD médio dos animais com pesagem anterior válida.
      const st = sessionStats(lastRecs.map((w) => ({ qty: 1, totalKg: w.avgKg, avgKg: w.avgKg, gainKg: w.gainKg, gmd: w.gmd })))
      gmdVal = st.gmdAvg; comparable = st.gmdCount > 0
      note = comparable ? `GMD médio de ${st.gmdCount} animais com pesagem anterior` : 'Sem pesagens individuais anteriores para os mesmos animais'
    } else if (last.mode === 'collective' && prev.mode === 'collective') {
      const p = active.find((w) => w.sessionId === prev.sessionId && w.lotId === lotId)!, c = active.find((w) => w.sessionId === last.sessionId && w.lotId === lotId)!
      const cmp = collectiveComparison({ ...p, qty: prev.qty, avgKg: prev.avgKg }, { ...c, qty: last.qty, avgKg: last.avgKg }, movs)
      gmdVal = cmp.gmd; comparable = cmp.comparable; note = cmp.comparable ? 'Mesma composição entre as pesagens' : `Não comparável: ${cmp.reasons.join('; ')}`
    } else note = 'Pesagens de tipos diferentes (individual × coletiva): comparação apenas indicativa'
  }
  return { series, last, prev, diff: prev ? Math.round((last.avgKg - prev.avgKg) * 10) / 10 : null, gmd: gmdVal, comparable, note }
}

export default function LotEvolution() {
  const { lots } = useHerd()
  const { active, movs } = useWeigh()
  const weighedLots = lots.filter((l) => active.some((w) => w.lotId === l.id))
  const [sel, setSel] = useState<string[]>(() => weighedLots.slice(0, 3).map((l) => l.id))
  const rows = useMemo(() => weighedLots.map((l) => ({ l, a: lotAssessment(l.id, active, movs) })).filter((x) => x.a), [weighedLots, active, movs])
  if (!weighedLots.length) return <Card><Empty title="Nenhum lote com pesagens" text="Registre pesagens individuais ou coletivas para acompanhar a evolução dos lotes." /></Card>
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold tracking-tight sm:text-2xl">Evolução por lote</h1>
      <p className="mb-5 text-sm text-stone-500">GMD só é apresentado quando a comparação é metodologicamente válida.</p>
      <Card title="Comparativo entre lotes" className="mb-5"><div className="overflow-x-auto"><table className="w-full min-w-[720px]">
        <thead className="border-b border-stone-200 dark:border-stone-800"><tr>{['', 'Lote', 'Animais', 'Peso médio anterior', 'Peso médio atual', 'Diferença', 'GMD', 'Última pesagem'].map((x, i) => <th key={i} className="th">{x}</th>)}</tr></thead>
        <tbody className="divide-y divide-stone-100 dark:divide-stone-800">{rows.map(({ l, a }) => (
          <tr key={l.id}>
            <td className="td"><input type="checkbox" className="accent-brand-600" checked={sel.includes(l.id)} onChange={(e) => setSel(e.target.checked ? [...sel, l.id] : sel.filter((x) => x !== l.id))} aria-label={`Comparar ${l.name}`} /></td>
            <td className="td font-medium">{l.name}</td><td className="td tabular">{l.count}</td>
            <td className="td tabular">{a!.prev ? `${number(a!.prev.avgKg)} kg` : '—'}</td><td className="td tabular">{number(a!.last.avgKg)} kg</td>
            <td className={cx('td tabular', gainTone(a!.diff))}>{a!.diff == null ? '—' : `${a!.diff > 0 ? '+' : ''}${number(a!.diff)} kg`}</td>
            <td className="td tabular">{a!.gmd == null ? <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400" title={a!.note}>{a!.prev && <AlertTriangle className="size-3.5" />}indisponível</span> : <span className={gainTone(a!.gmd)} title={a!.note}>{a!.gmd.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg/dia</span>}</td>
            <td className="td tabular">{fmtDate(a!.last.date)}</td>
          </tr>))}</tbody>
      </table></div>
        <ul className="space-y-0.5 border-t border-stone-200 px-4 py-2 text-xs text-stone-500 dark:border-stone-800">{rows.filter((x) => x.a!.prev).map(({ l, a }) => <li key={l.id}><b>{l.name}:</b> {a!.note}</li>)}</ul>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        {rows.filter(({ l }) => sel.includes(l.id)).map(({ l, a }) => (
          <Card key={l.id} title={`${l.name} — peso médio`}><div className="p-4"><LineChart points={a!.series.map((s) => ({ label: fmtDate(s.date).slice(0, 5), value: s.avgKg }))} format={(n) => `${n} kg`} /></div></Card>
        ))}
      </div>
    </>
  )
}
