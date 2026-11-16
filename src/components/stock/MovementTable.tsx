import { useState } from 'react'
import { Undo2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApp } from '../../contexts/AppContext'
import { fmtDate, money, today } from '../../lib/format'
import { reverseMovement } from '../../lib/stockDb'
import { fmtQty, MOVE_LABEL, reasonLabel, StockError, type StockMovement } from '../../lib/stock'
import { friendlyError } from '../../lib/db'
import { Badge, Button, Empty, ErrorBox, Field, Modal, useToast } from '../ui'

export function MovementTable({ moves, reversed, showItem }: { moves: StockMovement[]; reversed: Set<string>; showItem?: boolean }) {
  const { farm, canEdit } = useApp()
  const toast = useToast()
  const [target, setTarget] = useState<StockMovement | null>(null)
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(today())
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (!moves.length) return <Empty title="Nenhuma movimentação" text="As entradas e saídas registradas aparecem aqui." />

  async function run() {
    if (reason.trim().length < 3) return setErr('Informe o motivo do estorno.')
    setBusy(true); setErr('')
    try {
      await reverseMovement(farm!.id, target!.id, reason, date)
      toast('success', 'Estorno registrado. O saldo foi recomposto e o histórico preservado.')
      setTarget(null)
    } catch (e) { setErr(e instanceof StockError ? e.message : friendlyError(e)) } finally { setBusy(false) }
  }
  const tone = (t: StockMovement['type']) => (t === 'entrada' ? 'green' : t === 'saida' ? 'amber' : t === 'estorno' ? 'stone' : 'blue')
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-stone-200 dark:border-stone-800">
            <tr><th className="th">Data</th>{showItem && <th className="th">Item</th>}<th className="th">Tipo</th><th className="th text-right">Quantidade</th><th className="th text-right">Valor</th><th className="th">Detalhes</th><th className="th" /></tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
            {moves.map((m) => {
              const isRev = reversed.has(m.id)
              return (
                <tr key={m.id} className={isRev ? 'opacity-60' : ''}>
                  <td className="td tabular">{fmtDate(m.date)}</td>
                  {showItem && <td className="td"><Link className="text-brand-700 hover:underline dark:text-brand-300" to={`/estoque/item/${m.itemId}`}>{m.itemName}</Link></td>}
                  <td className="td"><Badge tone={tone(m.type)}>{MOVE_LABEL[m.type]}</Badge></td>
                  <td className="td tabular text-right">{m.qtyDelta > 0 ? '+' : ''}{fmtQty(m.qtyDelta, m.itemUnit)}</td>
                  <td className="td tabular text-right">{m.valueDelta ? money(Math.abs(m.valueDelta)) : '—'}</td>
                  <td className="td text-xs text-stone-500">
                    {[reasonLabel(m.reason), m.party, m.lotName && `lote ${m.lotName}`, m.batchCode && `lote do produto ${m.batchCode}`, m.expiryDate && `validade ${fmtDate(m.expiryDate)}`, m.note].filter(Boolean).join(' · ')}
                  </td>
                  <td className="td text-right">
                    {isRev ? <Badge tone="stone">Estornada</Badge>
                      : canEdit && m.type !== 'estorno' && !m.vaccinationId && <Button size="sm" variant="ghost" onClick={() => { setTarget(m); setReason(''); setErr(''); setDate(today()) }}><Undo2 className="size-4" />Estornar</Button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Modal open={!!target} onClose={() => !busy && setTarget(null)} title="Estornar movimentação"
        footer={<><Button variant="secondary" disabled={busy} onClick={() => setTarget(null)}>Cancelar</Button><Button variant="danger" loading={busy} onClick={run}>Confirmar estorno</Button></>}>
        {target && (
          <div className="space-y-3 text-sm">
            <p><b>{MOVE_LABEL[target.type]} de {target.itemName}</b>: {fmtQty(target.qtyDelta, target.itemUnit)} em {fmtDate(target.date)}.</p>
            <ul className="list-disc space-y-1 pl-5 text-stone-600 dark:text-stone-300">
              <li>Será gravada uma movimentação inversa; nada é apagado do histórico.</li>
              {target.type === 'entrada' && <li>Se o produto já foi usado e o saldo não cobre esta entrada, o estorno é recusado.</li>}
              {target.expenseEntryId && <li>A despesa lançada no financeiro para esta compra será removida.</li>}
              <li>Cada movimentação só pode ser estornada uma vez.</li>
            </ul>
            <Field label="Data do estorno"><input type="date" className="input" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Motivo *"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Ex.: quantidade digitada errada" autoFocus /></Field>
            {err && <ErrorBox>{err}</ErrorBox>}
          </div>
        )}
      </Modal>
    </>
  )
}
