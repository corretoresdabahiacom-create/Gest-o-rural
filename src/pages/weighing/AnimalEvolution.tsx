import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Scale } from 'lucide-react'
import { useHerd } from '../../contexts/HerdContext'
import { fmtDate, number, today } from '../../lib/format'
import { gmd } from '../../lib/weighing'
import { Card, Empty, Field, PageHeader, Stat, cx } from '../../components/ui'
import { LineChart } from '../../components/Charts'
import { useWeigh } from './WeighContext'
import { gainTone } from './NewWeighing'

export default function AnimalEvolution() {
  const { id } = useParams()
  const nav = useNavigate()
  const { animals, catName, lotName, arroba } = useHerd()
  const { active } = useWeigh()
  const [range, setRange] = useState({ start: '', end: today() })
  const a = animals.find((x) => x.id === id)
  const all = useMemo(() => active.filter((w) => w.animalId === id && w.mode === 'individual').sort((x, y) => x.date.localeCompare(y.date)), [active, id])
  const hist = all.filter((w) => (!range.start || w.date >= range.start) && w.date <= range.end)
  const sorted = [...animals].sort((x, y) => x.tag.localeCompare(y.tag, 'pt-BR', { numeric: true }))
  const last = all[all.length - 1], prev = all[all.length - 2]
  const base = all[0]
  const lastGmd = last && prev ? gmd(last.avgKg, last.date, prev.avgKg, prev.date) : last?.gmd ?? null

  return (
    <>
      <PageHeader title="Evolução individual" subtitle={a ? `${a.tag}${a.name ? ` · ${a.name}` : ''} · ${catName(a.categoryId)} · lote atual ${lotName(a.lotId)}${a.status !== 'ativo' ? ` · ${a.status}` : ''}` : 'Escolha um animal identificado'} />
      <div className="mb-5 flex flex-wrap gap-2">
        <select className="input w-auto min-w-48" value={id ?? ''} onChange={(e) => nav(`/rebanho/pesagem/animal/${e.target.value}`)} aria-label="Animal">
          <option value="">Selecione o animal…</option>{sorted.map((x) => <option key={x.id} value={x.id}>{x.tag}{x.name ? ` · ${x.name}` : ''}{x.status !== 'ativo' ? ` (${x.status})` : ''}</option>)}
        </select>
        {a && <><Field label="" className="w-auto"><input type="date" className="input" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} aria-label="De" /></Field>
          <Field label="" className="w-auto"><input type="date" className="input" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} aria-label="Até" /></Field>
          <Link to={`/rebanho/animais/${a.id}`} className="self-center text-sm text-brand-700 hover:underline dark:text-brand-300">Ficha do animal</Link></>}
      </div>
      {!a ? <Card><Empty icon={<Scale className="size-5" />} title="Selecione um animal para ver a evolução de peso" /></Card> : all.length === 0 ? <Card><Empty title="Este animal ainda não tem pesagens individuais" text={a.weightKg ? `Peso de entrada: ${number(a.weightKg)} kg em ${fmtDate(a.entryDate)}.` : undefined} /></Card> : <>
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Peso atual" value={`${number(last.avgKg)} kg`} icon={<Scale className="size-4" />} sub={`${fmtDate(last.date)} · ${number(last.avgKg / arroba.vivo)} @ vivo`} />
          <Stat label="Peso anterior" value={prev ? `${number(prev.avgKg)} kg` : '—'} icon={<Scale className="size-4" />} tone="stone" sub={prev ? fmtDate(prev.date) : undefined} />
          <Stat label="Ganho acumulado" value={`${number(Math.round((last.avgKg - base.avgKg) * 10) / 10)} kg`} icon={<Scale className="size-4" />} tone="stone" sub={`desde ${fmtDate(base.date)} (1ª pesagem)`} />
          <Stat label="GMD último intervalo" value={lastGmd == null ? 'indisponível' : `${lastGmd.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg/dia`} icon={<Scale className="size-4" />} tone="earth" />
          <Stat label="Maior peso registrado" value={`${number(Math.max(...all.map((w) => w.avgKg)))} kg`} icon={<Scale className="size-4" />} tone="stone" />
        </div>
        <Card title="Evolução do peso" className="mb-5"><div className="p-4"><LineChart points={hist.map((w) => ({ label: fmtDate(w.date).slice(0, 5), value: w.avgKg }))} format={(n) => `${n} kg`} /></div></Card>
        <Card title="Todas as pesagens"><div className="overflow-x-auto"><table className="w-full">
          <thead className="border-b border-stone-200 dark:border-stone-800"><tr>{['Data', 'Lote', 'Peso', 'Diferença', 'Dias', 'GMD'].map((x) => <th key={x} className="th">{x}</th>)}</tr></thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-800">{hist.map((w) => {
            const i = all.indexOf(w), p = all[i - 1]
            const d = p ? Math.round((w.avgKg - p.avgKg) * 10) / 10 : null
            const g = p ? gmd(w.avgKg, w.date, p.avgKg, p.date) : null
            return <tr key={w.id}><td className="td tabular">{fmtDate(w.date)}</td><td className="td">{lotName(w.lotId)}</td><td className="td tabular">{number(w.avgKg)} kg</td>
              <td className={cx('td tabular', gainTone(d))}>{d == null ? '—' : `${d > 0 ? '+' : ''}${number(d)} kg`}</td>
              <td className="td tabular">{p ? Math.round((Date.parse(w.date) - Date.parse(p.date)) / 86400000) : '—'}</td>
              <td className={cx('td tabular', gainTone(g))}>{g == null ? '—' : `${g.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg/dia`}</td></tr>
          })}</tbody>
        </table></div></Card>
        <p className="mt-2 text-xs text-stone-500">O histórico acompanha o animal mesmo após transferências entre lotes ou saída do rebanho.</p>
      </>}
    </>
  )
}
