import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, ClipboardCheck, Pencil, Power } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { useStock } from '../../contexts/StockContext'
import { useMovementsByItem, useReversedIds } from '../../lib/stockHooks'
import { updateItem } from '../../lib/stockDb'
import { friendlyError } from '../../lib/db'
import { money } from '../../lib/format'
import { avgCostCents, categoryLabel, fmtQty, STATUS_LABEL, stockStatus } from '../../lib/stock'
import { Badge, Button, Card, Empty, ErrorBox, PageHeader, Spinner, Stat, useToast } from '../../components/ui'
import { MovementTable } from '../../components/stock/MovementTable'
import { MovementForm } from '../../components/stock/MovementForm'
import { ItemForm } from '../../components/stock/ItemForm'

export default function StockItemDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { farm, canEdit } = useApp()
  const { byId, loading } = useStock()
  const toast = useToast()
  const mv = useMovementsByItem(farm!.id, id!)
  const reversed = useReversedIds(farm!.id)
  const [form, setForm] = useState(false)
  const [mov, setMov] = useState<null | 'entrada' | 'saida' | 'ajuste'>(null)
  if (loading) return <Spinner />
  const item = byId(id!)
  if (!item) return <Empty title="Item não encontrado" action={<Button onClick={() => nav('/estoque')}>Voltar ao estoque</Button>} />
  const st = stockStatus(item)
  async function toggle() {
    try { await updateItem(farm!.id, item!.id, { active: !item!.active }); toast('success', item!.active ? 'Item inativado.' : 'Item reativado.') } catch (e) { toast('error', friendlyError(e)) }
  }
  return (
    <>
      <Link to={`/estoque/c/${item.category}`} className="no-print mb-3 inline-flex items-center gap-1 text-sm text-stone-500 hover:underline"><ArrowLeft className="size-4" />{categoryLabel(item.category)}</Link>
      <PageHeader title={item.name} subtitle={`${categoryLabel(item.category)} · unidade: ${item.unit}${item.supplier ? ` · fornecedor: ${item.supplier}` : ''}`}
        actions={canEdit && (
          <div className="flex flex-wrap gap-2">
            {item.active && <Button onClick={() => setMov('entrada')}><ArrowDownToLine className="size-4" />Entrada</Button>}
            <Button variant="secondary" onClick={() => setMov('saida')} disabled={item.qtyMilli <= 0}><ArrowUpFromLine className="size-4" />Saída</Button>
            <Button variant="secondary" onClick={() => setMov('ajuste')} disabled={!item.active}><ClipboardCheck className="size-4" />Contagem</Button>
            <Button variant="secondary" onClick={() => setForm(true)}><Pencil className="size-4" />Editar</Button>
            <Button variant="ghost" onClick={toggle}><Power className="size-4" />{item.active ? 'Inativar' : 'Reativar'}</Button>
          </div>
        )} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Saldo" value={fmtQty(item.qtyMilli, item.unit)} icon={<ArrowDownToLine className="size-5" />} sub={item.minMilli ? `mínimo ${fmtQty(item.minMilli, item.unit)}` : undefined} />
        <Stat label="Valor em estoque" value={money(item.valueCents)} icon={<ArrowDownToLine className="size-5" />} tone="earth" />
        <Stat label="Custo médio" value={item.qtyMilli > 0 ? money(Math.round(avgCostCents(item))) : '—'} icon={<ArrowDownToLine className="size-5" />} tone="stone" sub={`por ${item.unit}`} />
        <div className="flex items-center"><Badge tone={st === 'ok' ? 'green' : st === 'baixo' ? 'amber' : 'red'}>{STATUS_LABEL[st]}</Badge></div>
      </div>
      {item.notes && <p className="mb-4 text-sm text-stone-600 dark:text-stone-300">{item.notes}</p>}
      {mv.error && <ErrorBox>{mv.error}</ErrorBox>}
      <Card title="Histórico de movimentações">{mv.loading ? <Spinner /> : <MovementTable moves={mv.data} reversed={reversed} />}</Card>
      <ItemForm open={form} onClose={() => setForm(false)} editing={item} />
      <MovementForm open={!!mov} kind={mov ?? 'entrada'} itemId={item.id} onClose={() => setMov(null)} />
    </>
  )
}
