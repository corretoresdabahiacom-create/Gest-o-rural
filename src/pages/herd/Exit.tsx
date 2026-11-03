import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { useHerd } from '../../contexts/HerdContext'
import { newId } from '../../lib/db'
import { postSaleRevenue, saveSale } from '../../lib/herdDb'
import { fmtDate, money, number, parseMoney, today } from '../../lib/format'
import { saleNet, tradeCalc, type ArrobaUnit } from '../../lib/herd'
import { Badge, Button, Card, ErrorBox, Field, Modal, PageHeader, useToast } from '../../components/ui'
import { LotKeyPicker, emptyExit, readExit } from '../../components/herd/LotKeyPicker'
import { UnitFields, unitLabel } from '../../components/herd/UnitFields'
import { herdErr } from '../../components/herd/HerdForms'
import { OpTable, useOps } from '../../components/herd/OpList'
import { ReverseButton } from '../../components/herd/ReverseButton'

const dec = (s: string) => { const n = Number(s.replace(/\./g, '').replace(',', '.')); return s.trim() && Number.isFinite(n) ? n : null }
const EXP_TYPES = ['Frete', 'Comissão', 'Taxas', 'GTA e documentação', 'Alimentação no transporte', 'Outros']

interface SaleRec { id: string; reversedBy?: string; revenueEntryId?: string | null; date: string; buyerName: string; lotId: string; qty: number; totalKg: number; gross: number; expensesTotal: number; net: number; unit: string }

