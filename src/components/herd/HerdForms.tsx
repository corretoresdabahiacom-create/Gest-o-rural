import { useEffect, useState } from 'react'
import { useApp } from '../../contexts/AppContext'
import { useHerd } from '../../contexts/HerdContext'
import { createLot, registerAnimal, updateAnimalMeta, updateLotMeta, HerdError } from '../../lib/herdDb'
import { friendlyError } from '../../lib/db'
import { centsToInput, parseMoney, today } from '../../lib/format'
import { balanceKey, type Animal, type HerdLot, type LotSex, type Sex } from '../../lib/herd'
import { Button, ErrorBox, Field, Modal, useToast } from '../ui'
import { CategorySexFields } from './LotKeyPicker'

const num = (s: string) => { const n = Number(s.replace(',', '.')); return s.trim() && Number.isFinite(n) ? n : null }
export const herdErr = (e: unknown) => (e instanceof HerdError ? e.message : friendlyError(e))

export function LotForm({ open, onClose, editing }: { open: boolean; onClose: () => void; editing?: HerdLot | null }) {
  const { farm } = useApp()
  const { categories } = useHerd()
  const toast = useToast()
  const blank = { name: '', code: '', categoryId: '', sex: 'X' as LotSex, formedAt: today(), origin: 'compra', sellerName: '', buyerName: '', notes: '', qty: '', initCat: '', initSex: '' as Sex | '', avgKg: '' }
  const [f, setF] = useState(blank)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    setErr('')
    setF(editing ? { ...blank, name: editing.name, code: editing.code ?? '', categoryId: editing.categoryId ?? '', sex: editing.sex, formedAt: editing.formedAt ?? '', origin: editing.origin ?? '', sellerName: editing.sellerName ?? '', buyerName: editing.buyerName ?? '', notes: editing.notes ?? '' } : blank)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing])
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  async function save() {
    if (!f.name.trim()) return setErr('Informe o nome do lote.')
    const qty = Number(f.qty || 0)
    if (!editing && qty > 0 && (!(f.initCat || f.categoryId) || !(f.initSex || (f.sex !== 'X' && f.sex)))) return setErr('Para a quantidade inicial, informe categoria e sexo.')
    setSaving(true); setErr('')
    const meta = { name: f.name.trim(), code: f.code.trim(), categoryId: f.categoryId || undefined, sex: f.sex, formedAt: f.formedAt || undefined, origin: f.origin, sellerName: f.sellerName.trim(), buyerName: f.buyerName.trim(), notes: f.notes.trim() }
    try {
      if (editing) await updateLotMeta(farm!.id, editing.id, meta)
      else await createLot(farm!.id, meta, qty > 0 ? { categoryId: f.initCat || f.categoryId, sex: (f.initSex || f.sex) as Sex, qty, avgKg: num(f.avgKg) } : undefined)
      toast('success', editing ? 'Lote atualizado.' : 'Lote criado.')
      onClose()
    } catch (e) { setErr(herdErr(e)) } finally { setSaving(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar lote' : 'Novo lote'} wide
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome do lote *"><input className="input" value={f.name} onChange={set('name')} placeholder="Ex.: Bois de engorda 01" maxLength={80} autoFocus /></Field>
        <Field label="Identificação"><input className="input" value={f.code} onChange={set('code')} placeholder="Ex.: L01" maxLength={30} /></Field>
        <Field label="Categoria predominante">
          <select className="input" value={f.categoryId} onChange={set('categoryId')}>
            <option value="">—</option>{categories.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Sexo"><select className="input" value={f.sex} onChange={set('sex')}><option value="X">Misto</option><option value="M">Machos</option><option value="F">Fêmeas</option></select></Field>
        <Field label="Data de formação"><input type="date" className="input" value={f.formedAt} onChange={set('formedAt')} /></Field>
        <Field label="Origem dos animais"><select className="input" value={f.origin} onChange={set('origin')}><option value="compra">Compra</option><option value="nascimento">Nascimento</option><option value="transferencia">Transferência</option><option value="existente">Rebanho existente</option></select></Field>
        <Field label="Vendedor (se compra)"><input className="input" value={f.sellerName} onChange={set('sellerName')} maxLength={120} /></Field>
        <Field label="Responsável pela aquisição"><input className="input" value={f.buyerName} onChange={set('buyerName')} maxLength={120} /></Field>
        {!editing && (
          <div className="grid gap-4 rounded-lg border border-dashed border-stone-300 p-3 sm:col-span-2 sm:grid-cols-4 dark:border-stone-700">
            <p className="text-xs text-stone-500 sm:col-span-4">Saldo inicial (opcional). Para registrar uma compra com vendedor e valores, use <b>Entrada</b> depois de criar o lote.</p>
            <Field label="Quantidade inicial"><input className="input" inputMode="numeric" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value.replace(/\D/g, '') })} placeholder="0" /></Field>
            <CategorySexFields categoryId={f.initCat || f.categoryId} sex={f.initSex || (f.sex === 'X' ? '' : f.sex)} lotSex={f.sex} onChange={(c, s) => setF({ ...f, initCat: c, initSex: s })} />
            <Field label="Peso médio inicial (kg)"><input className="input" inputMode="decimal" value={f.avgKg} onChange={set('avgKg')} /></Field>
          </div>
        )}
        {editing && <p className="text-xs text-stone-500 sm:col-span-2">A quantidade do lote só muda por movimentações (entrada, saída, morte, transferência ou ajuste de inventário), preservando o histórico.</p>}
        <Field label="Observações" className="sm:col-span-2"><textarea className="input" rows={2} value={f.notes} onChange={set('notes')} maxLength={1000} /></Field>
        {err && <div className="sm:col-span-2"><ErrorBox>{err}</ErrorBox></div>}
      </div>
    </Modal>
  )
}

