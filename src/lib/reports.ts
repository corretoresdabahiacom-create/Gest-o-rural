import { fmtDate, monthLabel, monthsBetween } from './format'
import { entryCategory, groupTotals, obligationName, obligationState, sum } from './domain'
import type { ExpenseEntry, Obligation, ObligationType } from './types'

export type ReportId = 'geral' | 'colaborador' | 'tipo' | 'categoria' | 'ferias' | 'decimo' | 'pendentes' | 'pagas' | 'mensal' | 'comparativo'
export const REPORTS: { id: ReportId; label: string }[] = [
  { id: 'geral', label: 'Despesas gerais por período' },
  { id: 'colaborador', label: 'Pagamentos por colaborador' },
  { id: 'tipo', label: 'Pagamentos por tipo de mão de obra' },
  { id: 'categoria', label: 'Despesas por categoria' },
  { id: 'ferias', label: 'Histórico de férias' },
  { id: 'decimo', label: 'Histórico de 13º salário' },
  { id: 'pendentes', label: 'Obrigações pendentes' },
  { id: 'pagas', label: 'Obrigações pagas' },
  { id: 'mensal', label: 'Resumo financeiro mensal' },
  { id: 'comparativo', label: 'Comparativo entre períodos' },
]

export interface Filters {
  start: string; end: string
  collaboratorId: string // '' = todos
  laborTypeId: string    // '' = todos
  expenseType: string    // '' = todos | 'labor' | categoryId
  compareStart?: string; compareEnd?: string
}
export type CellType = 'text' | 'money' | 'date' | 'number' | 'percent' | 'kg' | 'decimal'
export interface Column { key: string; label: string; type?: CellType }
export interface ReportResult { title: string; subtitle: string; columns: Column[]; rows: Record<string, string | number | null>[]; totals?: Record<string, string | number | null> }

/** Aplica exatamente os filtros de colaborador/tipo/despesa aos lançamentos. */
export function filterEntries(entries: ExpenseEntry[], f: Filters): ExpenseEntry[] {
  return entries.filter((e) => {
    if (e.date < f.start || e.date > f.end) return false
    if (f.collaboratorId && e.collaboratorId !== f.collaboratorId) return false
    if (f.laborTypeId && e.laborTypeId !== f.laborTypeId) return false
    if (f.expenseType === 'labor' && e.kind !== 'labor') return false
    if (f.expenseType && f.expenseType !== 'labor' && e.categoryId !== f.expenseType) return false
    return true
  })
}

const FERIAS: ObligationType[] = ['ferias', 'adiantamento_ferias', 'terco_ferias']
const DECIMO: ObligationType[] = ['decimo_1', 'decimo_2']

function filterObligations(list: Obligation[], f: Filters, types: ObligationType[] | null, dateOf: (o: Obligation) => string | null | undefined, laborTypeOf: (id: string) => string | undefined) {
  return list.filter((o) => {
    const d = dateOf(o)
    if (!d || d < f.start || d > f.end) return false
    if (types && !types.includes(o.type)) return false
    if (f.collaboratorId && o.collaboratorId !== f.collaboratorId) return false
    if (f.laborTypeId && laborTypeOf(o.collaboratorId) !== f.laborTypeId) return false
    return true
  })
}

