import { useState } from 'react'
import { Undo2 } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { reverseOperation } from '../../lib/herdDb'
import { today } from '../../lib/format'
import { REVERSIBLE_LABEL, type ReversibleCol } from '../../lib/herd'
import { Badge, Button, ErrorBox, Field, Modal, useToast } from '../ui'
import { herdErr } from './HerdForms'

/** Estado de estorno de uma operação: selo "Estornada" ou botão para estornar. */
export function ReverseButton({ col, op, summary }: { col: ReversibleCol; op: { id: string; reversedBy?: string; external?: boolean; direction?: string; revenueEntryId?: string | null; financeEntryId?: string | null }; summary: string }) {
  const { farm, canEdit } = useApp()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(today())
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (op.reversedBy) return <Badge tone="stone">Estornada</Badge>
  if (!canEdit || (col === 'herdTransfers' && op.direction === 'entrada')) return null
  const label = REVERSIBLE_LABEL[col]

  async function run() {
    if (reason.trim().length < 3) return setErr('Informe o motivo do estorno.')
    setBusy(true); setErr('')
    try {
      await reverseOperation(farm!.id, col, op.id, reason.trim(), date)
      toast('success', `Estorno de ${label} registrado. Os saldos foram recompostos e o histórico preservado.`)
      setOpen(false)
    } catch (e) { setErr(herdErr(e)) } finally { setBusy(false) }
  }
  return (
    <>
      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setReason(''); setErr(''); setOpen(true) }} title={`Estornar ${label}`}><Undo2 className="size-4" />Estornar</Button>
      <Modal open={open} onClose={() => !busy && setOpen(false)} title={`Estornar ${label}`}
        footer={<><Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button><Button variant="danger" loading={busy} onClick={run}>Confirmar estorno</Button></>}>
        <div className="space-y-3 text-sm">
          <p><b>{summary}</b></p>
          <ul className="list-disc space-y-1 pl-5 text-stone-600 dark:text-stone-300">
            <li>Serão gravadas movimentações inversas nos lotes afetados; nada é apagado do histórico.</li>
            {col === 'purchases' && <li>Os animais da compra deixam o rebanho. Se já foram vendidos ou transferidos, estorne essas saídas antes.</li>}
            {(col === 'sales' || col === 'mortalityRecords') && <li>Os animais voltam ao saldo do lote{col === 'sales' ? ' e os identificados voltam a ficar ativos' : ''}.</li>}
            {col === 'herdTransfers' && <li>Os animais retornam ao lote de origem{op.external ? ' (e saem da fazenda de destino)' : ''}.</li>}
            {col === 'purchases' && op.financeEntryId && <li>A despesa lançada no financeiro para esta compra será removida.</li>}
            {col === 'sales' && op.revenueEntryId && <li>A receita lançada no financeiro para esta venda será removida.</li>}
            <li>Cada operação só pode ser estornada uma vez.</li>
          </ul>
          <Field label="Data do estorno"><input type="date" className="input" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Motivo *"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Ex.: lançamento em duplicidade, quantidade errada" autoFocus /></Field>
          {err && <ErrorBox>{err}</ErrorBox>}
        </div>
      </Modal>
    </>
  )
}
