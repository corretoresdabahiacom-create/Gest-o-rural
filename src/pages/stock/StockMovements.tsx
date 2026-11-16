import { useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, ClipboardCheck } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { useStock } from '../../contexts/StockContext'
import { useMovementsByPeriod, useReversedIds } from '../../lib/stockHooks'
import { today } from '../../lib/format'
import { Button, Card, ErrorBox, PageHeader, Spinner } from '../../components/ui'
import { PeriodPicker, periodFromMonth, type Period } from '../../components/PeriodPicker'
import { MovementTable } from '../../components/stock/MovementTable'
import { MovementForm } from '../../components/stock/MovementForm'

export default function StockMovements() {
  const { farm, canEdit } = useApp()
  const { items } = useStock()
  const [period, setPeriod] = useState<Period>(periodFromMonth(today().slice(0, 7)))
  const [mov, setMov] = useState<null | 'entrada' | 'saida' | 'ajuste'>(null)
  const { data, loading, error } = useMovementsByPeriod(farm!.id, period.start, period.end)
  const reversed = useReversedIds(farm!.id)
  return (
    <>
      <PageHeader title="Entradas e saídas" subtitle="Histórico imutável: correções são feitas por estorno"
        actions={canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setMov('entrada')} disabled={!items.some((i) => i.active)}><ArrowDownToLine className="size-4" />Entrada</Button>
            <Button variant="secondary" onClick={() => setMov('saida')} disabled={!items.some((i) => i.qtyMilli > 0)}><ArrowUpFromLine className="size-4" />Saída</Button>
            <Button variant="secondary" onClick={() => setMov('ajuste')} disabled={!items.some((i) => i.active)}><ClipboardCheck className="size-4" />Contagem</Button>
          </div>
        )} />
      <div className="mb-4"><PeriodPicker value={period} onChange={setPeriod} /></div>
      {error && <ErrorBox>Não foi possível carregar as movimentações: {error}</ErrorBox>}
      <Card>{loading ? <Spinner /> : <MovementTable moves={data} reversed={reversed} showItem />}</Card>
      <MovementForm open={!!mov} kind={mov ?? 'entrada'} onClose={() => setMov(null)} />
    </>
  )
}
