import { useMemo, useState } from 'react'
import { useApp } from '../../contexts/AppContext'
import { useStock } from '../../contexts/StockContext'
import { useMovementsByPeriod, useReversedIds } from '../../lib/stockHooks'
import { today } from '../../lib/format'
import { buildStockReport, STOCK_CATEGORIES, STOCK_REPORTS, type StockCategory, type StockReportId } from '../../lib/stock'
import { Card, ErrorBox, Field, PageHeader, Spinner } from '../../components/ui'
import { PeriodPicker, periodFromMonth, type Period } from '../../components/PeriodPicker'
import { ReportView } from '../../components/ReportView'

export default function StockReports() {
  const { farm } = useApp()
  const { items, loading } = useStock()
  const [id, setId] = useState<StockReportId>('posicao')
  const [category, setCategory] = useState<StockCategory | 'todas'>('todas')
  const [period, setPeriod] = useState<Period>(periodFromMonth(today().slice(0, 7)))
  const def = STOCK_REPORTS.find((r) => r.id === id)!
  const mv = useMovementsByPeriod(farm!.id, period.start, period.end)
  const reversed = useReversedIds(farm!.id)
  const report = useMemo(() => buildStockReport(id, { items, movements: mv.data, reversed, category, start: period.start, end: period.end }), [id, items, mv.data, reversed, category, period])
  return (
    <>
      <PageHeader title="Relatórios de estoque" subtitle="Exporte em Excel, PDF ou CSV, ou imprima" />
      <Card className="no-print mb-4">
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Relatório"><select className="input" value={id} onChange={(e) => setId(e.target.value as StockReportId)}>{STOCK_REPORTS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></Field>
          <Field label="Categoria"><select className="input" value={category} onChange={(e) => setCategory(e.target.value as StockCategory | 'todas')}>
            <option value="todas">Todas</option>{STOCK_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.plural}</option>)}</select></Field>
          {def.usesPeriod && <div className="sm:col-span-2"><PeriodPicker value={period} onChange={setPeriod} /></div>}
        </div>
      </Card>
      {mv.error && def.usesPeriod && <ErrorBox>{mv.error}</ErrorBox>}
      {loading || (def.usesPeriod && mv.loading) ? <Spinner /> : <ReportView report={report} farmName={farm!.name} />}
    </>
  )
}
