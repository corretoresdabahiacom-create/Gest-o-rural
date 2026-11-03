import { useState } from 'react'
import { useApp } from '../../contexts/AppContext'
import { useHerd } from '../../contexts/HerdContext'
import { newId } from '../../lib/db'
import { saveDeath } from '../../lib/herdDb'
import { fmtDate, today } from '../../lib/format'
import { Button, Card, ErrorBox, Field, PageHeader, useToast } from '../../components/ui'
import { LotKeyPicker, emptyExit, readExit } from '../../components/herd/LotKeyPicker'
import { herdErr } from '../../components/herd/HerdForms'
import { OpTable, useOps } from '../../components/herd/OpList'

interface DeathRec { date: string; lotId: string; categoryId: string; sex: 'M' | 'F'; qty: number; cause: string; responsible: string; animalIds: string[] }

export default function Deaths() {
  const { farm, canEdit } = useApp()
  const { activeLots, identified, lotName, catName, animals } = useHerd()
  const toast = useToast()
  const blank = () => ({ opId: newId(farm!.id, 'mortalityRecords'), date: today(), sel: emptyExit(), cause: '', responsible: '', notes: '' })
  const [f, setF] = useState(blank)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const recs = useOps<DeathRec>('mortalityRecords')
  const lot = activeLots.find((l) => l.id === f.sel.lotId)
  const idCount = f.sel.lotId && f.sel.key ? identified(f.sel.lotId, f.sel.key).length : 0

  async function save() {
    const r = readExit(f.sel, idCount, lot?.balances?.[f.sel.key] ?? 0)
    if ('error' in r) return setErr(r.error!)
    if (!f.cause.trim()) return setErr('Informe a causa provável.')
    if (!confirm(`Registrar a morte de ${r.qty} animal(is) do lote ${lotName(f.sel.lotId)}? O saldo será reduzido.`)) return
    setSaving(true); setErr('')
    try {
      await saveDeath(farm!.id, f.opId, { ...r.data!, date: f.date, cause: f.cause.trim(), responsible: f.responsible.trim(), notes: f.notes.trim() }, idCount)
      toast('success', `Morte registrada: −${r.qty} cab.`)
      setF({ ...blank(), date: f.date })
    } catch (e) { setErr(herdErr(e)) } finally { setSaving(false) }
  }
  return (
    <>
      <PageHeader title="Registro de mortes" subtitle="Morte individual ou de vários animais da mesma categoria e lote" />
      {canEdit && (
        <Card className="mb-5">
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label="Data da morte *"><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="Responsável pelo registro"><input className="input" value={f.responsible} onChange={(e) => setF({ ...f, responsible: e.target.value })} maxLength={120} /></Field>
            <div className="sm:col-span-2"><LotKeyPicker label="Lote" value={f.sel} onChange={(sel) => setF({ ...f, sel })} /></div>
            <Field label="Causa provável *"><input className="input" value={f.cause} onChange={(e) => setF({ ...f, cause: e.target.value })} maxLength={200} placeholder="Ex.: picada de cobra, tristeza parasitária…" /></Field>
            <Field label="Observações"><input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={500} /></Field>
          </div>
          {err && <div className="px-4 pb-2"><ErrorBox>{err}</ErrorBox></div>}
          <div className="flex justify-end border-t border-stone-200 p-3 dark:border-stone-800"><Button variant="danger" loading={saving} onClick={save}>Registrar morte</Button></div>
        </Card>
      )}
      <OpTable title="Mortes registradas" rows={recs} head={['Data', 'Lote', 'Categoria', 'Cab.', 'Animais', 'Causa', 'Responsável']}
        render={(d) => <tr key={(d as DeathRec & { id: string }).id}><td className="td tabular">{fmtDate(d.date)}</td><td className="td">{lotName(d.lotId)}</td><td className="td">{catName(d.categoryId)}</td><td className="td tabular">{d.qty}</td>
          <td className="td text-xs">{(d.animalIds ?? []).map((id) => animals.find((a) => a.id === id)?.tag ?? '').filter(Boolean).join(', ') || '—'}</td><td className="td">{d.cause}</td><td className="td">{d.responsible || '—'}</td></tr>} />
    </>
  )
}
