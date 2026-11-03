import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, BellRing, CalendarClock, Plus, Receipt, Users, Wallet, Wrench } from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import { useEntries } from '../lib/db'
import { fmtDate, money, monthLabel, monthsBetween, shiftMonth, today } from '../lib/format'
import { alertMilestone, entryCategory, groupTotals, obligationAlerts, obligationName, sum } from '../lib/domain'
import { Badge, Button, Card, Empty, ErrorBox, PageHeader, Spinner, Stat } from '../components/ui'
import { BarList, MonthBars } from '../components/Charts'
import { PeriodPicker, periodFromMonth, type Period } from '../components/PeriodPicker'

export default function Dashboard() {
  const { farm, collaborators, obligations, canEdit } = useApp()
  const t = today()
  const [period, setPeriod] = useState<Period>(() => periodFromMonth(t.slice(0, 7)))
  // Evolução: até 6 meses terminando no fim do período selecionado.
  const evoStartMonth = period.mode === 'month' ? shiftMonth(period.month, -5) : period.start.slice(0, 7)
  const queryStart = (evoStartMonth + '-01') < period.start ? evoStartMonth + '-01' : period.start
  const { data: all, loading, error } = useEntries(farm!.id, queryStart, period.end)

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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total de despesas" value={loading ? '…' : money(labor + other)} icon={<Wallet className="size-4" />} />
        <Stat label="Pago a colaboradores" value={loading ? '…' : money(labor)} icon={<Users className="size-4" />} />
        <Stat label="Outras despesas" value={loading ? '…' : money(other)} icon={<Wrench className="size-4" />} tone="earth" />
        <Stat label="Colaboradores ativos" value={String(collaborators.filter((c) => c.active).length)} icon={<Users className="size-4" />} tone="stone"
          sub={`${collaborators.length} cadastrados`} />
      </div>

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
