import { useMemo, useState } from 'react'
import { serverTimestamp, writeBatch } from 'firebase/firestore'
import { Plus, Trash2 } from 'lucide-react'
import { db } from '../../lib/firebase'
import { farmDoc, newId } from '../../lib/db'
import { useApp } from '../../contexts/AppContext'
import { useHerd } from '../../contexts/HerdContext'
import { saveBirth, savePurchase } from '../../lib/herdDb'
import { money, number, parseMoney, today } from '../../lib/format'
import { tradeCalc, type ArrobaUnit, type Sex } from '../../lib/herd'
import { Button, Card, ErrorBox, Field, Modal, PageHeader, cx, useToast } from '../../components/ui'
import { CategorySexFields } from '../../components/herd/LotKeyPicker'
import { UnitFields, unitLabel } from '../../components/herd/UnitFields'
import { herdErr } from '../../components/herd/HerdForms'

const dec = (s: string) => { const n = Number(s.replace(/\./g, '').replace(',', '.')); return s.trim() && Number.isFinite(n) ? n : null }

export default function Entry() {
  const { farm, categories: expenseCats, canEdit } = useApp()
  const { activeLots, arroba, lotName, catName } = useHerd()
  const toast = useToast()
  const [mode, setMode] = useState<'compra' | 'nascimento'>('compra')
  const blank = () => ({ opId: newId(farm!.id, 'purchases'), date: today(), sellerName: '', buyerName: '', lotId: '', categoryId: '', sex: '' as Sex | '', qty: '', weighMode: 'total' as 'total' | 'medio' | 'individual',
    totalKg: '', avgKg: '', unit: 'vivo' as ArrobaUnit, kgPerUnit: String(arroba.vivo), price: '', manual: false, manualAmount: '', notes: '', finance: true, responsible: '',
    animals: [] as { tag: string; kg: string }[] })
  const [f, setF] = useState(blank)
  const [review, setReview] = useState(false)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k: keyof ReturnType<typeof blank>) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const lot = activeLots.find((l) => l.id === f.lotId)

  const individual = f.weighMode === 'individual'
  const indivKg = f.animals.reduce((s, a) => s + (dec(a.kg) ?? 0), 0)
  const qty = individual ? f.animals.length : Number(f.qty || 0)
  const calc = useMemo(() => tradeCalc({
    qty, totalKg: individual ? indivKg : f.weighMode === 'total' ? dec(f.totalKg) : null, avgKg: f.weighMode === 'medio' ? dec(f.avgKg) : null,
    pricePerUnit: parseMoney(f.price), kgPerUnit: dec(f.kgPerUnit) ?? 0, manualAmount: f.manual ? parseMoney(f.manualAmount) : null,
  }), [qty, individual, indivKg, f.weighMode, f.totalKg, f.avgKg, f.price, f.kgPerUnit, f.manual, f.manualAmount])

  function validate(): string {
    if (!f.lotId || !f.categoryId || !f.sex) return 'Informe lote de destino, categoria e sexo.'
    if (qty < 1) return 'Informe a quantidade de animais.'
    if (mode === 'nascimento') return ''
    if (!f.sellerName.trim() || !f.buyerName.trim()) return 'Informe o vendedor e quem comprou.'
    if (individual && f.animals.some((a) => !a.tag.trim())) return 'Preencha a identificação de todos os animais.'
    if (individual && new Set(f.animals.map((a) => a.tag.trim().toLowerCase())).size !== f.animals.length) return 'Há identificações repetidas.'
    if (!calc.totalKg) return 'Informe o peso (total, médio ou individual).'
    if (!(dec(f.kgPerUnit)! > 0)) return 'Kg por unidade inválido.'
    if (!calc.amount) return 'Informe o valor da unidade ou o valor total.'
    return ''
  }

  async function save() {
    setSaving(true); setErr('')
    try {
      if (mode === 'nascimento') {
        await saveBirth(farm!.id, f.opId, { date: f.date, lotId: f.lotId, categoryId: f.categoryId, sex: f.sex as Sex, qty, notes: f.notes.trim(), responsible: f.responsible.trim() })
      } else {
        let finance: { categoryId: string; categoryName: string } | null = null
        if (f.finance) {
          let c = expenseCats.find((x) => x.name.toLowerCase() === 'compra de animais')
          if (!c) { // cria a categoria financeira uma única vez
            const id = newId(farm!.id, 'expenseCategories'); const b = writeBatch(db)
            b.set(farmDoc(farm!.id, 'expenseCategories', id), { name: 'Compra de animais', active: true, createdAt: serverTimestamp() }); await b.commit()
            c = { id, name: 'Compra de animais', active: true }
          }
          finance = { categoryId: c.id, categoryName: c.name }
        }
        const r = await savePurchase(farm!.id, f.opId, {
          date: f.date, sellerName: f.sellerName.trim(), buyerName: f.buyerName.trim(), lotId: f.lotId, categoryId: f.categoryId, sex: f.sex as Sex, qty,
          totalKg: calc.totalKg, avgKg: calc.avgKg, unit: f.unit, kgPerUnit: dec(f.kgPerUnit)!, pricePerUnit: parseMoney(f.price) ?? 0,
          computedAmount: calc.computedAmount, amount: calc.amount, manualAmount: f.manual, costPerHead: calc.costPerHead, notes: f.notes.trim(),
          animals: individual ? f.animals.map((a) => ({ tag: a.tag.trim(), kg: dec(a.kg) })) : undefined, finance,
        })
        if (r === 'already-saved') toast('info', 'Esta compra já havia sido registrada — nada duplicado.')
      }
      toast('success', `${mode === 'compra' ? 'Compra' : 'Nascimento'} registrado: +${qty} cab. em ${lotName(f.lotId)}.`)
      setReview(false); setF({ ...blank(), date: f.date, unit: f.unit, kgPerUnit: f.kgPerUnit })
    } catch (e) { setErr(herdErr(e)) } finally { setSaving(false) }
  }

  if (!canEdit) return <ErrorBox>Seu perfil é somente leitura.</ErrorBox>
  return (
    <>
      <PageHeader title="Entrada de animais" subtitle="Compras e nascimentos atualizam o lote e o histórico" />
      <div className="mb-4 flex rounded-lg border border-stone-200 bg-white p-0.5 w-fit dark:border-stone-800 dark:bg-stone-900">
        {(['compra', 'nascimento'] as const).map((m) => <button key={m} onClick={() => { setMode(m); setErr('') }} className={cx('rounded-md px-4 py-1.5 text-sm capitalize', mode === m ? 'bg-brand-600 text-white' : 'text-stone-600 dark:text-stone-300')}>{m}</button>)}
      </div>
      <Card className="mb-5">
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Data *"><input type="date" className="input" value={f.date} onChange={set('date')} /></Field>
          <Field label="Lote de destino *">
            <select className="input" value={f.lotId} onChange={set('lotId')}><option value="">Selecione…</option>{activeLots.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.count})</option>)}</select>
          </Field>
          <CategorySexFields categoryId={f.categoryId} sex={f.sex} lotSex={lot?.sex} onChange={(c, s) => setF({ ...f, categoryId: c, sex: s })} />
          {mode === 'compra' ? <>
            <Field label="Vendedor *"><input className="input" value={f.sellerName} onChange={set('sellerName')} maxLength={120} /></Field>
            <Field label="Quem comprou *"><input className="input" value={f.buyerName} onChange={set('buyerName')} maxLength={120} /></Field>
            <Field label="Forma de pesagem">
              <select className="input" value={f.weighMode} onChange={(e) => setF({ ...f, weighMode: e.target.value as typeof f.weighMode, animals: e.target.value === 'individual' && !f.animals.length ? [{ tag: '', kg: '' }] : f.animals })}>
                <option value="total">Peso total do lote</option><option value="medio">Peso médio por animal</option><option value="individual">Pesos individuais (com identificação)</option>
              </select>
            </Field>
            {!individual && <Field label="Quantidade *"><input className="input" inputMode="numeric" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value.replace(/\D/g, '') })} /></Field>}
            {f.weighMode === 'total' && <Field label="Peso total (kg) *"><input className="input" inputMode="decimal" value={f.totalKg} onChange={set('totalKg')} /></Field>}
            {f.weighMode === 'medio' && <Field label="Peso médio (kg) *"><input className="input" inputMode="decimal" value={f.avgKg} onChange={set('avgKg')} /></Field>}
            <UnitFields unit={f.unit} kgPerUnit={f.kgPerUnit} onChange={(u, kg) => setF({ ...f, unit: u, kgPerUnit: kg })} />
            <Field label="Valor da unidade (R$) *"><input className="input" inputMode="decimal" value={f.price} onChange={set('price')} placeholder="Ex.: 310,00" /></Field>
          </> : <>
            <Field label="Quantidade *"><input className="input" inputMode="numeric" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="Responsável"><input className="input" value={f.responsible} onChange={set('responsible')} maxLength={120} /></Field>
          </>}
          <Field label="Observações" className="sm:col-span-2 lg:col-span-4"><input className="input" value={f.notes} onChange={set('notes')} maxLength={500} /></Field>
        </div>

        {mode === 'compra' && individual && (
          <div className="border-t border-stone-200 p-4 dark:border-stone-800">
            <div className="mb-2 text-sm font-medium">Animais da compra ({f.animals.length})</div>
            <div className="space-y-1.5">
              {f.animals.map((a, i) => (
                <div key={i} className="flex gap-2">
                  <span className="w-8 pt-2 text-right text-xs text-stone-400">{i + 1}</span>
                  <input className="input" placeholder="Brinco / identificação" value={a.tag} onChange={(e) => setF({ ...f, animals: f.animals.map((x, j) => (j === i ? { ...x, tag: e.target.value } : x)) })} />
                  <input className="input w-32 text-right" inputMode="decimal" placeholder="kg" value={a.kg}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setF({ ...f, animals: [...f.animals, { tag: '', kg: '' }] }) } }}
                    onChange={(e) => setF({ ...f, animals: f.animals.map((x, j) => (j === i ? { ...x, kg: e.target.value } : x)) })} />
                  <button className="rounded-md p-2 text-stone-400 hover:text-red-600" onClick={() => setF({ ...f, animals: f.animals.filter((_, j) => j !== i) })} aria-label="Remover"><Trash2 className="size-4" /></button>
                </div>
              ))}
            </div>
            <Button size="sm" variant="secondary" className="mt-2" onClick={() => setF({ ...f, animals: [...f.animals, { tag: '', kg: '' }] })}><Plus className="size-4" />Adicionar animal</Button>
          </div>
        )}

        {mode === 'compra' && (
          <div className="grid gap-3 border-t border-stone-200 bg-stone-50/60 p-4 text-sm sm:grid-cols-3 lg:grid-cols-6 dark:border-stone-800 dark:bg-stone-900/60">
            <div><div className="text-xs text-stone-500">Quantidade</div><b className="tabular">{qty}</b></div>
            <div><div className="text-xs text-stone-500">Peso total</div><b className="tabular">{number(calc.totalKg)} kg</b></div>
            <div><div className="text-xs text-stone-500">Peso médio</div><b className="tabular">{number(calc.avgKg)} kg</b></div>
            <div><div className="text-xs text-stone-500">{unitLabel(f.unit, arroba.outraLabel)}</div><b className="tabular">{number(calc.units)}</b></div>
            <div><div className="text-xs text-stone-500">Valor calculado</div><b className="tabular">{money(calc.computedAmount)}</b></div>
            <div><div className="text-xs text-stone-500">Custo médio/cab.</div><b className="tabular">{money(calc.costPerHead)}</b></div>
            <label className="flex items-center gap-2 sm:col-span-3"><input type="checkbox" className="size-4 accent-brand-600" checked={f.manual} onChange={(e) => setF({ ...f, manual: e.target.checked })} />Informar valor total manualmente</label>
            {f.manual && <input className="input sm:col-span-3" inputMode="decimal" placeholder="Valor total negociado (R$)" value={f.manualAmount} onChange={set('manualAmount')} />}
            <label className="flex items-start gap-2 sm:col-span-3 lg:col-span-6"><input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={f.finance} onChange={(e) => setF({ ...f, finance: e.target.checked })} />Lançar também como despesa no financeiro (categoria “Compra de animais”), uma única vez para esta compra.</label>
            <div className="text-base sm:col-span-3 lg:col-span-6">Valor total da compra: <b className="tabular text-brand-700 dark:text-brand-300">{money(calc.amount)}</b></div>
          </div>
        )}
        <div className="flex justify-end border-t border-stone-200 p-3 dark:border-stone-800">
          <Button onClick={() => { const e = validate(); setErr(e); if (!e) setReview(true) }}>Conferir e salvar</Button>
        </div>
        {err && !review && <div className="px-4 pb-4"><ErrorBox>{err}</ErrorBox></div>}
      </Card>

      <Modal open={review} onClose={() => !saving && setReview(false)} title="Confirmar entrada"
        footer={<><Button variant="secondary" disabled={saving} onClick={() => setReview(false)}>Voltar</Button><Button loading={saving} onClick={save}>Confirmar</Button></>}>
        <div className="space-y-2 text-sm">
          <p><b>{mode === 'compra' ? 'Compra' : 'Nascimento'}</b> de <b>{qty}</b> cab. ({catName(f.categoryId)}, {f.sex === 'M' ? 'machos' : 'fêmeas'}) para <b>{lotName(f.lotId)}</b> em {f.date.split('-').reverse().join('/')}.</p>
          {mode === 'compra' && <>
            <p>Vendedor: {f.sellerName} · Comprador: {f.buyerName}</p>
            <p>{number(calc.totalKg)} kg ({number(calc.avgKg)} kg/cab.) · {number(calc.units)} {unitLabel(f.unit, arroba.outraLabel)} a {money(parseMoney(f.price) ?? 0)}</p>
            <p className="text-base">Total: <b>{money(calc.amount)}</b>{f.manual && ' (informado manualmente)'} · {money(calc.costPerHead)}/cab.</p>
          </>}
          <p className="text-stone-500">Saldo do lote: {lot?.count ?? 0} → <b>{(lot?.count ?? 0) + qty}</b></p>
          {err && <ErrorBox>{err}</ErrorBox>}
        </div>
      </Modal>
    </>
  )
}
