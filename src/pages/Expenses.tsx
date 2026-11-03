import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { serverTimestamp, writeBatch } from 'firebase/firestore'
import { Pencil, Plus, Receipt, Search, Trash2 } from 'lucide-react'
import { db } from '../lib/firebase'
import { addLog, farmDoc, friendlyError, useEntries } from '../lib/db'
import { centsToInput, fmtDate, money, parseMoney, today } from '../lib/format'
import { sum } from '../lib/domain'
import type { ExpenseEntry } from '../lib/types'
import { useApp } from '../contexts/AppContext'
import { Badge, Button, Card, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, useToast } from '../components/ui'
import { PeriodPicker, periodFromMonth, type Period } from '../components/PeriodPicker'

function EditEntry({ entry, onClose }: { entry: ExpenseEntry | null; onClose: () => void }) {
  const { farm } = useApp()
  const toast = useToast()
  const [f, setF] = useState({ date: '', amount: '', text: '' })
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadedId, setLoadedId] = useState<string | null>(null)
  if (entry && loadedId !== entry.id) {
    setLoadedId(entry.id)
    setF({ date: entry.date, amount: centsToInput(entry.amount), text: (entry.kind === 'labor' ? entry.note : entry.description) ?? '' })
    setErr('')
  }
  if (!entry) return null
  async function save() {
    const amount = parseMoney(f.amount)
    if (!f.date) return setErr('Informe a data.')
    if (!amount || amount <= 0) return setErr('Valor inválido.')
    setSaving(true)
    try {
      const b = writeBatch(db)
      b.update(farmDoc(farm!.id, 'expenseEntries', entry!.id), { date: f.date, amount, [entry!.kind === 'labor' ? 'note' : 'description']: f.text.trim(), updatedAt: serverTimestamp() })
      addLog(b, farm!.id, 'lancamento_editado', `${entry!.id}: ${entry!.amount}→${amount} centavos, ${entry!.date}→${f.date}`)
      await b.commit()
      toast('success', 'Lançamento atualizado.')
      onClose()
    } catch (e) { setErr(friendlyError(e)) } finally { setSaving(false) }
  }
  return (
    <Modal open onClose={onClose} title="Editar lançamento"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Salvar</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-stone-600 dark:text-stone-300">{entry.kind === 'labor' ? `${entry.laborTypeName} · ${entry.collaboratorName}` : entry.categoryName}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Data"><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Valor (R$)"><input inputMode="decimal" className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        </div>
        <Field label={entry.kind === 'labor' ? 'Observação' : 'Descrição'}><input className="input" maxLength={300} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} /></Field>
        {err && <ErrorBox>{err}</ErrorBox>}
      </div>
    </Modal>
  )
}

export default function Expenses() {
  const { farm, canEdit } = useApp()
  const toast = useToast()
  const [period, setPeriod] = useState<Period>(() => periodFromMonth(today().slice(0, 7)))
  const [kind, setKind] = useState<'' | 'labor' | 'other'>('')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<ExpenseEntry | null>(null)
  const { data, loading, error } = useEntries(farm!.id, period.start, period.end)

  const list = useMemo(() => data.filter((e) => (!kind || e.kind === kind) &&
    (!q || [e.collaboratorName, e.categoryName, e.description, e.note, e.laborTypeName].some((s) => s?.toLowerCase().includes(q.toLowerCase())))), [data, kind, q])

  async function remove(e: ExpenseEntry) {
    if (!confirm(`Excluir o lançamento de ${money(e.amount)} (${fmtDate(e.date)})? Esta ação não pode ser desfeita.`)) return
    try {
      const b = writeBatch(db)
      b.delete(farmDoc(farm!.id, 'expenseEntries', e.id))
      addLog(b, farm!.id, 'lancamento_excluido', `${e.id}: ${e.kind} ${e.collaboratorName ?? e.categoryName} ${e.amount} centavos em ${e.date}`)
      await b.commit()
      toast('success', 'Lançamento excluído.')
    } catch (err) { toast('error', friendlyError(err)) }
  }

  return (
    <>
      <PageHeader title="Despesas" subtitle="Pagamentos de mão de obra e outras despesas"
        actions={canEdit && <Link to="/despesas/novo"><Button><Plus className="size-4" />Novo lançamento</Button></Link>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <PeriodPicker value={period} onChange={setPeriod} />
        <select className="input w-auto" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Tipo">
          <option value="">Todos</option><option value="labor">Mão de obra</option><option value="other">Outras despesas</option>
        </select>
        <div className="relative min-w-40 flex-1">
          <Search className="absolute top-2.5 left-3 size-4 text-stone-400" />
          <input className="input pl-9" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {error && <div className="mb-4"><ErrorBox>{error}</ErrorBox></div>}
      <Card title={`${list.length} lançamento(s)`} action={<span className="tabular text-sm font-semibold">{money(sum(list))}</span>}>
        {loading ? <Spinner /> : list.length === 0 ? (
          <Empty icon={<Receipt className="size-5" />} title="Nenhum lançamento no período"
            action={canEdit && <Link to="/despesas/novo"><Button variant="secondary"><Plus className="size-4" />Novo lançamento</Button></Link>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-stone-200 dark:border-stone-800">
                <tr><th className="th">Data</th><th className="th">Tipo</th><th className="th">Colaborador / Categoria</th><th className="th">Descrição</th><th className="th text-right">Valor</th>{canEdit && <th className="th" />}</tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {list.map((e) => (
                  <tr key={e.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/40">
                    <td className="td tabular">{fmtDate(e.date)}</td>
                    <td className="td">{e.kind === 'labor' ? <Badge tone="green">{e.laborTypeName || 'Mão de obra'}</Badge> : <Badge tone="amber">{e.categoryName}</Badge>}</td>
                    <td className="td font-medium">{e.kind === 'labor' ? e.collaboratorName : e.categoryName}</td>
                    <td className="td max-w-xs truncate text-stone-500">{e.kind === 'labor' ? e.note : e.description}</td>
                    <td className="td tabular text-right font-medium">{money(e.amount)}</td>
                    {canEdit && (
                      <td className="td whitespace-nowrap text-right">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(e)} aria-label="Editar"><Pencil className="size-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(e)} aria-label="Excluir"><Trash2 className="size-4 text-stone-500" /></Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <EditEntry entry={editing} onClose={() => setEditing(null)} />
    </>
  )
}
