import { useEffect, useState } from 'react'
import { useApp } from '../../contexts/AppContext'
import { friendlyError } from '../../lib/db'
import { centsToInput, parseMoney, today } from '../../lib/format'
import { createItem, updateItem } from '../../lib/stockDb'
import { parseQty, qtyToInput, STOCK_CATEGORIES, STOCK_UNITS, StockError, type StockCategory, type StockItem } from '../../lib/stock'
import { Button, ErrorBox, Field, Modal, useToast } from '../ui'

export function ItemForm({ open, onClose, editing, category, onCreated }: { open: boolean; onClose: () => void; editing?: StockItem | null; category?: StockCategory; onCreated?: (id: string) => void }) {
  const { farm } = useApp()
  const toast = useToast()
  const blank = { name: '', category: (category ?? 'insumo') as StockCategory, unit: 'kg', min: '', supplier: '', notes: '', qty: '', total: '', date: today() }
  const [f, setF] = useState(blank)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    setErr('')
    setF(editing ? { ...blank, name: editing.name, category: editing.category, unit: editing.unit, min: qtyToInput(editing.minMilli), supplier: editing.supplier ?? '', notes: editing.notes ?? '' } : blank)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, category])
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  async function save() {
    if (!f.name.trim()) return setErr('Informe o nome do item.')
    const minMilli = f.min.trim() ? parseQty(f.min) : null
    if (f.min.trim() && minMilli == null) return setErr('Estoque mínimo inválido.')
    const qty = f.qty.trim() ? parseQty(f.qty) : 0
    if (f.qty.trim() && qty == null) return setErr('Saldo inicial inválido.')
    const total = f.total.trim() ? parseMoney(f.total) : 0
    if (f.total.trim() && total == null) return setErr('Valor do saldo inicial inválido.')
    setSaving(true); setErr('')
    try {
      const meta = { name: f.name, category: f.category, unit: f.unit, minMilli, supplier: f.supplier, notes: f.notes }
      if (editing) { await updateItem(farm!.id, editing.id, { name: f.name, unit: f.unit, minMilli, supplier: f.supplier, notes: f.notes }); toast('success', 'Item atualizado.') }
      else {
        const id = await createItem(farm!.id, meta, qty && qty > 0 ? { qtyMilli: qty, totalCents: total ?? 0, date: f.date } : undefined)
        toast('success', 'Item cadastrado.'); onCreated?.(id)
      }
      onClose()
    } catch (e) { setErr(e instanceof StockError ? e.message : friendlyError(e)) } finally { setSaving(false) }
  }
  return (
    <Modal open={open} onClose={() => !saving && onClose()} title={editing ? 'Editar item' : 'Novo item de estoque'} wide
      footer={<><Button variant="secondary" disabled={saving} onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome *" className="sm:col-span-2"><input className="input" value={f.name} onChange={set('name')} maxLength={120} placeholder="Ex.: Sal mineral 25 kg, Vacina aftosa, Diesel S10" autoFocus /></Field>
        <Field label="Categoria *" hint={editing ? 'A categoria não pode ser alterada.' : STOCK_CATEGORIES.find((c) => c.id === f.category)?.hint}>
          <select className="input" value={f.category} onChange={set('category')} disabled={!!editing}>{STOCK_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
        </Field>
        <Field label="Unidade *"><select className="input" value={f.unit} onChange={set('unit')}>{STOCK_UNITS.map((u) => <option key={u}>{u}</option>)}</select></Field>
        <Field label="Estoque mínimo (alerta)" hint="Avisa quando o saldo chegar a este valor."><input className="input" inputMode="decimal" value={f.min} onChange={set('min')} placeholder="Ex.: 50" /></Field>
        <Field label="Fornecedor habitual"><input className="input" value={f.supplier} onChange={set('supplier')} maxLength={120} /></Field>
        <Field label="Observações" className="sm:col-span-2"><input className="input" value={f.notes} onChange={set('notes')} maxLength={1000} /></Field>
        {!editing && (
          <div className="grid gap-4 rounded-lg border border-dashed border-stone-300 p-3 sm:col-span-2 sm:grid-cols-3 dark:border-stone-700">
            <p className="text-xs text-stone-500 sm:col-span-3">Saldo inicial (opcional): se já existe produto em estoque, informe a quantidade e quanto custou no total. Fica registrado como “Saldo inicial”.</p>
            <Field label="Quantidade"><input className="input" inputMode="decimal" value={f.qty} onChange={set('qty')} /></Field>
            <Field label="Valor total (R$)"><input className="input" inputMode="decimal" value={f.total} onChange={set('total')} placeholder={centsToInput(0)} /></Field>
            <Field label="Data"><input type="date" className="input" value={f.date} max={today()} onChange={set('date')} /></Field>
          </div>
        )}
        {err && <div className="sm:col-span-2"><ErrorBox>{err}</ErrorBox></div>}
      </div>
    </Modal>
  )
}
