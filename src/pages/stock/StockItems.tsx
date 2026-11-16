import { useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { useStock } from '../../contexts/StockContext'
import { STOCK_CATEGORIES, type StockCategory } from '../../lib/stock'
import { Button, Card, PageHeader, Spinner } from '../../components/ui'
import { ItemTable } from '../../components/stock/ItemTable'
import { ItemForm } from '../../components/stock/ItemForm'
import { MovementForm } from '../../components/stock/MovementForm'

export default function StockItems() {
  const { cat } = useParams()
  const { canEdit } = useApp()
  const { items, loading } = useStock()
  const [form, setForm] = useState(false)
  const [mov, setMov] = useState(false)
  const def = STOCK_CATEGORIES.find((c) => c.id === cat)
  if (!def) return <Navigate to="/estoque" replace />
  if (loading) return <Spinner />
  const list = items.filter((i) => i.category === (def.id as StockCategory))
  return (
    <>
      <PageHeader title={def.plural} subtitle={def.hint}
        actions={canEdit && <div className="flex gap-2"><Button variant="secondary" onClick={() => setMov(true)} disabled={!list.some((i) => i.active)}>Registrar entrada</Button><Button onClick={() => setForm(true)}><Plus className="size-4" />Novo item</Button></div>} />
      <Card><ItemTable items={list} /></Card>
      <ItemForm open={form} onClose={() => setForm(false)} category={def.id} />
      <MovementForm open={mov} onClose={() => setMov(false)} />
    </>
  )
}
