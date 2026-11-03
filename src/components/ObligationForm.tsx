import { useEffect, useState } from 'react'
import { serverTimestamp, writeBatch } from 'firebase/firestore'
import { AlertTriangle } from 'lucide-react'
import { db } from '../lib/firebase'
import { addLog, clean, farmDoc, friendlyError, newId } from '../lib/db'
import { centsToInput, money, parseMoney, today } from '../lib/format'
import { obligationName } from '../lib/domain'
import { payObligation } from '../lib/obligations'
import { BOND_LABEL, OBLIGATION_LABEL, type Obligation, type ObligationType } from '../lib/types'
import { useApp } from '../contexts/AppContext'
import { Button, ErrorBox, Field, Modal, useToast } from './ui'

const CLT_TYPES: ObligationType[] = ['ferias', 'adiantamento_ferias', 'terco_ferias', 'decimo_1', 'decimo_2']

export function ObligationForm({ open, onClose, editing, collaboratorId }: { open: boolean; onClose: () => void; editing?: Obligation | null; collaboratorId?: string }) {
  const { farm, collaborators } = useApp()
  const toast = useToast()
  const blank = { type: 'ferias' as ObligationType, title: '', collaboratorId: collaboratorId ?? '', referencePeriod: today().slice(0, 4), dueDate: '', amount: '', note: '', recurrence: 'yearly' as 'none' | 'yearly' }
  const [f, setF] = useState(blank)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [fail, setFail] = useState('')

  useEffect(() => {
    if (!open) return
    setErrors({}); setFail('')
    setF(editing ? { type: editing.type, title: editing.title ?? '', collaboratorId: editing.collaboratorId, referencePeriod: editing.referencePeriod ?? '',
      dueDate: editing.dueDate, amount: centsToInput(editing.amount), note: editing.note ?? '', recurrence: editing.recurrence } : blank)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing])

  const c = collaborators.find((x) => x.id === f.collaboratorId)
  const nonCltWarning = c && c.bond !== 'clt' && CLT_TYPES.includes(f.type)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  async function save() {
    const err: Record<string, string> = {}
    if (!c) err.collaboratorId = 'Selecione o colaborador'
    if (!f.dueDate) err.dueDate = 'Informe a data prevista'
    if (f.type === 'outro' && !f.title.trim()) err.title = 'Descreva a obrigação'
    const amount = f.amount.trim() ? parseMoney(f.amount) : null
    if (f.amount.trim() && amount == null) err.amount = 'Valor inválido'
    setErrors(err)
    if (Object.keys(err).length || !c) return
    setSaving(true); setFail('')
    try {
      const id = editing?.id ?? newId(farm!.id, 'obligations')
      const b = writeBatch(db)
      b.set(farmDoc(farm!.id, 'obligations', id), clean({
        type: f.type, title: f.type === 'outro' ? f.title.trim() : '', collaboratorId: c.id, collaboratorName: c.name,
        referencePeriod: f.referencePeriod.trim(), dueDate: f.dueDate, amount, note: f.note.trim(), recurrence: f.recurrence,
        status: editing?.status ?? 'pendente', paidDate: editing?.paidDate ?? null,
        ...(editing ? { updatedAt: serverTimestamp() } : { createdAt: serverTimestamp() }),
      }), { merge: true })
      addLog(b, farm!.id, editing ? 'obrigacao_editada' : 'obrigacao_criada', `${OBLIGATION_LABEL[f.type]} — ${c.name}`)
      await b.commit()
      toast('success', editing ? 'Obrigação atualizada.' : 'Obrigação registrada.')
      onClose()
    } catch (e) { setFail(friendlyError(e)) } finally { setSaving(false) }
  }

  const options = collaborators.filter((x) => x.active || x.id === f.collaboratorId)
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar obrigação' : 'Nova obrigação'} wide
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Obrigação *">
          <select className="input" value={f.type} onChange={set('type')}>
            {Object.entries(OBLIGATION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Colaborador *" error={errors.collaboratorId}>
          <select className="input" value={f.collaboratorId} onChange={set('collaboratorId')}>
            <option value="">Selecione…</option>
            {options.map((x) => <option key={x.id} value={x.id}>{x.name} ({BOND_LABEL[x.bond]})</option>)}
          </select>
        </Field>
        {f.type === 'outro' && <Field label="Descrição *" error={errors.title} className="sm:col-span-2"><input className="input" value={f.title} onChange={set('title')} maxLength={100} /></Field>}
        {nonCltWarning && (
          <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 sm:col-span-2 dark:bg-amber-900/30 dark:text-amber-200">
            <AlertTriangle className="size-4 shrink-0" />
            {c!.name} tem vínculo “{BOND_LABEL[c!.bond]}”. Confirme se esta obrigação se aplica — o AgroGestão apenas organiza e lembra, não calcula direitos trabalhistas.
          </p>
        )}
        <Field label="Período de referência"><input className="input" value={f.referencePeriod} onChange={set('referencePeriod')} placeholder="Ex.: 2026" maxLength={20} /></Field>
        <Field label="Data prevista *" error={errors.dueDate}><input className="input" type="date" value={f.dueDate} onChange={set('dueDate')} /></Field>
        <Field label="Valor previsto (R$)" error={errors.amount} hint="Informado por você; não é calculado."><input className="input" inputMode="decimal" value={f.amount} onChange={set('amount')} placeholder="0,00" /></Field>
        <Field label="Recorrência">
          <select className="input" value={f.recurrence} onChange={set('recurrence')}>
            <option value="yearly">Anual (prepara a próxima ao pagar)</option>
            <option value="none">Não se repete</option>
          </select>
        </Field>
        <Field label="Observação" className="sm:col-span-2"><textarea className="input" rows={2} value={f.note} onChange={set('note')} maxLength={500} /></Field>
        {fail && <div className="sm:col-span-2"><ErrorBox>{fail}</ErrorBox></div>}
      </div>
    </Modal>
  )
}

export function PayDialog({ obligation: o, onClose }: { obligation: Obligation | null; onClose: () => void }) {
  const { farm, collaborators, laborTypes } = useApp()
  const toast = useToast()
  const [date, setDate] = useState(today())
  const [amount, setAmount] = useState('')
  const [createExpense, setCreateExpense] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fail, setFail] = useState('')
  useEffect(() => { if (o) { setDate(today()); setAmount(centsToInput(o.amount)); setCreateExpense(true); setFail('') } }, [o])
  if (!o) return null
  const collaborator = collaborators.find((c) => c.id === o.collaboratorId)
  const cents = amount.trim() ? parseMoney(amount) : null

  async function confirm() {
    if (!date) return setFail('Informe a data do pagamento.')
    if (amount.trim() && cents == null) return setFail('Valor inválido.')
    if (createExpense && !cents) return setFail('Informe o valor para lançá-lo como despesa.')
    setSaving(true); setFail('')
    try {
      await payObligation(farm!.id, o!, date, cents, { createExpense, collaborator, laborTypes })
      toast('success', `Pagamento registrado${o!.recurrence === 'yearly' ? ' e próxima ocorrência criada' : ''}.`)
      onClose()
    } catch (e) { setFail(friendlyError(e)) } finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title="Registrar pagamento"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={confirm}>Confirmar pagamento</Button></>}>
      <div className="space-y-4">
        <p className="text-sm"><b>{obligationName(o)}</b>{o.referencePeriod ? ` (${o.referencePeriod})` : ''} — {o.collaboratorName}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Data efetiva do pagamento"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Valor pago (R$)"><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></Field>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={createExpense} onChange={(e) => setCreateExpense(e.target.checked)} disabled={!collaborator} />
          <span>Lançar também como despesa de mão de obra{cents ? ` (${money(cents)})` : ''}, para entrar nos totais e relatórios financeiros.</span>
        </label>
        {o.recurrence === 'yearly' && <p className="text-xs text-stone-500">Obrigação anual: a próxima ocorrência será criada como pendente, um ano após a data prevista.</p>}
        {fail && <ErrorBox>{fail}</ErrorBox>}
      </div>
    </Modal>
  )
}
