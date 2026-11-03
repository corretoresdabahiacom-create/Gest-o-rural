import { useEffect, useState } from 'react'
import { serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { addLog, clean, farmDoc, friendlyError, newId } from '../lib/db'
import { centsToInput, parseMoney } from '../lib/format'
import { BOND_LABEL, type Bond, type Collaborator } from '../lib/types'
import { useApp } from '../contexts/AppContext'
import { Button, ErrorBox, Field, Modal, useToast } from './ui'

const onlyDigits = (s: string) => s.replace(/\D/g, '')
const maskCpf = (s: string) => onlyDigits(s).slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')

export function validCpf(cpf: string): boolean {
  const d = onlyDigits(cpf)
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
  for (const n of [9, 10]) {
    let s = 0
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i)
    if (((s * 10) % 11) % 10 !== Number(d[n])) return false
  }
  return true
}

export function CollaboratorForm({ open, onClose, editing }: { open: boolean; onClose: () => void; editing?: Collaborator | null }) {
  const { farm, laborTypes } = useApp()
  const toast = useToast()
  const empty = { name: '', laborTypeId: '', phone: '', cpf: '', admissionDate: '', bond: 'clt' as Bond, ref: '', notes: '' }
  const [f, setF] = useState(empty)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [fail, setFail] = useState('')

  useEffect(() => {
    if (!open) return
    setErrors({}); setFail('')
    setF(editing ? {
      name: editing.name, laborTypeId: editing.laborTypeId, phone: editing.phone ?? '', cpf: editing.cpf ?? '',
      admissionDate: editing.admissionDate ?? '', bond: editing.bond, ref: centsToInput(editing.referenceAmount), notes: editing.notes ?? '',
    } : { ...empty, laborTypeId: laborTypes.find((t) => t.active)?.id ?? '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing])

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: k === 'cpf' ? maskCpf(e.target.value) : e.target.value })

  async function save() {
    const err: Record<string, string> = {}
    if (f.name.trim().length < 2) err.name = 'Informe o nome completo'
    if (!f.laborTypeId) err.laborTypeId = 'Selecione o tipo'
    if (f.cpf && !validCpf(f.cpf)) err.cpf = 'CPF inválido'
    const ref = f.ref.trim() ? parseMoney(f.ref) : null
    if (f.ref.trim() && ref == null) err.ref = 'Valor inválido'
    setErrors(err)
    if (Object.keys(err).length) return
    setSaving(true); setFail('')
    try {
      const id = editing?.id ?? newId(farm!.id, 'collaborators')
      const b = writeBatch(db)
      b.set(farmDoc(farm!.id, 'collaborators', id), clean({
        name: f.name.trim(), laborTypeId: f.laborTypeId, phone: f.phone.trim(), cpf: f.cpf, admissionDate: f.admissionDate || null,
        bond: f.bond, referenceAmount: ref, notes: f.notes.trim(), active: editing?.active ?? true,
        ...(editing ? { updatedAt: serverTimestamp() } : { createdAt: serverTimestamp() }),
      }), { merge: true })
      addLog(b, farm!.id, editing ? 'colaborador_editado' : 'colaborador_criado', f.name.trim())
      await b.commit()
      toast('success', editing ? 'Colaborador atualizado.' : 'Colaborador cadastrado.')
      onClose()
    } catch (e) { setFail(friendlyError(e)) } finally { setSaving(false) }
  }

  const types = laborTypes.filter((t) => t.active || t.id === f.laborTypeId)
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar colaborador' : 'Novo colaborador'} wide
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Salvar</Button></>}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save() }}>
        <Field label="Nome completo *" error={errors.name} className="sm:col-span-2"><input className="input" value={f.name} onChange={set('name')} autoFocus maxLength={120} /></Field>
        <Field label="Tipo de mão de obra *" error={errors.laborTypeId}>
          <select className="input" value={f.laborTypeId} onChange={set('laborTypeId')}>
            <option value="">Selecione…</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Tipo de vínculo">
          <select className="input" value={f.bond} onChange={set('bond')}>
            {Object.entries(BOND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Telefone"><input className="input" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} maxLength={30} /></Field>
        <Field label="CPF" error={errors.cpf}><input className="input" inputMode="numeric" value={f.cpf} onChange={set('cpf')} placeholder="000.000.000-00" /></Field>
        <Field label="Data de admissão"><input className="input" type="date" value={f.admissionDate} onChange={set('admissionDate')} /></Field>
        <Field label="Valor de referência (R$)" error={errors.ref}><input className="input" inputMode="decimal" value={f.ref} onChange={set('ref')} placeholder="0,00" /></Field>
        <Field label="Observações" className="sm:col-span-2"><textarea className="input" rows={2} value={f.notes} onChange={set('notes')} maxLength={1000} /></Field>
        {fail && <div className="sm:col-span-2"><ErrorBox>{fail}</ErrorBox></div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
