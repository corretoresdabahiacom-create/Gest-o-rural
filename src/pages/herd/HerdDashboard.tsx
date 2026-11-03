import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Beef, CalendarClock, Layers, Scale, ShoppingCart, Skull, Syringe, Tag, TrendingDown } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { useHerd } from '../../contexts/HerdContext'
import { friendlyError } from '../../lib/db'
import { fetchMovements } from '../../lib/herdDb'
import { daysBetween, fmtDate, money, monthLabel, monthRange, monthsBetween, number, shiftMonth, today } from '../../lib/format'
import { herdEvolution, parseKey, vaccineAlerts, type HerdMovement } from '../../lib/herd'
import { Badge, Button, Card, Empty, ErrorBox, PageHeader, Spinner, Stat } from '../../components/ui'
import { BarList, Bars, LineChart } from '../../components/Charts'
import { PeriodPicker, periodFromMonth, type Period } from '../../components/PeriodPicker'
import { useOps } from '../../components/herd/OpList'
import { seedAnimalCategories } from './LotsAnimals'

interface Weighing { date: string; avgKg: number; qty: number; supersededBy?: string }

export default function HerdDashboard() {
  const { farm, canEdit } = useApp()
  const { lots, activeLots, categories, vaccinations, catName, lotName, arroba, ready } = useHerd()
  const t = today()
  const [period, setPeriod] = useState<Period>(() => periodFromMonth(t.slice(0, 7)))
  const [movs, setMovs] = useState<HerdMovement[] | null>(null)
  const [err, setErr] = useState('')
  const purchases = useOps<{ date: string; qty: number; amount: number; reversedBy?: string }>('purchases')?.filter((x) => !x.reversedBy) ?? null
  const sales = useOps<{ date: string; qty: number; net: number; reversedBy?: string }>('sales')?.filter((x) => !x.reversedBy) ?? null
  const deathOps = useOps<{ date: string; qty: number; reversedBy?: string }>('mortalityRecords')?.filter((x) => !x.reversedBy) ?? null
  const reversals = useOps<{ date: string; originalId: string }>('reversals')
  const weighings = useOps<Weighing>('weighings')
  useEffect(() => { fetchMovements(farm!.id).then(setMovs).catch((e) => setErr(friendlyError(e))) }, [farm, lots])

  const inP = <T extends { date: string }>(l: T[] | null) => (l ?? []).filter((x) => x.date >= period.start && x.date <= period.end)
  const total = activeLots.reduce((s, l) => s + l.count, 0)
  const bySex = { M: 0, F: 0 }, byCat: Record<string, number> = {}
  for (const l of activeLots) for (const [k, q] of Object.entries(l.balances ?? {})) { const { categoryId, sex } = parseKey(k); bySex[sex] += q; byCat[categoryId] = (byCat[categoryId] ?? 0) + q }
  const weighed = activeLots.filter((l) => l.avgWeightKg && l.count)
  const totalKg = weighed.reduce((s, l) => s + (l.avgWeightKg ?? 0) * l.count, 0)
  const coverage = weighed.reduce((s, l) => s + l.count, 0)
  // Fluxos (entradas/saídas) ignoram operações estornadas e os próprios estornos; saldos usam todo o histórico.
  const reversedIds = new Set((reversals ?? []).map((r) => r.originalId))
  const flowMovs = (movs ?? []).filter((m) => m.type !== 'estorno' && !reversedIds.has(m.refId ?? ''))
  const pMovs = inP(flowMovs)
  const deaths = inP(deathOps).reduce((s, d) => s + d.qty, 0)
  const vaccApplied = inP(vaccinations.filter((v) => v.status === 'aplicada')).reduce((s, v) => s + v.qty, 0)
  const alerts = vaccineAlerts(vaccinations, t, 30, daysBetween)

  const months = period.mode === 'month' ? monthsBetween(`${shiftMonth(period.month, -11)}-01`, period.end) : monthsBetween(period.start, period.end).slice(-24)
  const evolution = useMemo(() => movs ? herdEvolution(movs, months, (ym) => monthRange(ym)[1]) : [], [movs, months])
  const inOut = months.map((ym) => {
    const m = flowMovs.filter((x) => x.date.startsWith(ym) && x.type !== 'troca_categoria')
    return { label: monthLabel(ym), values: [m.filter((x) => x.total > 0).reduce((s, x) => s + x.total, 0), -m.filter((x) => x.total < 0).reduce((s, x) => s + x.total, 0)] }
  })
  const weightEvo = months.map((ym) => {
    const w = (weighings ?? []).filter((x) => !x.supersededBy && x.date.startsWith(ym))
    const n = w.reduce((s, x) => s + x.qty, 0)
    return { label: monthLabel(ym), value: n ? Math.round(w.reduce((s, x) => s + x.avgKg * x.qty, 0) / n) : null }
  })

  if (!ready) return <Spinner />
  if (!categories.length) return (
    <Card><Empty icon={<Beef className="size-5" />} title="Comece o controle do rebanho" text="Crie as categorias de animais e depois cadastre seus lotes."
      action={canEdit && <Button onClick={() => seedAnimalCategories(farm!.id)}>Criar categorias padrão</Button>} /></Card>
  )
  return (
    <>
      <PageHeader title="Painel do rebanho" subtitle={farm!.name} actions={canEdit && <Link to="/rebanho/entrada"><Button>Registrar entrada</Button></Link>} />
      <div className="mb-5"><PeriodPicker value={period} onChange={setPeriod} /></div>
      {err && <div className="mb-4"><ErrorBox>{err}</ErrorBox></div>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total de animais" value={number(total)} icon={<Beef className="size-4" />} sub={`${bySex.M} machos · ${bySex.F} fêmeas`} />
        <Stat label="Lotes ativos" value={String(activeLots.length)} icon={<Layers className="size-4" />} tone="stone" />
        <Stat label="Peso estimado do rebanho" value={coverage ? `${number(Math.round(totalKg))} kg` : '—'} icon={<Scale className="size-4" />} tone="stone"
          sub={coverage ? `${number(Math.round(totalKg / arroba.vivo))} @ vivo (${arroba.vivo} kg) · ${coverage}/${total} cab. com peso` : 'Registre pesagens ou pesos de entrada'} />
        <Stat label="Vacinações no período" value={number(vaccApplied)} icon={<Syringe className="size-4" />} sub={`${alerts.length} próximas/atrasadas`} tone="earth" />
        <Stat label="Compras no período" value={`${inP(purchases).reduce((s, p) => s + p.qty, 0)} cab.`} icon={<ShoppingCart className="size-4" />} sub={money(inP(purchases).reduce((s, p) => s + p.amount, 0))} />
        <Stat label="Vendas no período" value={`${inP(sales).reduce((s, p) => s + p.qty, 0)} cab.`} icon={<Tag className="size-4" />} sub={`Líquido ${money(inP(sales).reduce((s, p) => s + p.net, 0))}`} />
        <Stat label="Mortes no período" value={String(deaths)} icon={<Skull className="size-4" />} tone="stone" />
        <Stat label="Saídas totais no período" value={String(-pMovs.filter((m) => m.total < 0 && m.type !== 'transf_saida').reduce((s, m) => s + m.total, 0))} icon={<TrendingDown className="size-4" />} tone="stone" sub="Vendas, mortes e ajustes" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card title="Evolução da quantidade de animais" className="lg:col-span-2"><div className="p-4">{movs ? <LineChart points={evolution.map((e) => ({ label: monthLabel(e.ym), value: e.total }))} /> : <Spinner />}</div></Card>
        <Card title={<span className="flex items-center gap-2"><Syringe className="size-4 text-amber-600" />Vacinações próximas</span>} action={<Link to="/rebanho/vacinacao" className="text-xs text-brand-700 hover:underline dark:text-brand-300">Ver</Link>}>
          {alerts.length === 0 ? <Empty icon={<CalendarClock className="size-5" />} title="Nada nos próximos 30 dias" /> : (
            <ul className="divide-y divide-stone-100 dark:divide-stone-800">{alerts.slice(0, 6).map((a) => (
              <li key={a.v.id + a.kind} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                {a.daysLeft < 0 ? <AlertTriangle className="size-4 text-red-600" /> : <CalendarClock className="size-4 text-amber-600" />}
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{a.v.vaccine}{a.kind === 'reforco' ? ' (reforço)' : ''}</div><div className="truncate text-xs text-stone-500">{lotName(a.v.lotId)} · {fmtDate(a.due)}</div></div>
                <Badge tone={a.daysLeft < 0 ? 'red' : 'stone'}>{a.daysLeft < 0 ? `${-a.daysLeft}d atraso` : `${a.daysLeft}d`}</Badge>
              </li>))}</ul>
          )}
        </Card>
        <Card title="Distribuição por categoria"><div className="p-4">{total ? <BarList format={(n) => `${n} cab.`} items={Object.entries(byCat).filter(([, q]) => q).sort((a, b) => b[1] - a[1]).map(([c, q]) => ({ label: catName(c), value: q }))} /> : <Empty title="Sem animais" />}</div></Card>
        <Card title="Distribuição por lote"><div className="p-4">{total ? <BarList format={(n) => `${n} cab.`} items={activeLots.filter((l) => l.count).sort((a, b) => b.count - a.count).slice(0, 10).map((l) => ({ label: l.name, value: l.count }))} /> : <Empty title="Sem animais" />}</div></Card>
        <Card title="Entradas e saídas por mês"><div className="p-4 pt-8">{movs ? <Bars data={inOut} series={[{ name: 'Entradas', color: 'var(--color-brand-600)' }, { name: 'Saídas', color: '#c25b4a' }]} /> : <Spinner />}</div></Card>
        <Card title="Evolução do peso médio (pesagens)" className="lg:col-span-3"><div className="p-4">{weightEvo.some((w) => w.value != null) ? <LineChart points={weightEvo} format={(n) => `${n} kg`} /> : <Empty icon={<Scale className="size-5" />} title="Sem pesagens no período" action={<Link to="/rebanho/pesagem"><Button variant="secondary">Registrar pesagem</Button></Link>} />}</div></Card>
      </div>
    </>
  )
}
