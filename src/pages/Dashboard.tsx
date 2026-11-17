import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, BellRing, CalendarClock, Plus, Receipt, Scale, TrendingUp, Users, Wallet, Wrench } from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import { useEntries, useFarmCollection, useRevenues } from '../lib/db'
import { daysBetween } from '../lib/format'
import { vaccineAlerts, type Vaccination } from '../lib/herd'
import { fmtQty, stockStatus, type StockItem } from '../lib/stock'
import { fmtDate, money, monthLabel, monthsBetween, shiftMonth, today } from '../lib/format'
import { alertMilestone, entryCategory, groupTotals, obligationAlerts, obligationName, sum } from '../lib/domain'
import { Badge, Button, Card, Empty, ErrorBox, PageHeader, Spinner, Stat } from '../components/ui'
import { BarList, MonthBars } from '../components/Charts'
import { PeriodPicker, periodFromMonth, type Period } from '../components/PeriodPicker'

/** Alertas do campo num só lugar: estoque para repor e vacinas vencendo (15 dias) ou atrasadas. */
function FieldAlerts({ farmId }: { farmId: string }) {
  const stock = useFarmCollection<StockItem>(farmId, 'stockItems')
  const vac = useFarmCollection<Vaccination>(farmId, 'vaccinations')
  const t = today()
  const low = stock.data.filter((i) => i.active && stockStatus(i) !== 'ok').sort((a, b) => a.qtyMilli - b.qtyMilli)
  const vacc = vaccineAlerts(vac.data, t, 15, daysBetween)
  if (!low.length && !vacc.length) return null
  return (
    <Card title={<span className="flex items-center gap-2"><AlertTriangle className="size-4 text-amber-600" />Atenção no campo</span>} className="mt-5">
      <ul className="divide-y divide-stone-100 text-sm dark:divide-stone-800">
        {vacc.slice(0, 6).map((a) => (
          <li key={a.v.id + a.kind}><Link to="/rebanho/vacinacao" className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/40">
            <Badge tone={a.daysLeft < 0 ? 'red' : 'amber'}>{a.daysLeft < 0 ? `Atrasada ${-a.daysLeft}d` : a.daysLeft === 0 ? 'Hoje' : `${a.daysLeft}d`}</Badge>
            <span className="flex-1">{a.kind === 'reforco' ? 'Reforço' : 'Vacinação programada'}: <b>{a.v.vaccine}</b> · {a.v.qty} cab.</span>
            <span className="tabular text-stone-500">{fmtDate(a.due)}</span>
          </Link></li>
        ))}
        {low.slice(0, 6).map((i) => (
          <li key={i.id}><Link to={`/estoque/item/${i.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/40">
            <Badge tone={stockStatus(i) === 'zerado' ? 'red' : 'amber'}>{stockStatus(i) === 'zerado' ? 'Zerado' : 'Repor'}</Badge>
            <span className="flex-1">Estoque: <b>{i.name}</b></span>
            <span className="tabular text-stone-500">{fmtQty(i.qtyMilli, i.unit)}{i.minMilli ? ` / mín. ${fmtQty(i.minMilli, i.unit)}` : ''}</span>
          </Link></li>
        ))}
      </ul>
      {(vacc.length > 6 || low.length > 6) && <p className="border-t border-stone-200 px-4 py-2 text-xs text-stone-500 dark:border-stone-800">Há mais alertas: veja Vacinação e Estoque.</p>}
    </Card>
  )
}

export default function Dashboard() {
  const { farm, collaborators, obligations, canEdit } = useApp()
  const t = today()
  const [period, setPeriod] = useState<Period>(() => periodFromMonth(t.slice(0, 7)))
  // Evolução: até 6 meses terminando no fim do período selecionado.
  const evoStartMonth = period.mode === 'month' ? shiftMonth(period.month, -5) : period.start.slice(0, 7)
  const queryStart = (evoStartMonth + '-01') < period.start ? evoStartMonth + '-01' : period.start
  const { data: all, loading, error } = useEntries(farm!.id, queryStart, period.end)

  const rev = useRevenues(farm!.id, period.start, period.end)
  const revenue = sum(rev.data)
  const inPeriod = useMemo(() => all.filter((e) => e.date >= period.start && e.date <= period.end), [all, period])
  const labor = sum(inPeriod.filter((e) => e.kind === 'labor'))
  const other = sum(inPeriod.filter((e) => e.kind === 'other'))
  const byCategory = groupTotals(inPeriod, entryCategory).slice(0, 8).map((g) => ({ label: g.key, value: g.total }))
  const months = monthsBetween(queryStart, period.end).slice(-12)
  const evolution = months.map((ym) => {
    const m = all.filter((e) => e.date.startsWith(ym))
    return { label: monthLabel(ym), labor: sum(m.filter((e) => e.kind === 'labor')), other: sum(m.filter((e) => e.kind === 'other')) }
  })
  const alertDays = farm!.alertDays?.length ? farm!.alertDays : [30, 15, 7, 0]
  const alerts = obligationAlerts(obligations, t, alertDays)
  const recent = inPeriod.slice(0, 8)

  return (
    <>
      <PageHeader title="Dashboard" subtitle={farm!.name}
        actions={canEdit && <Link to="/despesas/novo"><Button><Plus className="size-4" />Novo lançamento</Button></Link>} />
      <div className="mb-5"><PeriodPicker value={period} onChange={setPeriod} /></div>
      {error && <div className="mb-4"><ErrorBox>{error}</ErrorBox></div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Total de despesas" value={loading ? '…' : money(labor + other)} icon={<Wallet className="size-4" />} />
        <Stat label="Pago a colaboradores" value={loading ? '…' : money(labor)} icon={<Users className="size-4" />} />
        <Stat label="Outras despesas" value={loading ? '…' : money(other)} icon={<Wrench className="size-4" />} tone="earth" />
        <Stat label="Colaboradores ativos" value={String(collaborators.filter((c) => c.active).length)} icon={<Users className="size-4" />} tone="stone"
          sub={`${collaborators.length} cadastrados`} />
        <Stat label="Receitas" value={rev.loading ? '…' : money(revenue)} icon={<TrendingUp className="size-4" />} sub="Vendas de animais e outras" />
        <Stat label="Resultado (receitas − despesas)" value={loading || rev.loading ? '…' : money(revenue - labor - other)} icon={<Scale className="size-4" />} tone={revenue - labor - other >= 0 ? 'brand' : 'earth'} />
      </div>

      <FieldAlerts farmId={farm!.id} />

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card title={<span className="flex items-center gap-2"><BellRing className="size-4 text-amber-600" />Próximos pagamentos e obrigações</span>}
          action={<Link to="/obrigacoes" className="text-xs text-brand-700 hover:underline dark:text-brand-300">Ver todas</Link>} className="lg:col-span-1">
          {alerts.length === 0 ? (
            <Empty icon={<CalendarClock className="size-5" />} title="Nada próximo do vencimento" text={`Avisos a partir de ${Math.max(...alertDays)} dias antes.`} />
          ) : (
            <ul className="divide-y divide-stone-100 dark:divide-stone-800">
              {alerts.slice(0, 8).map(({ obligation: o, daysLeft, level }) => (
                <li key={o.id} className="flex items-start gap-3 px-4 py-3">
                  {level === 'overdue' ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" /> : <CalendarClock className="mt-0.5 size-4 shrink-0 text-amber-600" />}
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-medium">{obligationName(o)}</div>
                    <div className="truncate text-stone-500">{o.collaboratorName} · {fmtDate(o.dueDate)}</div>
                  </div>
                  <Badge tone={level === 'overdue' ? 'red' : level === 'today' ? 'amber' : 'stone'}>
                    {level === 'overdue' ? `Vencida há ${-daysLeft}d` : level === 'today' ? 'Vence hoje' : `${daysLeft}d (aviso ${alertMilestone(daysLeft, alertDays)}d)`}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Despesas por categoria" className="lg:col-span-2">
          <div className="p-4">
            {loading ? <Spinner /> : byCategory.length ? <BarList items={byCategory} /> : <Empty title="Sem despesas no período" />}
          </div>
        </Card>

        <Card title="Evolução mensal" className="lg:col-span-2">
          <div className="p-4 pt-8">{loading ? <Spinner /> : <MonthBars data={evolution} />}</div>
        </Card>

        <Card title="Últimos lançamentos" action={<Link to="/despesas" className="text-xs text-brand-700 hover:underline dark:text-brand-300">Ver todos</Link>}>
          {loading ? <Spinner /> : recent.length === 0 ? (
            <Empty icon={<Receipt className="size-5" />} title="Nenhum lançamento" text="Registre pagamentos e despesas pela planilha." />
          ) : (
            <ul className="divide-y divide-stone-100 dark:divide-stone-800">
              {recent.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{e.kind === 'labor' ? e.collaboratorName : e.description || e.categoryName}</div>
                    <div className="truncate text-xs text-stone-500">{fmtDate(e.date)} · {e.kind === 'labor' ? e.laborTypeName : e.categoryName}</div>
                  </div>
                  <span className="tabular shrink-0 font-medium">{money(e.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
