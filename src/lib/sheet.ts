import { parseMoney } from './format'
import type { Collaborator, Named } from './types'

export interface LaborRow { key: string; date: string; laborTypeId: string; collaboratorId: string; amount: string; note: string }
export interface OtherRow { key: string; date: string; categoryId: string; description: string; amount: string }
export type RowErrors = Record<string, Partial<Record<string, string>>>

let seq = 0
export const rowKey = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`
export const emptyLabor = (date: string): LaborRow => ({ key: rowKey(), date, laborTypeId: '', collaboratorId: '', amount: '', note: '' })
export const emptyOther = (date: string): OtherRow => ({ key: rowKey(), date, categoryId: '', description: '', amount: '' })

export const isBlankLabor = (r: LaborRow) => !r.laborTypeId && !r.collaboratorId && !r.amount.trim() && !r.note.trim()
export const isBlankOther = (r: OtherRow) => !r.categoryId && !r.description.trim() && !r.amount.trim()

const amountOf = (t: string) => parseMoney(t) ?? 0

export function laborTotals(rows: LaborRow[], collaborators: Collaborator[]) {
  const byId = new Map<string, number>()
  for (const r of rows) if (r.collaboratorId) byId.set(r.collaboratorId, (byId.get(r.collaboratorId) ?? 0) + amountOf(r.amount))
  const perCollaborator = [...byId.entries()].map(([id, total]) => ({
    id, total, name: collaborators.find((c) => c.id === id)?.name ?? '—',
  }))
  return { perCollaborator, total: rows.reduce((s, r) => s + amountOf(r.amount), 0) }
}
export const otherTotal = (rows: OtherRow[]) => rows.reduce((s, r) => s + amountOf(r.amount), 0)

export interface ValidatedSheet {
  errors: RowErrors
  labor: { date: string; amount: number; laborTypeId: string; laborTypeName: string; collaboratorId: string; collaboratorName: string; note: string }[]
  other: { date: string; amount: number; categoryId: string; categoryName: string; description: string }[]
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Valida as linhas preenchidas (linhas totalmente vazias são ignoradas). */
export function validateSheet(laborRows: LaborRow[], otherRows: OtherRow[], laborTypes: Named[], categories: Named[], collaborators: Collaborator[]): ValidatedSheet {
  const errors: RowErrors = {}
  const err = (k: string, f: string, m: string) => ((errors[k] ??= {})[f] = m)
  const out: ValidatedSheet = { errors, labor: [], other: [] }

  for (const r of laborRows) {
    if (isBlankLabor(r)) continue
    const lt = laborTypes.find((t) => t.id === r.laborTypeId)
    const c = collaborators.find((x) => x.id === r.collaboratorId)
    const amount = parseMoney(r.amount)
    if (!DATE_RE.test(r.date)) err(r.key, 'date', 'Data inválida')
    if (!lt) err(r.key, 'laborTypeId', 'Selecione o tipo')
    if (!c) err(r.key, 'collaboratorId', 'Selecione o colaborador')
    else if (lt && c.laborTypeId !== lt.id) err(r.key, 'collaboratorId', 'Colaborador não pertence ao tipo')
    else if (!c.active) err(r.key, 'collaboratorId', 'Colaborador inativo')
    if (amount == null || amount <= 0) err(r.key, 'amount', 'Valor inválido')
    if (!errors[r.key] && lt && c && amount)
      out.labor.push({ date: r.date, amount, laborTypeId: lt.id, laborTypeName: lt.name, collaboratorId: c.id, collaboratorName: c.name, note: r.note.trim() })
  }
  for (const r of otherRows) {
    if (isBlankOther(r)) continue
    const cat = categories.find((t) => t.id === r.categoryId)
    const amount = parseMoney(r.amount)
    if (!DATE_RE.test(r.date)) err(r.key, 'date', 'Data inválida')
    if (!cat) err(r.key, 'categoryId', 'Selecione a categoria')
    if (amount == null || amount <= 0) err(r.key, 'amount', 'Valor inválido')
    if (!errors[r.key] && cat && amount)
      out.other.push({ date: r.date, amount, categoryId: cat.id, categoryName: cat.name, description: r.description.trim() })
  }
  return out
}
