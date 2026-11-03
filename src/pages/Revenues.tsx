import { useState } from 'react'
import { Link } from 'react-router-dom'
import { serverTimestamp, writeBatch } from 'firebase/firestore'
import { Pencil, Plus, Trash2, TrendingUp } from 'lucide-react'
import { auth, db } from '../lib/firebase'
import { addLog, clean, farmDoc, friendlyError, newId, useRevenues } from '../lib/db'
import { centsToInput, fmtDate, money, parseMoney, today } from '../lib/format'
import { sum } from '../lib/domain'
import type { RevenueEntry } from '../lib/types'
import { useApp } from '../contexts/AppContext'
import { Badge, Button, Card, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, useToast } from '../components/ui'
import { PeriodPicker, periodFromMonth, type Period } from '../components/PeriodPicker'

function RevenueForm({ open, editing, onClose }: { open: boolean; editing: RevenueEntry | null; onClose: () => void }) {
  const { farm } = useApp()
  const toast = useToast()
  const [f, setF] = useState({ date: today(), amount: '', description: '', note: '' })
  const [loaded, setLoaded] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const key = editing?.id ?? (open ? 'new' : null)
  if (key !== loaded) { setLoaded(key); setErr(''); setF(editing ? { date: editing.date, amount: centsToInput(editing.amount), description: editing.description, note: editing.note ?? '' } : { date: today(), amount: '', description: '', note: '' }) }
  if (!open) return null
  async function save() {
    const amount = parseMoney(f.amount)
    if (!f.date) return setErr('Informe a data.')
    if (!amount || amount <= 0) return setErr('Valor inválido.')
    if (!f.description.trim()) return setErr('Descreva a receita.')
    setSaving(true); setErr('')
    try {
      const id = editing?.id ?? newId(farm!.id, 'revenueEntries')
      const b = writeBatch(db)
      b.set(farmDoc(farm!.id, 'revenueEntries', id), clean({ date: f.date, amount, description: f.description.trim(), note: f.note.trim(), source: 'outra',
        ...(editing ? { updatedAt: serverTimestamp() } : { createdBy: auth.currentUser!.uid, createdAt: serverTimestamp() }) }), { merge: true })
      addLog(b, farm!.id, editing ? 'receita_editada' : 'receita_criada', `${f.description.trim()}: ${amount} centavos`)
      await b.commit()
      toast('success', editing ? 'Receita atualizada.' : 'Receita registrada.')
      onClose()
    } catch (e) { setErr(friendlyError(e)) } finally { setSaving(false) }
  }
  return (
    <Modal open onClose={onClose} title={editing ? 'Editar receita' : 'Nova receita'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Data *"><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Valor (R$) *"><input className="input" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Descrição *" className="sm:col-span-2"><input className="input" value={f.description} maxLength={300} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Ex.: venda de leite, arrendamento de pasto" /></Field>
        <Field label="Observação" className="sm:col-span-2"><input className="input" value={f.note} maxLength={300} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        {err && <div className="sm:col-span-2"><ErrorBox>{err}</ErrorBox></div>}
      </div>
    </Modal>
  )
}

export default function Revenues() {
  const { farm, canEdit } = useApp()
  const toast = useToast()
  const [period, setPeriod] = useState<Period>(() => periodFromMonth(today().slice(0, 7)))
  const [form, setForm] = useState<{ open: boolean; editing: RevenueEntry | null }>({ open: false, editing: null })
  const { data, loading, error } = useRevenues(farm!.id, period.start, period.end)
  const sales = data.filter((r) => r.source === 'venda_animais')

  async function remove(r: RevenueEntry) {
    if (!confirm(`Excluir a receita “${r.description}” de ${money(r.amount)}?`)) return
    try {
      const b = writeBatch(db)
      b.delete(farmDoc(farm!.id, 'revenueEntries', r.id))
      addLog(b, farm!.id, 'receita_excluida', `${r.id}: ${r.description} ${r.amount} centavos em ${r.date}`)
      await b.commit()
      toast('success', 'Receita excluída.')
    } catch (e) { toast('error', friendlyError(e)) }
  }

  return (
    <>
      <PageHeader title="Receitas" subtitle="Vendas de animais e outras entradas de dinheiro"
        actions={canEdit && <Button onClick={() => setForm({ open: true, editing: null })}><Plus className="size-4" />Nova receita</Button>} />
      <div className="mb-4"><PeriodPicker value={period} onChange={setPeriod} /></div>
      {error && <div className="mb-4"><ErrorBox>{error}</ErrorBox></div>}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card p-4"><div className="text-xs text-stone-500">Total de receitas</div><div className="tabular mt-1 text-xl font-semibold">{money(sum(data))}</div></div>
        <div className="card p-4"><div className="text-xs text-stone-500">Vendas de animais (líquido)</div><div className="tabular mt-1 text-xl font-semibold">{money(sum(sales))}</div></div>
        <div className="card p-4"><div className="text-xs text-stone-500">Outras receitas</div><div className="tabular mt-1 text-xl font-semibold">{money(sum(data) - sum(sales))}</div></div>
      </div>
      <Card>
        {loading ? <Spinner /> : data.length === 0 ? <Empty icon={<TrendingUp className="size-5" />} title="Nenhuma receita no período" text="Vendas de animais registradas em Rebanho → Saída podem lançar a receita aqui automaticamente." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[560px]">
            <thead className="border-b border-stone-200 dark:border-stone-800"><tr><th className="th">Data</th><th className="th">Origem</th><th className="th">Descrição</th><th className="th text-right">Valor</th>{canEdit && <th className="th" />}</tr></thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">{data.map((r) => (
              <tr key={r.id}>
                <td className="td tabular">{fmtDate(r.date)}</td>
                <td className="td">{r.source === 'venda_animais' ? <Badge tone="green">Venda de animais</Badge> : <Badge>Outra</Badge>}</td>
                <td className="td">{r.description}{r.note && <span className="block text-xs text-stone-500">{r.note}</span>}</td>
                <td className="td tabular text-right font-medium">{money(r.amount)}</td>
                {canEdit && <td className="td whitespace-nowrap text-right">{r.source === 'outra' ? <>
                  <Button size="sm" variant="ghost" onClick={() => setForm({ open: true, editing: r })} aria-label="Editar"><Pencil className="size-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(r)} aria-label="Excluir"><Trash2 className="size-4 text-stone-500" /></Button>
                </> : <Link to="/rebanho/saida" className="text-xs text-stone-500 hover:underline" title="Para corrigir, estorne a venda">via venda</Link>}</td>}
              </tr>))}</tbody>
            <tfoot className="border-t-2 border-stone-300 bg-stone-50 font-semibold dark:border-stone-700 dark:bg-stone-800/50"><tr><td className="td" colSpan={3}>TOTAL ({data.length})</td><td className="td tabular text-right">{money(sum(data))}</td>{canEdit && <td />}</tr></tfoot>
          </table></div>
        )}
      </Card>
      <p className="mt-2 text-xs text-stone-500">Receitas de vendas de animais são vinculadas à venda: para corrigir, estorne a venda no módulo Rebanho.</p>
      <RevenueForm open={form.open} editing={form.editing} onClose={() => setForm({ open: false, editing: null })} />
    </>
  )
}
