import { serverTimestamp, writeBatch } from 'firebase/firestore'
import { auth, db } from './firebase'
import { addLog, clean, farmDoc, newId } from './db'
import { nextOccurrence, obligationName } from './domain'
import type { Collaborator, Named, Obligation } from './types'

/**
 * Registra o pagamento de uma obrigação (sempre por ação explícita do usuário).
 * Num único lote: marca como paga, opcionalmente lança a despesa de mão de obra
 * (id determinístico — não duplica) e, se recorrente anual, cria a próxima ocorrência pendente.
 */
export async function payObligation(farmId: string, o: Obligation, paidDate: string, amount: number | null,
  opts: { createExpense: boolean; collaborator?: Collaborator; laborTypes: Named[] }) {
  const b = writeBatch(db)
  let nextId = o.nextId
  if (o.recurrence === 'yearly' && !o.nextId) {
    nextId = newId(farmId, 'obligations')
    b.set(farmDoc(farmId, 'obligations', nextId), clean({ ...nextOccurrence(o), createdAt: serverTimestamp() }))
  }
  b.update(farmDoc(farmId, 'obligations', o.id), clean({ status: 'pago', paidDate, amount, nextId, updatedAt: serverTimestamp() }))
  if (opts.createExpense && amount && amount > 0 && opts.collaborator) {
    const lt = opts.laborTypes.find((t) => t.id === opts.collaborator!.laborTypeId)
    b.set(farmDoc(farmId, 'expenseEntries', `obl-${o.id}`), {
      kind: 'labor', date: paidDate, amount, laborTypeId: opts.collaborator.laborTypeId, laborTypeName: lt?.name ?? '',
      collaboratorId: o.collaboratorId, collaboratorName: o.collaboratorName,
      note: `${obligationName(o)}${o.referencePeriod ? ' ' + o.referencePeriod : ''}`.slice(0, 300),
      obligationId: o.id, createdBy: auth.currentUser!.uid, createdAt: serverTimestamp(),
    })
  }
  addLog(b, farmId, 'obrigacao_paga', `${obligationName(o)} — ${o.collaboratorName} em ${paidDate}`)
  await b.commit()
}
