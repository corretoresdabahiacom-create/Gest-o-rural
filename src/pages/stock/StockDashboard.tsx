import { useState } from 'react'
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Boxes, ClipboardCheck, PackageX, Plus, Wallet } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { useStock } from '../../contexts/StockContext'
import { money } from '../../lib/format'
import { stockStatus, stockTotals } from '../../lib/stock'
import { Button, Card, Empty, PageHeader, Spinner, Stat } from '../../components/ui'
import { ItemTable } from '../../components/stock/ItemTable'
import { ItemForm } from '../../components/stock/ItemForm'
import { MovementForm } from '../../components/stock/MovementForm'

export default function StockDashboard() {
  const { canEdit } = useApp()
  const { items, loading, error } = useStock()
  const [item, setItem] = useState(false)
  const [mov, setMov] = useState<null | 'entrada' | 'saida' | 'ajuste'>(null)
  if (loading) return <Spinner />
  const t = stockTotals(items)
  const alerts = items.filter((i) => i.active && stockStatus(i) !== 'ok')
  return (
    <>
      <PageHeader title="Controle de estoque" subtitle="Saldo, valor e alertas de insumos, medicamentos, alimentação, combustíveis e ferramentas"
        actions={canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setMov('entrada')} disabled={!items.some((i) => i.active)}><ArrowDownToLine className="size-4" />Entrada</Button>
            <Button variant="secondary" onClick={() => setMov('saida')} disabled={!items.some((i) => i.qtyMilli > 0)}><ArrowUpFromLine className="size-4" />Saída</Button>
            <Button variant="secondary" onClick={() => setMov('ajuste')} disabled={!items.some((i) => i.active)}><ClipboardCheck className="size-4" />Contagem</Button>
            <Button variant="secondary" onClick={() => setItem(true)}><Plus className="size-4" />Novo item</Button>
          </div>
        )} />
      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">Não foi possível carregar o estoque. Verifique se as regras do Firestore foram publicadas.</p>}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Itens ativos" value={String(t.count)} icon={<Boxes className="size-5" />} />
        <Stat label="Valor em estoque" value={money(t.valueCents)} icon={<Wallet className="size-5" />} tone="earth" sub="ao custo médio" />
        <Stat label="Abaixo do mínimo" value={String(t.low)} icon={<AlertTriangle className="size-5" />} tone="stone" />
        <Stat label="Zerados" value={String(t.zero)} icon={<PackageX className="size-5" />} tone="stone" />
      </div>
      {alerts.length > 0 && <Card title="Atenção: reposição necessária" className="mb-5"><ItemTable items={alerts} showCategory /></Card>}
      <Card title="Todos os itens">
        {items.length === 0
          ? <Empty title="Estoque vazio" text="Cadastre o primeiro item. Se já tem produto em estoque, informe o saldo inicial no cadastro." action={canEdit ? <Button onClick={() => setItem(true)}><Plus className="size-4" />Novo item</Button> : undefined} />
          : <ItemTable items={items} showCategory />}
      </Card>
      <ItemForm open={item} onClose={() => setItem(false)} />
      <MovementForm open={!!mov} kind={mov ?? 'entrada'} onClose={() => setMov(null)} />
    </>
  )
}