export function AnimalForm({ open, onClose, editing, lotId }: { open: boolean; onClose: () => void; editing?: Animal | null; lotId?: string }) {
  const { farm } = useApp()
  const { activeLots, identified } = useHerd()
  const toast = useToast()
  const blank = { tag: '', name: '', sex: '' as Sex | '', categoryId: '', breed: '', birthDate: '', weightKg: '', lotId: lotId ?? '', entryDate: today(), origin: 'compra' as Animal['origin'], sellerName: '', buyerName: '', cost: '', notes: '', counted: false }
  const [f, setF] = useState(blank)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    setErr('')
    setF(editing ? { ...blank, tag: editing.tag, name: editing.name ?? '', sex: editing.sex, categoryId: editing.categoryId, breed: editing.breed ?? '', birthDate: editing.birthDate ?? '', weightKg: editing.weightKg ? String(editing.weightKg).replace('.', ',') : '', lotId: editing.lotId, entryDate: editing.entryDate, origin: editing.origin, sellerName: editing.sellerName ?? '', buyerName: editing.buyerName ?? '', cost: centsToInput(editing.acquisitionCost), notes: editing.notes ?? '' } : { ...blank, lotId: lotId ?? '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing])
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const lot = activeLots.find((l) => l.id === f.lotId)

  async function save() {
    if (!f.tag.trim()) return setErr('Informe a identificação do animal.')
    const weightKg = num(f.weightKg)
    const cost = f.cost.trim() ? parseMoney(f.cost) : null
    if (f.weightKg.trim() && (!weightKg || weightKg <= 0)) return setErr('Peso inválido.')
    if (f.cost.trim() && cost == null) return setErr('Valor de aquisição inválido.')
    setSaving(true); setErr('')
    try {
      if (editing) {
        await updateAnimalMeta(farm!.id, editing.id, { tag: f.tag.trim(), name: f.name.trim(), breed: f.breed.trim(), birthDate: f.birthDate || null, weightKg, notes: f.notes.trim(), sellerName: f.sellerName.trim(), buyerName: f.buyerName.trim(), acquisitionCost: cost })
      } else {
        if (!f.lotId || !f.categoryId || !f.sex) { setSaving(false); return setErr('Informe lote, categoria e sexo.') }
        const counted = f.counted || f.origin === 'existente'
        await registerAnimal(farm!.id, {
          tag: f.tag.trim(), name: f.name.trim(), sex: f.sex, categoryId: f.categoryId, breed: f.breed.trim(), birthDate: f.birthDate || null, weightKg,
          lotId: f.lotId, entryDate: f.entryDate, origin: f.origin, sellerName: f.sellerName.trim(), buyerName: f.buyerName.trim(), acquisitionCost: cost, notes: f.notes.trim(),
        }, counted, identified(f.lotId, balanceKey(f.categoryId, f.sex)).length)
      }
      toast('success', editing ? 'Animal atualizado.' : 'Animal cadastrado.')
      onClose()
    } catch (e) { setErr(herdErr(e)) } finally { setSaving(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title={editing ? `Editar animal ${editing.tag}` : 'Cadastro individual'} wide
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Identificação / brinco *"><input className="input" value={f.tag} onChange={set('tag')} maxLength={40} autoFocus /></Field>
        <Field label="Nome ou apelido"><input className="input" value={f.name} onChange={set('name')} maxLength={60} /></Field>
        {!editing && (
          <>
            <Field label="Lote *">
              <select className="input" value={f.lotId} onChange={set('lotId')}><option value="">Selecione…</option>{activeLots.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
            </Field>
            <Field label="Origem">
              <select className="input" value={f.origin} onChange={set('origin')}>
                <option value="compra">Compra</option><option value="nascimento">Nascimento</option><option value="transferencia">Transferência</option><option value="existente">Já está no rebanho (identificar)</option>
              </select>
            </Field>
            <CategorySexFields categoryId={f.categoryId} sex={f.sex} lotSex={lot?.sex} onChange={(c, s) => setF({ ...f, categoryId: c, sex: s })} />
            <Field label="Data de entrada"><input type="date" className="input" value={f.entryDate} onChange={set('entryDate')} /></Field>
          </>
        )}
        <Field label="Raça"><input className="input" value={f.breed} onChange={set('breed')} maxLength={40} /></Field>
        <Field label="Data de nascimento"><input type="date" className="input" value={f.birthDate} onChange={set('birthDate')} /></Field>
        <Field label="Peso atual (kg)"><input className="input" inputMode="decimal" value={f.weightKg} onChange={set('weightKg')} /></Field>
        {(f.origin === 'compra' || editing) && <>
          <Field label="Vendedor"><input className="input" value={f.sellerName} onChange={set('sellerName')} maxLength={120} /></Field>
          <Field label="Quem comprou / autorizou"><input className="input" value={f.buyerName} onChange={set('buyerName')} maxLength={120} /></Field>
          <Field label="Valor de aquisição (R$)"><input className="input" inputMode="decimal" value={f.cost} onChange={set('cost')} /></Field>
        </>}
        {!editing && f.origin !== 'existente' && (
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={f.counted} onChange={(e) => setF({ ...f, counted: e.target.checked })} />
            <span>Este animal já está contado no saldo do lote (apenas identificar, sem nova entrada). Desmarcado, o cadastro soma +1 ao lote.</span>
          </label>
        )}
        {editing && <p className="text-xs text-stone-500 sm:col-span-2">Lote, categoria e sexo mudam por transferência ou mudança de categoria, para preservar o histórico.</p>}
        <Field label="Observações" className="sm:col-span-2"><textarea className="input" rows={2} value={f.notes} onChange={set('notes')} maxLength={1000} /></Field>
        {err && <div className="sm:col-span-2"><ErrorBox>{err}</ErrorBox></div>}
      </div>
    </Modal>
  )
}