export default function Exit() {
  const { farm, canEdit } = useApp()
  const { activeLots, identified, arroba, lotName, keyLabel } = useHerd()
  const toast = useToast()
  const blank = () => ({ opId: newId(farm!.id, 'sales'), date: today(), buyer: '', sel: emptyExit(), weighMode: 'total' as 'total' | 'medio', totalKg: '', avgKg: '',
    unit: 'vivo' as ArrobaUnit, kgPerUnit: String(arroba.vivo), price: '', manual: false, manualGross: '', expenses: [{ type: 'Frete', description: '', amount: '' }], notes: '', postRevenue: true })
  const [f, setF] = useState(blank)
  const [review, setReview] = useState<null | { qty: number }>(null)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const sales = useOps<SaleRec>('sales')

  const lot = activeLots.find((l) => l.id === f.sel.lotId)
  const available = lot?.balances?.[f.sel.key] ?? 0
  const idCount = f.sel.lotId && f.sel.key ? identified(f.sel.lotId, f.sel.key).length : 0
  const qty = Number(f.sel.anonQty || 0) + f.sel.animalIds.length
  const calc = useMemo(() => tradeCalc({ qty, totalKg: f.weighMode === 'total' ? dec(f.totalKg) : null, avgKg: f.weighMode === 'medio' ? dec(f.avgKg) : null,
    pricePerUnit: parseMoney(f.price), kgPerUnit: dec(f.kgPerUnit) ?? 0, manualAmount: f.manual ? parseMoney(f.manualGross) : null }), [qty, f])
  const expenses = f.expenses.filter((e) => e.amount.trim()).map((e) => ({ type: e.type, description: e.description.trim(), amount: parseMoney(e.amount) ?? 0 }))
  const net = saleNet(calc.amount, expenses)
  const byType = EXP_TYPES.map((t) => ({ t, v: expenses.filter((e) => e.type === t).reduce((s, e) => s + e.amount, 0) })).filter((x) => x.v)

  function check() {
    const r = readExit(f.sel, idCount, available)
    if ('error' in r) return setErr(r.error!)
    if (!f.buyer.trim()) return setErr('Informe o comprador.')
    if (!calc.amount) return setErr('Informe peso e valor da unidade, ou o valor bruto manual.')
    if (f.expenses.some((e) => e.amount.trim() && parseMoney(e.amount) == null)) return setErr('Há despesa com valor inválido.')
    if (net.net < 0) return setErr('As despesas superam o valor bruto. Confira os valores.')
    setErr(''); setReview({ qty: r.qty! })
  }
  async function save() {
    const r = readExit(f.sel, idCount, available)
    if ('error' in r) return setErr(r.error!)
    setSaving(true); setErr('')
    try {
      const res = await saveSale(farm!.id, f.opId, {
        ...r.data!, date: f.date, notes: f.notes.trim(), buyerName: f.buyer.trim(), totalKg: calc.totalKg, avgKg: calc.avgKg, unit: f.unit, kgPerUnit: dec(f.kgPerUnit) ?? 0,
        pricePerUnit: parseMoney(f.price) ?? 0, computedGross: calc.computedAmount, gross: calc.amount, manualGross: f.manual, expenses, expensesTotal: net.expenses, net: net.net, postRevenue: f.postRevenue,
      }, idCount)
      toast(res === 'already-saved' ? 'info' : 'success', res === 'already-saved' ? 'Esta venda já havia sido registrada.' : `Venda registrada: −${r.qty} cab. Líquido ${money(net.net)}.`)
      setReview(null); setF({ ...blank(), date: f.date, unit: f.unit, kgPerUnit: f.kgPerUnit })
    } catch (e) { setErr(herdErr(e)) } finally { setSaving(false) }
  }

  return (
    <>
      <PageHeader title="Saída por venda" subtitle="Reduz o saldo do lote e registra valores brutos, despesas e líquido" />
      {canEdit && (
        <Card className="mb-5">
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label="Data da venda *"><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="Comprador *"><input className="input" value={f.buyer} onChange={(e) => setF({ ...f, buyer: e.target.value })} maxLength={120} /></Field>
            <div className="sm:col-span-2"><LotKeyPicker value={f.sel} onChange={(sel) => setF({ ...f, sel })} /></div>
            <Field label="Peso informado">
              <select className="input" value={f.weighMode} onChange={(e) => setF({ ...f, weighMode: e.target.value as 'total' | 'medio' })}><option value="total">Peso total vendido</option><option value="medio">Peso médio por animal</option></select>
            </Field>
            {f.weighMode === 'total' ? <Field label="Peso total (kg)"><input className="input" inputMode="decimal" value={f.totalKg} onChange={(e) => setF({ ...f, totalKg: e.target.value })} /></Field>
              : <Field label="Peso médio (kg)"><input className="input" inputMode="decimal" value={f.avgKg} onChange={(e) => setF({ ...f, avgKg: e.target.value })} /></Field>}
            <UnitFields unit={f.unit} kgPerUnit={f.kgPerUnit} onChange={(u, kg) => setF({ ...f, unit: u, kgPerUnit: kg })} />
            <Field label="Valor da unidade (R$)"><input className="input" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-brand-600" checked={f.manual} onChange={(e) => setF({ ...f, manual: e.target.checked })} />Informar valor bruto manualmente</label>
              {f.manual && <input className="input" inputMode="decimal" placeholder="Valor bruto (R$)" value={f.manualGross} onChange={(e) => setF({ ...f, manualGross: e.target.value })} />}
            </div>
          </div>
          <div className="border-t border-stone-200 p-4 dark:border-stone-800">
            <div className="mb-2 text-sm font-medium">Despesas da venda</div>
            <div className="space-y-1.5">
              {f.expenses.map((x, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[180px_1fr_140px_auto]">
                  <select className="input" value={x.type} onChange={(e) => setF({ ...f, expenses: f.expenses.map((y, j) => (j === i ? { ...y, type: e.target.value } : y)) })}>{EXP_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
                  <input className="input col-span-2 sm:col-span-1 order-3 sm:order-none" placeholder="Descrição" value={x.description} maxLength={200} onChange={(e) => setF({ ...f, expenses: f.expenses.map((y, j) => (j === i ? { ...y, description: e.target.value } : y)) })} />
                  <input className="input text-right" inputMode="decimal" placeholder="R$ 0,00" value={x.amount}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setF({ ...f, expenses: [...f.expenses, { type: 'Outros', description: '', amount: '' }] }) } }}
                    onChange={(e) => setF({ ...f, expenses: f.expenses.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)) })} />
                  <button className="rounded-md p-2 text-stone-400 hover:text-red-600" onClick={() => setF({ ...f, expenses: f.expenses.filter((_, j) => j !== i) })} aria-label="Remover despesa"><Trash2 className="size-4" /></button>
                </div>
              ))}
            </div>
            <Button size="sm" variant="secondary" className="mt-2" onClick={() => setF({ ...f, expenses: [...f.expenses, { type: 'Outros', description: '', amount: '' }] })}><Plus className="size-4" />Adicionar despesa</Button>
          </div>
          <div className="border-t border-stone-200 bg-stone-50/60 p-4 text-sm dark:border-stone-800 dark:bg-stone-900/60">
            <div className="mb-2 text-xs text-stone-500">{qty} cab. · {number(calc.totalKg)} kg · {number(calc.avgKg)} kg/cab. · {number(calc.units)} {unitLabel(f.unit, arroba.outraLabel)}</div>
            <div className="max-w-sm space-y-0.5">
              <div className="flex justify-between"><span>Valor bruto da venda</span><span className="tabular">{money(calc.amount)}</span></div>
              {byType.map((x) => <div key={x.t} className="flex justify-between text-stone-600 dark:text-stone-300"><span>(−) {x.t}</span><span className="tabular">{money(x.v)}</span></div>)}
              <div className="flex justify-between border-t border-stone-300 pt-1 text-base font-semibold dark:border-stone-700"><span>(=) TOTAL LÍQUIDO</span><span className="tabular text-brand-700 dark:text-brand-300">{money(net.net)}</span></div>
            </div>
            <label className="mt-3 flex items-start gap-2"><input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={f.postRevenue} onChange={(e) => setF({ ...f, postRevenue: e.target.checked })} />Lançar o valor líquido como receita no financeiro (uma única vez para esta venda).</label>
          </div>
          <div className="flex justify-end border-t border-stone-200 p-3 dark:border-stone-800"><Button onClick={check}>Conferir e salvar</Button></div>
          {err && !review && <div className="px-4 pb-4"><ErrorBox>{err}</ErrorBox></div>}
        </Card>
      )}
      <OpTable title="Vendas registradas" rows={sales} head={['Data', 'Comprador', 'Lote', 'Cab.', 'Peso', 'Bruto', 'Despesas', 'Líquido', 'Financeiro', '']}
        render={(s) => <tr key={s.id} className={s.reversedBy ? 'text-stone-400' : ''}><td className="td tabular">{fmtDate(s.date)}</td><td className="td">{s.buyerName}</td><td className="td">{lotName(s.lotId)}</td><td className="td tabular">{s.qty}</td><td className="td tabular">{number(s.totalKg)} kg</td><td className="td tabular">{money(s.gross)}</td><td className="td tabular">{money(s.expensesTotal)}</td><td className="td tabular font-medium">{money(s.net)}</td>
          <td className="td">{s.reversedBy ? '—' : s.revenueEntryId ? <Badge tone="green">Receita lançada</Badge> : canEdit ? <Button size="sm" variant="secondary" onClick={() => postSaleRevenue(farm!.id, s as SaleRec & { buyerName: string }).then(() => toast('success', 'Receita lançada no financeiro.')).catch((e) => toast('error', herdErr(e)))}>Lançar receita</Button> : '—'}</td>
          <td className="td text-right"><ReverseButton col="sales" op={s} summary={`Venda de ${s.qty} cab. para ${s.buyerName} (${fmtDate(s.date)}) — líquido ${money(s.net)}`} /></td></tr>} />
      <Modal open={!!review} onClose={() => !saving && setReview(null)} title="Confirmar venda"
        footer={<><Button variant="secondary" disabled={saving} onClick={() => setReview(null)}>Voltar</Button><Button loading={saving} onClick={save}>Confirmar venda</Button></>}>
        <div className="space-y-2 text-sm">
          <p><b>{review?.qty}</b> cab. ({keyLabel(f.sel.key)}) de <b>{lotName(f.sel.lotId)}</b> para <b>{f.buyer}</b>.</p>
          <p>Bruto {money(calc.amount)} − despesas {money(net.expenses)} = <b>líquido {money(net.net)}</b></p>
          <p className="text-stone-500">Saldo do lote nesta categoria: {available} → <b>{available - (review?.qty ?? 0)}</b></p>
          {err && <ErrorBox>{err}</ErrorBox>}
        </div>
      </Modal>
    </>
  )
}
