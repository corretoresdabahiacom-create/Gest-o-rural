import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Award, Plus, Scale, TrendingDown, TrendingUp } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { useHerd } from '../../contexts/HerdContext'
import { fmtDate, monthLabel, monthsBetween, number, shiftMonth, today } from '../../lib/format'
import { sessionStats, weightBands } from '../../lib/weighing'
import { animalGains } from '../../lib/weighingReports'
import { Badge, Button, Card, Empty, PageHeader, Stat, cx } from '../../components/ui'
import { BarList, Bars, LineChart } from '../../components/Charts'
import { PeriodPicker, periodFromMonth, type Period } from '../../components/PeriodPicker'
import { useWeigh } from './WeighContext'
import { lotAssessment } from './LotEvolution'
import { gainTone } from './NewWeighing'

export default function WeighDashboard() {
  const { canEdit } = useApp()
  const { lots, lotName, arroba } = useHerd()
  const { active, sessions, movs } = useWeigh()
  const t = today()
  const [period, setPeriod] = useState<Period>(() => periodFromMonth(t.slice(0, 7)))
  const [lotId, setLotId] = useState('')
  const ws = active.filter((w) => w.date >= period.start && w.date <= period.end && (!lotId || w.lotId === lotId))
  const st = sessionStats(ws)
  const gmdSt = sessionStats(ws.filter((w) => w.mode === 'individual').map((w) => ({ qty: 1, totalKg: w.avgKg, avgKg: w.avgKg, gmd: w.gmd })))
  const assessments = useMemo(() => lots.filter((l) => !lotId || l.id === lotId).map((l) => ({ l, a: lotAssessment(l.id, active.filter((w) => w.date <= period.end), movs) })).filter((x) => x.a?.diff != null), [lots, lotId, active, movs, period.end])
  const ranked = [...assessments].sort((a, b) => (b.a!.gmd ?? b.a!.diff! / 1000) - (a.a!.gmd ?? a.a!.diff! / 1000))
  const best = animalGains(ws).filter((x) => x.gmd != null).sort((a, b) => b.gmd! - a.gmd!).slice(0, 5)
  const months = monthsBetween(`${shiftMonth(period.end.slice(0, 7), -11)}-01`, period.end)
  const scoped = active.filter((w) => !lotId || w.lotId === lotId)
  const monthly = months.map((ym) => { const m = scoped.filter((w) => w.date.startsWith(ym)); const s = sessionStats(m); const g = sessionStats(m.filter((w) => w.mode === 'individual').map((w) => ({ qty: 1, totalKg: w.avgKg, avgKg: w.avgKg, gmd: w.gmd }))); return { label: monthLabel(ym), avg: s.count ? s.avgKg : null, gmd: g.gmdAvg } })
  const lastIndividual = new Map<string, number>()
  for (const w of active) if (w.mode === 'individual' && w.animalId && (!lotId || w.lotId === lotId)) lastIndividual.set(w.animalId, w.avgKg)

  return (
    <>
      <PageHeader title="Painel de pesagem" actions={canEdit && <Link to="/rebanho/pesagem/nova"><Button><Plus className="size-4" />Nova pesagem</Button></Link>} />
      <div className="mb-5 flex flex-wrap gap-2"><PeriodPicker value={period} onChange={setPeriod} />
        <select className="input w-auto" value={lotId} onChange={(e) => setLotId(e.target.value)} aria-label="Lote"><option value="">Todos os lotes</option>{lots.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
      {!active.length ? <Card><Empty icon={<Scale className="size-5" />} title="Nenhuma pesagem registrada" text="Registre a primeira pesagem individual ou coletiva, ou importe uma planilha." /></Card> : <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Animais pesados no período" value={number(st.count)} icon={<Scale className="size-4" />} sub={`${new Set(ws.map((w) => w.sessionId)).size} pesagem(ns)`} />
          <Stat label="Peso médio geral" value={st.count ? `${number(st.avgKg)} kg` : '—'} icon={<Scale className="size-4" />} tone="stone" sub={st.count ? `${number(st.avgKg / arroba.vivo)} @ vivo (${arroba.vivo} kg)` : undefined} />
          <Stat label="GMD médio" value={gmdSt.gmdAvg == null ? 'indisponível' : `${gmdSt.gmdAvg.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg/dia`} icon={<TrendingUp className="size-4" />} tone="earth" sub={gmdSt.gmdAvg == null ? 'Requer duas pesagens individuais do mesmo animal' : `${gmdSt.gmdCount} animais`} />
          <Stat label="Lote com maior / menor ganho" value={ranked.length ? ranked[0].l.name : '—'} icon={<Award className="size-4" />} tone="stone" sub={ranked.length > 1 ? `Menor: ${ranked[ranked.length - 1].l.name}` : undefined} />
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <Card title="Evolução mensal do peso médio" className="lg:col-span-2"><div className="p-4"><LineChart points={monthly.map((m) => ({ label: m.label, value: m.avg }))} format={(n) => `${n} kg`} /></div></Card>
          <Card title="Últimas pesagens" action={<Link to="/rebanho/pesagem/historico" className="text-xs text-brand-700 hover:underline dark:text-brand-300">Histórico</Link>}>
            <ul className="divide-y divide-stone-100 dark:divide-stone-800">{sessions.filter((s) => !lotId || s.lotId === lotId).slice(0, 6).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm"><div className="min-w-0"><div className="truncate font-medium">{s.lotId ? lotName(s.lotId) : 'Vários lotes'}</div><div className="text-xs text-stone-500">{fmtDate(s.date)} · {s.count} cab. · <Badge tone={s.mode === 'individual' ? 'green' : 'blue'}>{s.mode === 'individual' ? 'ind.' : 'col.'}</Badge></div></div><b className="tabular">{number(s.avgKg)} kg</b></li>))}</ul>
          </Card>
          <Card title="Comparação de desempenho entre lotes"><div className="p-4">{ranked.length ? (
            <ul className="space-y-2 text-sm">{ranked.map(({ l, a }) => (
              <li key={l.id} className="flex items-center justify-between gap-2"><span className="truncate">{l.name}</span>
                <span className="tabular text-right"><span className={gainTone(a!.diff)}>{a!.diff! > 0 ? '+' : ''}{number(a!.diff!)} kg</span>
                  <span className={cx('block text-xs', a!.gmd == null ? 'text-amber-700 dark:text-amber-400' : 'text-stone-500')}>{a!.gmd == null ? 'GMD indisponível' : `${a!.gmd.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg/dia`}</span></span></li>))}</ul>
          ) : <Empty title="Precisa de ao menos duas pesagens por lote" />}</div></Card>
          <Card title="Evolução do GMD (individual)"><div className="p-4">{monthly.some((m) => m.gmd != null) ? <Bars data={monthly.map((m) => ({ label: m.label, values: [m.gmd ?? 0] }))} series={[{ name: 'GMD kg/dia', color: 'var(--color-brand-600)' }]} format={(n) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg/dia`} /> : <Empty title="Sem GMD calculável" />}</div></Card>
          <Card title="Distribuição por faixa de peso (último peso individual)"><div className="p-4">{lastIndividual.size ? <BarList items={weightBands([...lastIndividual.values()])} format={(n) => `${n} cab.`} /> : <Empty title="Sem pesagens individuais" />}</div></Card>
          <Card title={<span className="flex items-center gap-2"><TrendingUp className="size-4 text-brand-600" />Melhor desempenho no período</span>} className="lg:col-span-3">
            {best.length ? <ul className="divide-y divide-stone-100 dark:divide-stone-800">{best.map((x) => (
              <li key={x.animalId} className="flex items-center justify-between px-4 py-2 text-sm"><Link to={`/rebanho/pesagem/animal/${x.animalId}`} className="font-medium hover:underline">{x.tag}</Link><span className="text-stone-500">{lotName(x.lotId)}</span><span className="tabular">{number(x.first.avgKg)} → {number(x.last.avgKg)} kg</span><b className={cx('tabular', gainTone(x.gmd))}>{x.gmd!.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg/dia</b></li>))}</ul>
              : <Empty icon={<TrendingDown className="size-5" />} title="Sem animais com duas pesagens no período" />}
          </Card>
        </div>
      </>}
    </>
  )
}
