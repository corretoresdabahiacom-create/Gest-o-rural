import { useEffect, useState } from 'react'
import { serverTimestamp, writeBatch } from 'firebase/firestore'
import { useApp } from '../../contexts/AppContext'
import { useStock } from '../../contexts/StockContext'
import { db } from '../../lib/firebase'
import { farmDoc, friendlyError, newId } from '../../lib/db'
import { money, parseMoney, today } from '../../lib/format'
import { saveMovement } from '../../lib/stockDb'
import { ENTRY_REASONS, EXIT_REASONS, fmtQty, parseQty, planAdjust, planExit, StockError } from '../../lib/stock'
import { Button, ErrorBox, Field, Modal, useToast } from '../ui'

type Kind = 'entrada' | 'saida' | 'ajuste'
export function MovementForm({ open, onClose, itemId, kind = 'entrada' }: { open: boolean; onClose: () => void; itemId?: string; kind?: Kind }) {
  const { farm, categories } = useApp()
  const { items, lots, byId } = useStock()
  const toast = useToast()
  const blank = { opId: '', type: kind, itemId: itemId ?? '', date: today(), qty: '', total: '', reason: kind === 'entrada' ? 'compra' : 'consumo', party: '', lotId: '', batchCode: '', expiryDate: '', note: '', finance: true }
  const [f, setF] = useState(blank)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    setErr('')
    setF({ ...blank, opId: newId(farm!.id, 'stockMovements') })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemId, kind])
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const item = byId(f.itemId)
  const qty = parseQty(f.qty)
  const total = f.total.trim() ? parseMoney(f.total) : 0

  let preview = ''
  if (item && qty != null) {
    try {
      if (f.type === 'saida') { const d = planExit(item, qty); preview = `Saldo após a saída: ${fmtQty(item.qtyMilli + d.qtyDelta, item.unit)} · custo médio baixado: ${money(-d.valueDelta)}` }
      else if (f.type === 'ajuste') { const d = planAdjust(item, qty); preview = `Ajuste de ${d.qtyDelta > 0 ? '+' : ''}${fmtQty(d.qtyDelta, item.unit)} (${money(Math.abs(d.valueDelta))} ao custo médio)` }
      else preview = `Saldo após a entrada: ${fmtQty(item.qtyMilli + qty, item.unit)}${total ? ` · custo unitário: ${money(Math.round(total / (qty / 1000)))}` : ''}`
    } catch (e) { preview = e instanceof StockError ? e.message : '' }
  }

  async function save() {
    if (!item) return setErr('Selecione o item.')
    if (qty == null || (f.type !== 'ajuste' && qty <= 0)) return setErr(f.type === 'ajuste' ? 'Informe a quantidade contada.' : 'Informe uma quantidade válida.')
    if (f.type === 'entrada' && total == null) return setErr('Valor total inválido.')
    if (f.type === 'saida' && f.reason === 'aplicacao' && !f.lotId) return setErr('Selecione o lote de animais que recebeu a aplicação.')
    setSaving(true); setErr('')
    try {
      let finance: { categoryId: string; categoryName: string } | null = null
      if (f.type === 'entrada' && f.finance && (total ?? 0) > 0) {
        let c = categories.find((x) => x.name.toLowerCase() === 'compra de estoque')
        if (!c) {
          const id = newId(farm!.id, 'expenseCategories'); const b = writeBatch(db)
          b.set(farmDoc(farm!.id, 'expenseCategories', id), { name: 'Compra de estoque', active: true, createdAt: serverTimestamp() }); await b.commit()
          c = { id, name: 'Compra de estoque', active: true }
        }
        finance = { categoryId: c.id, categoryName: c.name }
      }
      const lot = lots.find((l) => l.id === f.lotId)
      const r = await saveMovement(farm!.id, f.opId, {
        itemId: item.id, type: f.type, date: f.date, qtyMilli: qty, totalCents: total ?? 0, reason: f.reason, party: f.party, lotId: lot?.id ?? null, lotName: lot?.name ?? null,
        batchCode: f.batchCode, expiryDate: f.expiryDate, note: f.note, finance,
      })
      toast('success', r === 'already-saved' ? 'Esta movimentação já estava registrada.' : 'Movimentação registrada.')
      onClose()
    } catch (e) { setErr(e instanceof StockError ? e.message : friendlyError(e)) } finally { setSaving(false) }
  }

  const title = f.type === 'entrada' ? 'Registrar entrada' : f.type === 'saida' ? 'Registrar saída' : 'Ajuste de contagem física'
  return (
    <Modal open={open} onClose={() => !saving && onClose()} title={title} wide
      footer={<><Button variant="secondary" disabled={saving} onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Registrar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo"><select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Kind, reason: e.target.value === 'entrada' ? 'compra' : e.target.value === 'saida' ? 'consumo' : 'contagem' })}>
          <option value="entrada">Entrada</option><option value="saida">Saída</option><option value="ajuste">Ajuste de contagem física</option></select></Field>
        <Field label="Data"><input type="date" className="input" value={f.date} max={today()} onChange={set('date')} /></Field>
        <Field label="Item *" className="sm:col-span-2">
          <select className="input" value={f.itemId} onChange={set('itemId')}>
            <option value="">Selecione…</option>
            {items.filter((i) => i.active).map((i) => <option key={i.id} value={i.id}>{i.name} — saldo {fmtQty(i.qtyMilli, i.unit)}</option>)}
          </select>
        </Field>
        <Field label={f.type === 'ajuste' ? `Quantidade contada (${item?.unit ?? ''}) *` : `Quantidade (${item?.unit ?? ''}) *`} hint={f.type === 'ajuste' ? 'O saldo passa a ser exatamente esta quantidade.' : undefined}>
          <input className="input" inputMode="decimal" value={f.qty} onChange={set('qty')} autoFocus />
        </Field>
        {f.type === 'entrada' && <Field label="Valor total (R$)" hint="Deixe vazio ou 0 para doação/bonificação."><input className="input" inputMode="decimal" value={f.total} onChange={set('total')} /></Field>}
        {f.type !== 'ajuste' && (
          <Field label="Motivo"><select className="input" value={f.reason} onChange={set('reason')}>
            {Object.entries(f.type === 'entrada' ? ENTRY_REASONS : EXIT_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        )}
        {f.type === 'entrada' && <Field label="Fornecedor"><input className="input" value={f.party} onChange={set('party')} maxLength={120} placeholder={item?.supplier} /></Field>}
        {f.type === 'saida' && (
          <Field label={f.reason === 'aplicacao' ? 'Lote de animais *' : 'Lote de animais (opcional)'} hint="Relaciona o consumo ao lote, para o custo de alimentação e sanidade.">
            <select className="input" value={f.lotId} onChange={set('lotId')}><option value="">—</option>{lots.filter((l) => l.active).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          </Field>
        )}
        {f.type === 'saida' && <Field label="Destino / responsável"><input className="input" value={f.party} onChange={set('party')} maxLength={120} placeholder="Ex.: pasto 3, trator 1, nome do funcionário" /></Field>}
        {f.type === 'entrada' && item && (item.category === 'medicamento' || item.category === 'alimentacao') && (
          <>
            <Field label="Lote do produto"><input className="input" value={f.batchCode} onChange={set('batchCode')} maxLength={60} /></Field>
            <Field label="Validade"><input type="date" className="input" value={f.expiryDate} onChange={set('expiryDate')} /></Field>
          </>
        )}
        <Field label="Observação" className="sm:col-span-2"><input className="input" value={f.note} onChange={set('note')} maxLength={500} /></Field>
        {f.type === 'entrada' && (
          <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={f.finance} onChange={(e) => setF({ ...f, finance: e.target.checked })} />
            Lançar também como despesa no financeiro (categoria “Compra de estoque”), uma única vez. Só vale se houver valor.</label>
        )}
        {preview && <p className="rounded-lg bg-stone-50 p-3 text-sm text-stone-700 sm:col-span-2 dark:bg-stone-800/50 dark:text-stone-200">{preview}</p>}
        {err && <div className="sm:col-span-2"><ErrorBox>{err}</ErrorBox></div>}
      </div>
    </Modal>
  )
}
