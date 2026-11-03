import { useEffect, useState } from 'react'
import { useApp } from '../../contexts/AppContext'
import { useHerd } from '../../contexts/HerdContext'
import { newId } from '../../lib/db'
import { fetchOtherFarmLots, saveTransfer } from '../../lib/herdDb'
import { fmtDate, today } from '../../lib/format'
import type { HerdLot } from '../../lib/herd'
import type { Named } from '../../lib/types'
import { Badge, Button, Card, ErrorBox, Field, PageHeader, useToast } from '../../components/ui'
import { LotKeyPicker, emptyExit, readExit } from '../../components/herd/LotKeyPicker'
import { herdErr } from '../../components/herd/HerdForms'
import { OpTable, useOps } from '../../components/herd/OpList'

interface TRec { date: string; lotId: string; toLotId: string; qty: number; reason: string; external?: boolean; direction?: string; fromFarmId?: string; toFarmId?: string | null }
const dec = (s: string) => { const n = Number(s.replace(',', '.')); return s.trim() && Number.isFinite(n) ? n : null }

export default function Transfers() {
  const { farm, farms, canEdit } = useApp()
  const { activeLots, identified, lotName, animals } = useHerd()
  const toast = useToast()
  const blank = () => ({ opId: newId(farm!.id, 'herdTransfers'), date: today(), sel: emptyExit(), toFarmId: farm!.id, toLotId: '', toCategoryId: '', avgKg: '', reason: '', notes: '' })
  const [f, setF] = useState(blank)
  const [other, setOther] = useState<{ lots: HerdLot[]; categories: Named[] } | null>(null)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const recs = useOps<TRec>('herdTransfers')
  const external = f.toFarmId !== farm!.id
  const editableFarms = farms.filter((x) => x.id !== farm!.id && (x.role === 'owner' || x.role === 'admin'))
  useEffect(() => { setOther(null); if (external) fetchOtherFarmLots(f.toFarmId).then(setOther).catch((e) => setErr(herdErr(e))) }, [f.toFarmId, external])
  const lot = activeLots.find((l) => l.id === f.sel.lotId)
  const idCount = f.sel.lotId && f.sel.key ? identified(f.sel.lotId, f.sel.key).length : 0
  const destLots = external ? other?.lots ?? [] : activeLots.filter((l) => l.id !== f.sel.lotId)

  async function save() {
    const r = readExit(f.sel, idCount, lot?.balances?.[f.sel.key] ?? 0)
    if ('error' in r) return setErr(r.error!)
    if (!f.toLotId) return setErr('Selecione o lote de destino.')
    if (external && !f.toCategoryId) return setErr('Selecione a categoria correspondente na fazenda de destino.')
    if (!f.reason.trim()) return setErr('Informe o motivo.')
    setSaving(true); setErr('')
    try {
      await saveTransfer(farm!.id, f.opId, { ...r.data!, date: f.date, notes: f.notes.trim(), toLotId: f.toLotId, toFarmId: external ? f.toFarmId : null, toCategoryId: f.toCategoryId || undefined, avgKg: dec(f.avgKg), reason: f.reason.trim() }, idCount, animals)
      toast('success', `Transferência registrada: ${r.qty} cab.${external ? ' para outra fazenda' : ' — total da fazenda inalterado'}.`)
      setF({ ...blank(), date: f.date })
    } catch (e) { setErr(herdErr(e)) } finally { setSaving(false) }
  }
  return (
    <>
      <PageHeader title="Transferências" subtitle="Entre lotes (o total da fazenda não muda) ou entre fazendas. Nunca contabilizadas como compra ou venda." />
      {canEdit && (
        <Card className="mb-5">
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label="Data *"><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="Destino">
              <select className="input" value={f.toFarmId} onChange={(e) => setF({ ...f, toFarmId: e.target.value, toLotId: '', toCategoryId: '' })}>
                <option value={farm!.id}>Esta fazenda (outro lote)</option>
                {editableFarms.map((x) => <option key={x.id} value={x.id}>Fazenda: {x.name}</option>)}
              </select>
            </Field>
            <div className="sm:col-span-2"><LotKeyPicker value={f.sel} onChange={(sel) => setF({ ...f, sel })} /></div>
            <Field label="Lote de destino *">
              <select className="input" value={f.toLotId} onChange={(e) => setF({ ...f, toLotId: e.target.value })}><option value="">Selecione…</option>{destLots.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.count})</option>)}</select>
            </Field>
            {external && <Field label="Categoria na fazenda de destino *">
              <select className="input" value={f.toCategoryId} onChange={(e) => setF({ ...f, toCategoryId: e.target.value })}><option value="">Selecione…</option>{other?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </Field>}
            <Field label="Peso médio (kg)"><input className="input" inputMode="decimal" value={f.avgKg} onChange={(e) => setF({ ...f, avgKg: e.target.value })} /></Field>
            <Field label="Motivo *"><input className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={200} placeholder="Ex.: troca de pasto, apartação" /></Field>
            <Field label="Observações" className="sm:col-span-2"><input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={500} /></Field>
          </div>
          {err && <div className="px-4 pb-2"><ErrorBox>{err}</ErrorBox></div>}
          <div className="flex justify-end border-t border-stone-200 p-3 dark:border-stone-800"><Button loading={saving} onClick={save}>Registrar transferência</Button></div>
        </Card>
      )}
      <OpTable title="Transferências registradas" rows={recs} head={['Data', 'Origem', 'Destino', 'Cab.', 'Motivo', 'Tipo']}
        render={(t) => <tr key={(t as TRec & { id: string }).id}><td className="td tabular">{fmtDate(t.date)}</td>
          <td className="td">{t.direction === 'entrada' ? `Outra fazenda` : lotName(t.lotId)}</td><td className="td">{t.external && t.direction !== 'entrada' ? 'Outra fazenda' : lotName(t.toLotId)}</td>
          <td className="td tabular">{t.qty}</td><td className="td">{t.reason}</td><td className="td">{t.external ? <Badge tone="blue">{t.direction === 'entrada' ? 'Recebida' : 'Entre fazendas'}</Badge> : <Badge>Interna</Badge>}</td></tr>} />
    </>
  )
}
