import { addYears, daysBetween } from './format'
import type { ExpenseEntry, Obligation } from './types'
import { OBLIGATION_LABEL } from './types'

export const obligationName = (o: Pick<Obligation, 'type' | 'title'>) =>
  o.type === 'outro' && o.title ? o.title : OBLIGATION_LABEL[o.type]

export type ObligationState = 'pago' | 'vencido' | 'pendente'
export function obligationState(o: Pick<Obligation, 'status' | 'dueDate'>, today: string): ObligationState {
  if (o.status === 'pago') return 'pago'
  return o.dueDate < today ? 'vencido' : 'pendente'
}

export interface Alert { obligation: Obligation; daysLeft: number; level: 'overdue' | 'today' | 'soon' }

/**
 * Alertas: obrigações pendentes vencidas, vencendo hoje, ou dentro do maior prazo configurado.
 * Os prazos (ex.: 30/15/7/0) definem a janela; o alerta mostra o marco mais próximo atingido.
 */
export function obligationAlerts(list: Obligation[], today: string, alertDays: number[]): Alert[] {
  const window = Math.max(0, ...alertDays)
  return list
    .filter((o) => o.status === 'pendente')
    .map((o) => ({ obligation: o, daysLeft: daysBetween(today, o.dueDate) }))
    .filter((a) => a.daysLeft <= window)
    .map((a) => ({ ...a, level: (a.daysLeft < 0 ? 'overdue' : a.daysLeft === 0 ? 'today' : 'soon') as Alert['level'] }))
    .sort((a, b) => a.daysLeft - b.daysLeft)
}

/** Marco de aviso atingido (ex.: 15 quando faltam 12 dias com prazos 30/15/7/0). */
export function alertMilestone(daysLeft: number, alertDays: number[]): number | null {
  const hits = alertDays.filter((d) => daysLeft <= d).sort((a, b) => a - b)
  return hits.length ? hits[0] : null
}

/** Próxima ocorrência anual de uma obrigação paga (não marcada como paga). */
export function nextOccurrence(o: Obligation): Omit<Obligation, 'id'> {
  const ref = o.referencePeriod && /^\d{4}$/.test(o.referencePeriod) ? String(Number(o.referencePeriod) + 1) : o.referencePeriod
  return {
    type: o.type,
    title: o.title ?? '',
    collaboratorId: o.collaboratorId,
    collaboratorName: o.collaboratorName,
    referencePeriod: ref ?? '',
    dueDate: addYears(o.dueDate, 1),
    paidDate: null,
    amount: o.amount ?? null,
    note: '',
    status: 'pendente',
    recurrence: 'yearly',
  }
}

export function sum(entries: { amount: number }[]): number {
  return entries.reduce((s, e) => s + (e.amount || 0), 0)
}

/** Agrupa e totaliza; retorna ordenado por total desc. */
export function groupTotals<T extends { amount: number }>(items: T[], key: (i: T) => string): { key: string; total: number; count: number }[] {
  const map = new Map<string, { total: number; count: number }>()
  for (const i of items) {
    const k = key(i)
    const cur = map.get(k) ?? { total: 0, count: 0 }
    cur.total += i.amount || 0
    cur.count++
    map.set(k, cur)
  }
  return [...map.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.total - a.total)
}

export const entryCategory = (e: ExpenseEntry) => (e.kind === 'labor' ? 'Mão de obra' : e.categoryName || 'Sem categoria')