export function buildReport(id: ReportId, f: Filters, entries: ExpenseEntry[], obligations: Obligation[], today: string,
  laborTypeOf: (collaboratorId: string) => string | undefined, compareEntries: ExpenseEntry[] = []): ReportResult {
  const subtitle = `Período: ${fmtDate(f.start)} a ${fmtDate(f.end)}`
  const list = filterEntries(entries, f)
  const oblCols: Column[] = [
    { key: 'colaborador', label: 'Colaborador' }, { key: 'obrigacao', label: 'Obrigação' }, { key: 'ref', label: 'Referência' },
    { key: 'prevista', label: 'Data prevista', type: 'date' }, { key: 'pagamento', label: 'Data de pagamento', type: 'date' },
    { key: 'valor', label: 'Valor', type: 'money' }, { key: 'status', label: 'Status' },
  ]
  const oblRow = (o: Obligation) => ({
    colaborador: o.collaboratorName, obrigacao: obligationName(o), ref: o.referencePeriod || '', prevista: o.dueDate, pagamento: o.paidDate ?? null,
    valor: o.amount ?? null, status: ({ pago: 'Pago', vencido: 'Vencido', pendente: 'Pendente' } as const)[obligationState(o, today)],
  })
  const oblTotals = (rows: { valor: number | null }[]) => ({ colaborador: `TOTAL (${rows.length})`, valor: rows.reduce((s, r) => s + (r.valor ?? 0), 0) })

  switch (id) {
    case 'geral': {
      const rows = [...list].sort((a, b) => a.date.localeCompare(b.date)).map((e) => ({
        data: e.date, tipo: entryCategory(e), nome: e.kind === 'labor' ? `${e.collaboratorName} (${e.laborTypeName})` : e.categoryName ?? '',
        descricao: (e.kind === 'labor' ? e.note : e.description) ?? '', valor: e.amount,
      }))
      return { title: 'Despesas gerais por período', subtitle, rows,
        columns: [{ key: 'data', label: 'Data', type: 'date' }, { key: 'tipo', label: 'Tipo' }, { key: 'nome', label: 'Colaborador / Categoria' }, { key: 'descricao', label: 'Descrição' }, { key: 'valor', label: 'Valor', type: 'money' }],
        totals: { data: `TOTAL (${rows.length})`, valor: sum(list) } }
    }
    case 'colaborador':
    case 'tipo': {
      const labor = list.filter((e) => e.kind === 'labor')
      const g = groupTotals(labor, (e) => (id === 'colaborador' ? `${e.collaboratorId}|${e.collaboratorName}|${e.laborTypeName ?? ''}` : e.laborTypeName || '—'))
      const rows: Record<string, string | number | null>[] = g.map((x) => id === 'colaborador'
        ? { nome: x.key.split('|')[1], tipo: x.key.split('|')[2], qtd: x.count, valor: x.total }
        : { nome: x.key, tipo: null, qtd: x.count, valor: x.total })
      const columns: Column[] = id === 'colaborador'
        ? [{ key: 'nome', label: 'Colaborador' }, { key: 'tipo', label: 'Tipo de mão de obra' }, { key: 'qtd', label: 'Pagamentos', type: 'number' }, { key: 'valor', label: 'Total', type: 'money' }]
        : [{ key: 'nome', label: 'Tipo de mão de obra' }, { key: 'qtd', label: 'Pagamentos', type: 'number' }, { key: 'valor', label: 'Total', type: 'money' }]
      return { title: id === 'colaborador' ? 'Pagamentos por colaborador' : 'Pagamentos por tipo de mão de obra', subtitle, columns, rows,
        totals: { nome: 'TOTAL', qtd: labor.length, valor: sum(labor) } }
    }
    case 'categoria': {
      const total = sum(list)
      const rows = groupTotals(list, entryCategory).map((x) => ({ nome: x.key, qtd: x.count, valor: x.total, pct: total ? x.total / total : 0 }))
      return { title: 'Despesas por categoria', subtitle, rows,
        columns: [{ key: 'nome', label: 'Categoria' }, { key: 'qtd', label: 'Lançamentos', type: 'number' }, { key: 'valor', label: 'Total', type: 'money' }, { key: 'pct', label: '% do total', type: 'percent' }],
        totals: { nome: 'TOTAL', qtd: list.length, valor: total, pct: total ? 1 : 0 } }
    }
    case 'ferias':
    case 'decimo': {
      const rows = filterObligations(obligations, f, id === 'ferias' ? FERIAS : DECIMO, (o) => o.paidDate ?? o.dueDate, laborTypeOf)
        .sort((a, b) => (a.paidDate ?? a.dueDate).localeCompare(b.paidDate ?? b.dueDate)).map(oblRow)
      return { title: id === 'ferias' ? 'Histórico de férias' : 'Histórico de 13º salário', subtitle: `${subtitle} (data de pagamento, ou prevista se não pago)`, columns: oblCols, rows, totals: oblTotals(rows) }
    }
    case 'pendentes': {
      const rows = filterObligations(obligations.filter((o) => o.status === 'pendente'), f, null, (o) => o.dueDate, laborTypeOf)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(oblRow)
      return { title: 'Obrigações pendentes', subtitle: `${subtitle} (data prevista)`, columns: oblCols, rows, totals: oblTotals(rows) }
    }
    case 'pagas': {
      const rows = filterObligations(obligations.filter((o) => o.status === 'pago'), f, null, (o) => o.paidDate, laborTypeOf)
        .sort((a, b) => (a.paidDate ?? '').localeCompare(b.paidDate ?? '')).map(oblRow)
      return { title: 'Obrigações pagas', subtitle: `${subtitle} (data de pagamento)`, columns: oblCols, rows, totals: oblTotals(rows) }
    }
    case 'mensal': {
      const rows = monthsBetween(f.start, f.end).map((ym) => {
        const m = list.filter((e) => e.date.startsWith(ym))
        const l = sum(m.filter((e) => e.kind === 'labor')), o = sum(m.filter((e) => e.kind === 'other'))
        return { mes: monthLabel(ym), labor: l, other: o, total: l + o, qtd: m.length }
      })
      const l = sum(list.filter((e) => e.kind === 'labor')), o = sum(list.filter((e) => e.kind === 'other'))
      return { title: 'Resumo financeiro mensal', subtitle, rows,
        columns: [{ key: 'mes', label: 'Mês' }, { key: 'qtd', label: 'Lançamentos', type: 'number' }, { key: 'labor', label: 'Mão de obra', type: 'money' }, { key: 'other', label: 'Outras despesas', type: 'money' }, { key: 'total', label: 'Total', type: 'money' }],
        totals: { mes: 'TOTAL', qtd: list.length, labor: l, other: o, total: l + o } }
    }
    case 'comparativo': {
      const fb = { ...f, start: f.compareStart ?? '', end: f.compareEnd ?? '' }
      const listB = filterEntries(compareEntries, fb)
      const a = new Map(groupTotals(list, entryCategory).map((x) => [x.key, x.total]))
      const b = new Map(groupTotals(listB, entryCategory).map((x) => [x.key, x.total]))
      const keys = [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => (b.get(y) ?? 0) + (a.get(y) ?? 0) - (b.get(x) ?? 0) - (a.get(x) ?? 0))
      const row = (nome: string, va: number, vb: number) => ({ nome, a: va, b: vb, diff: vb - va, var: va ? (vb - va) / va : null })
      const ta = sum(list), tb = sum(listB)
      return { title: 'Comparativo de despesas entre períodos', subtitle: `A: ${fmtDate(f.start)} a ${fmtDate(f.end)} · B: ${fmtDate(fb.start)} a ${fmtDate(fb.end)}`,
        rows: keys.map((k) => row(k, a.get(k) ?? 0, b.get(k) ?? 0)),
        columns: [{ key: 'nome', label: 'Categoria' }, { key: 'a', label: 'Período A', type: 'money' }, { key: 'b', label: 'Período B', type: 'money' }, { key: 'diff', label: 'Diferença (B − A)', type: 'money' }, { key: 'var', label: 'Variação', type: 'percent' }],
        totals: { ...row('TOTAL', ta, tb) } }
    }
  }
}
