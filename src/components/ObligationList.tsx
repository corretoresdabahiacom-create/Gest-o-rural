import { useState } from 'react'
import { writeBatch } from 'firebase/firestore'
import { CheckCircle2, Pencil, Trash2 } from 'lucide-react'
import { db } from '../lib/firebase'
import { addLog, farmDoc, friendlyError } from '../lib/db'
import { fmtDate, money, today } from '../lib/format'
import { obligationName, obligationState } from '../lib/domain'
import type { Obligation } from '../lib/types'
import { useApp } from '../contexts/AppContext'
import { Badge, Button, Empty, useToast } from './ui'
import { ObligationForm, PayDialog } from './ObligationForm'

export function ObligationList({ items, showCollaborator = true }: { items: Obligation[]; showCollaborator?: boolean }) {
  const { farm, canEdit } = useApp()
  const toast = useToast()
  const [paying, setPaying] = useState<Obligation | null>(null)
  const [editing, setEditing] = useState<Obligation | null>(null)
  const t = today()

  async function remove(o: Obligation) {
    if (!confirm(`Excluir “${obligationName(o)}” de ${o.collaboratorName}?${o.status === 'pago' ? ' O pagamento já lançado como despesa não será removido.' : ''}`)) return
    try {
      const b = writeBatch(db)
      b.delete(farmDoc(farm!.id, 'obligations', o.id))
      addLog(b, farm!.id, 'obrigacao_excluida', `${obligationName(o)} — ${o.collaboratorName} (${o.dueDate})`)
      await b.commit()
      toast('success', 'Obrigação excluída.')
    } catch (e) { toast('error', friendlyError(e)) }
  }

  if (!items.length) return <Empty title="Nenhuma obrigação aqui" />
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="border-b border-stone-200 dark:border-stone-800">
            <tr><th className="th">Obrigação</th>{showCollaborator && <th className="th">Colaborador</th>}<th className="th">Ref.</th><th className="th">Prevista</th><th className="th">Pagamento</th><th className="th text-right">Valor</th><th className="th">Status</th>{canEdit && <th className="th" />}</tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
            {items.map((o) => {
              const st = obligationState(o, t)
              return (
                <tr key={o.id}>
                  <td className="td font-medium">{obligationName(o)}{o.recurrence === 'yearly' && <span className="ml-1 text-xs text-stone-400" title="Recorrente anual">↻</span>}</td>
                  {showCollaborator && <td className="td">{o.collaboratorName}</td>}
                  <td className="td">{o.referencePeriod || '—'}</td>
                  <td className="td tabular">{fmtDate(o.dueDate)}</td>
                  <td className="td tabular">{fmtDate(o.paidDate)}</td>
                  <td className="td tabular text-right">{o.amount ? money(o.amount) : '—'}</td>
                  <td className="td"><Badge tone={st === 'pago' ? 'green' : st === 'vencido' ? 'red' : 'amber'}>{st === 'pago' ? 'Pago' : st === 'vencido' ? 'Vencido' : 'Pendente'}</Badge></td>
                  {canEdit && (
                    <td className="td whitespace-nowrap text-right">
                      {o.status === 'pendente' && <Button size="sm" variant="secondary" onClick={() => setPaying(o)}><CheckCircle2 className="size-4 text-brand-600" />Pagar</Button>}
                      <Button size="sm" variant="ghost" onClick={() => setEditing(o)} aria-label="Editar"><Pencil className="size-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(o)} aria-label="Excluir"><Trash2 className="size-4 text-stone-500" /></Button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <PayDialog obligation={paying} onClose={() => setPaying(null)} />
      <ObligationForm open={!!editing} editing={editing} onClose={() => setEditing(null)} />
    </>
  )
}
