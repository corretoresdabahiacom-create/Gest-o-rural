import { fmtDate, monthLabel, monthRange, monthsBetween } from './format'
import { balancesFromMovements, inventoryTable, MOVEMENT_LABEL, parseKey, type HerdLot, type HerdMovement, type Sex, type Vaccination } from './herd'
import type { Column, ReportResult } from './reports'

export type HerdReportId =
  | 'atual' | 'categoria' | 'lote' | 'sexo' | 'evolucao' | 'data'
  | 'compras' | 'vendas' | 'mortes' | 'transferencias' | 'movimentos'
  | 'investido' | 'bruto' | 'despesas' | 'liquido' | 'custo'
  | 'vac_lote' | 'vac_hist' | 'vac_pend' | 'reforcos'

export const HERD_REPORTS: { group: string; items: { id: HerdReportId; label: string }[] }[] = [
  { group: 'Quantidade', items: [{ id: 'atual', label: 'Rebanho atual' }, { id: 'categoria', label: 'Por categoria' }, { id: 'lote', label: 'Por lote' }, { id: 'sexo', label: 'Por sexo' }, { id: 'evolucao', label: 'Evolução do rebanho' }, { id: 'data', label: 'Inventário por data' }] },
  { group: 'Movimentação', items: [{ id: 'compras', label: 'Compras' }, { id: 'vendas', label: 'Vendas' }, { id: 'mortes', label: 'Mortes' }, { id: 'transferencias', label: 'Transferências' }, { id: 'movimentos', label: 'Entradas e saídas' }] },
  { group: 'Financeiro', items: [{ id: 'investido', label: 'Total investido em compras' }, { id: 'bruto', label: 'Total bruto de vendas' }, { id: 'despesas', label: 'Despesas de vendas' }, { id: 'liquido', label: 'Total líquido de vendas' }, { id: 'custo', label: 'Custo médio de aquisição' }] },
  { group: 'Sanitário', items: [{ id: 'vac_lote', label: 'Vacinação por lote' }, { id: 'vac_hist', label: 'Histórico de vacinação' }, { id: 'vac_pend', label: 'Vacinas pendentes' }, { id: 'reforcos', label: 'Próximos reforços' }] },
]

export interface HerdFilters { start: string; end: string; lotId: string; categoryId: string; sex: Sex | ''; movType: string; seller: string; buyer: string }

export interface Purchase { id: string; date: string; sellerName: string; buyerName: string; lotId: string; categoryId: string; sex: Sex; qty: number; totalKg: number; avgKg: number; unit: string; kgPerUnit: number; pricePerUnit: number; amount: number; costPerHead: number }
export interface Sale { id: string; date: string; buyerName: string; lotId: string; categoryId: string; sex: Sex; qty: number; totalKg: number; avgKg: number; unit: string; gross: number; expenses: { type: string; amount: number }[]; expensesTotal: number; net: number }
export interface Death { id: string; date: string; lotId: string; categoryId: string; sex: Sex; qty: number; cause: string; responsible?: string }
export interface Transfer { id: string; date: string; lotId: string; toLotId: string; categoryId: string; sex: Sex; qty: number; reason: string; external?: boolean; direction?: string }

export interface HerdData {
  lots: HerdLot[]; movs: HerdMovement[]; purchases: Purchase[]; sales: Sale[]; deaths: Death[]; transfers: Transfer[]; vaccinations: Vaccination[]
  catName: (id?: string) => string; lotName: (id?: string) => string; unitName: (u: string) => string; today: string
}

const inRange = (d: string, f: HerdFilters) => d >= f.start && d <= f.end
const has = (s: string | undefined, q: string) => !q || (s ?? '').toLowerCase().includes(q.toLowerCase())
const okKey = (key: string, f: HerdFilters) => { const { categoryId, sex } = parseKey(key); return (!f.categoryId || categoryId === f.categoryId) && (!f.sex || sex === f.sex) }
const okOp = (o: { lotId: string; categoryId?: string; sex?: Sex }, f: HerdFilters) => (!f.lotId || o.lotId === f.lotId) && (!f.categoryId || o.categoryId === f.categoryId) && (!f.sex || o.sex === f.sex)

/** Filtra os saldos por lote/categoria/sexo (para os relatórios de quantidade). */
function filteredBalances(bal: Record<string, Record<string, number>>, f: HerdFilters) {
  const out: Record<string, Record<string, number>> = {}
  for (const [lot, keys] of Object.entries(bal)) {
    if (f.lotId && lot !== f.lotId) continue
    for (const [k, q] of Object.entries(keys)) if (q && okKey(k, f)) (out[lot] ??= {})[k] = q
  }
  return out
}

export function buildHerdReport(id: HerdReportId, f: HerdFilters, d: HerdData): ReportResult {
  const period = `Período: ${fmtDate(f.start)} a ${fmtDate(f.end)}`
  const current = filteredBalances(Object.fromEntries(d.lots.map((l) => [l.id, l.balances ?? {}])), f)
  const qtyCols: Column[] = [{ key: 'm', label: 'Machos', type: 'number' }, { key: 'f', label: 'Fêmeas', type: 'number' }, { key: 't', label: 'Total', type: 'number' }]

  const invRows = (bal: Record<string, Record<string, number>>) => inventoryTable(bal, d.lotName).map((r) => ({ lote: r.lotName, cat: d.catName(r.categoryId), m: r.males, f: r.females, t: r.total }))
  const sumQ = (rows: { m: number; f: number; t: number }[]) => rows.reduce((s, r) => ({ m: s.m + r.m, f: s.f + r.f, t: s.t + r.t }), { m: 0, f: 0, t: 0 })
  const group = (bal: Record<string, Record<string, number>>, by: (lot: string, cat: string, sex: Sex) => string) => {
    const g: Record<string, { m: number; f: number; t: number }> = {}
    for (const [lot, keys] of Object.entries(bal)) for (const [k, q] of Object.entries(keys)) {
      const { categoryId, sex } = parseKey(k); const r = (g[by(lot, categoryId, sex)] ??= { m: 0, f: 0, t: 0 })
      if (sex === 'M') r.m += q; else r.f += q; r.t += q
    }
    return Object.entries(g).map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.t - a.t)
  }

  switch (id) {
    case 'atual':
    case 'data': {
      const bal = id === 'data' ? filteredBalances(balancesFromMovements(d.movs, f.end), f) : current
      const rows = invRows(bal); const t = sumQ(rows)
      return { title: id === 'atual' ? 'Rebanho atual' : 'Inventário por data', subtitle: id === 'atual' ? `Posição em ${fmtDate(d.today)}` : `Saldo reconstruído pelas movimentações até ${fmtDate(f.end)}`,
        columns: [{ key: 'lote', label: 'Lote' }, { key: 'cat', label: 'Categoria' }, ...qtyCols], rows, totals: { lote: 'TOTAL GERAL', ...t } }
    }
    case 'categoria':
    case 'lote':
    case 'sexo': {
      const rows = group(current, (lot, cat, sex) => (id === 'categoria' ? d.catName(cat) : id === 'lote' ? d.lotName(lot) : sex === 'M' ? 'Machos' : 'Fêmeas'))
      const t = sumQ(rows)
      return { title: `Quantidade por ${id}`, subtitle: `Posição em ${fmtDate(d.today)}`, columns: [{ key: 'nome', label: id === 'categoria' ? 'Categoria' : id === 'lote' ? 'Lote' : 'Sexo' }, ...qtyCols], rows, totals: { nome: 'TOTAL', ...t } }
    }
    case 'evolucao': {
      const movs = d.movs.filter((m) => !f.lotId || m.lotId === f.lotId)
      const rows = monthsBetween(f.start, f.end).map((ym) => {
        const end = monthRange(ym)[1]
        const bal = filteredBalances(balancesFromMovements(movs, end), f)
        const inMonth = movs.filter((m) => m.date.startsWith(ym))
        const delta = (pred: (q: number) => boolean) => inMonth.reduce((s, m) => s + [[m.key1, m.qty1], ...(m.key2 ? [[m.key2, m.qty2 ?? 0]] : [])]
          .filter(([k, q]) => okKey(k as string, f) && pred(q as number)).reduce((a, [, q]) => a + (q as number), 0), 0)
        return { mes: monthLabel(ym), ent: delta((q) => q > 0), sai: -delta((q) => q < 0), saldo: Object.values(bal).reduce((s, k) => s + Object.values(k).reduce((a, q) => a + q, 0), 0) }
      })
      return { title: 'Evolução do rebanho', subtitle: `${period} (saldo ao fim de cada mês; entradas/saídas incluem transferências e mudanças de categoria)`,
        columns: [{ key: 'mes', label: 'Mês' }, { key: 'ent', label: 'Entradas', type: 'number' }, { key: 'sai', label: 'Saídas', type: 'number' }, { key: 'saldo', label: 'Saldo no fim do mês', type: 'number' }], rows }
    }
    case 'compras':
    case 'investido':
    case 'custo': {
      const list = d.purchases.filter((p) => inRange(p.date, f) && okOp(p, f) && has(p.sellerName, f.seller) && has(p.buyerName, f.buyer)).sort((a, b) => a.date.localeCompare(b.date))
      const qty = list.reduce((s, p) => s + p.qty, 0), amount = list.reduce((s, p) => s + p.amount, 0), kg = list.reduce((s, p) => s + p.totalKg, 0)
      if (id === 'compras') return { title: 'Compras por período', subtitle: period, rows: list.map((p) => ({ data: p.date, vendedor: p.sellerName, comprador: p.buyerName, lote: d.lotName(p.lotId), cat: d.catName(p.categoryId), qtd: p.qty, kg: p.totalKg, unid: `${d.unitName(p.unit)} (${p.kgPerUnit} kg)`, preco: p.pricePerUnit, valor: p.amount, cab: p.costPerHead })),
        columns: [{ key: 'data', label: 'Data', type: 'date' }, { key: 'vendedor', label: 'Vendedor' }, { key: 'comprador', label: 'Comprador' }, { key: 'lote', label: 'Lote' }, { key: 'cat', label: 'Categoria' }, { key: 'qtd', label: 'Cab.', type: 'number' }, { key: 'kg', label: 'Peso total', type: 'kg' }, { key: 'unid', label: 'Unidade' }, { key: 'preco', label: 'Preço/unid.', type: 'money' }, { key: 'valor', label: 'Valor total', type: 'money' }, { key: 'cab', label: 'Custo/cab.', type: 'money' }],
        totals: { data: 'TOTAL', qtd: qty, kg, valor: amount, cab: qty ? Math.round(amount / qty) : 0 } }
      if (id === 'investido') {
        const rows = monthsBetween(f.start, f.end).map((ym) => { const m = list.filter((p) => p.date.startsWith(ym)); const q = m.reduce((s, p) => s + p.qty, 0), a = m.reduce((s, p) => s + p.amount, 0); return { mes: monthLabel(ym), ops: m.length, qtd: q, valor: a, cab: q ? Math.round(a / q) : null } })
        return { title: 'Total investido em compras de animais', subtitle: period, rows, columns: [{ key: 'mes', label: 'Mês' }, { key: 'ops', label: 'Compras', type: 'number' }, { key: 'qtd', label: 'Cabeças', type: 'number' }, { key: 'valor', label: 'Investido', type: 'money' }, { key: 'cab', label: 'Custo médio/cab.', type: 'money' }],
          totals: { mes: 'TOTAL', ops: list.length, qtd: qty, valor: amount, cab: qty ? Math.round(amount / qty) : null } }
      }
      const g: Record<string, { q: number; a: number; kg: number }> = {}
      for (const p of list) { const r = (g[p.categoryId] ??= { q: 0, a: 0, kg: 0 }); r.q += p.qty; r.a += p.amount; r.kg += p.totalKg }
      return { title: 'Custo médio de aquisição por animal', subtitle: period, rows: Object.entries(g).map(([c, v]) => ({ cat: d.catName(c), qtd: v.q, valor: v.a, cab: Math.round(v.a / v.q), kg: v.kg / v.q })),
        columns: [{ key: 'cat', label: 'Categoria' }, { key: 'qtd', label: 'Cabeças', type: 'number' }, { key: 'valor', label: 'Investido', type: 'money' }, { key: 'kg', label: 'Peso médio', type: 'kg' }, { key: 'cab', label: 'Custo médio/cab.', type: 'money' }],
        totals: { cat: 'GERAL', qtd: qty, valor: amount, kg: qty ? kg / qty : 0, cab: qty ? Math.round(amount / qty) : 0 } }
    }
    case 'vendas':
    case 'bruto':
    case 'liquido':
    case 'despesas': {
      const list = d.sales.filter((s) => inRange(s.date, f) && okOp(s, f) && has(s.buyerName, f.buyer)).sort((a, b) => a.date.localeCompare(b.date))
      const tq = list.reduce((s, x) => s + x.qty, 0), tg = list.reduce((s, x) => s + x.gross, 0), te = list.reduce((s, x) => s + x.expensesTotal, 0), tn = list.reduce((s, x) => s + x.net, 0)
      if (id === 'vendas') return { title: 'Vendas por período', subtitle: period, rows: list.map((s) => ({ data: s.date, comprador: s.buyerName, lote: d.lotName(s.lotId), cat: d.catName(s.categoryId), qtd: s.qty, kg: s.totalKg, unid: d.unitName(s.unit), bruto: s.gross, desp: s.expensesTotal, liq: s.net })),
        columns: [{ key: 'data', label: 'Data', type: 'date' }, { key: 'comprador', label: 'Comprador' }, { key: 'lote', label: 'Lote' }, { key: 'cat', label: 'Categoria' }, { key: 'qtd', label: 'Cab.', type: 'number' }, { key: 'kg', label: 'Peso', type: 'kg' }, { key: 'unid', label: 'Unidade' }, { key: 'bruto', label: 'Bruto', type: 'money' }, { key: 'desp', label: 'Despesas', type: 'money' }, { key: 'liq', label: 'Líquido', type: 'money' }],
        totals: { data: 'TOTAL', qtd: tq, kg: list.reduce((s, x) => s + x.totalKg, 0), bruto: tg, desp: te, liq: tn } }
      if (id === 'despesas') {
        const g: Record<string, number> = {}
        for (const s of list) for (const e of s.expenses ?? []) g[e.type] = (g[e.type] ?? 0) + e.amount
        return { title: 'Total de despesas de vendas', subtitle: period, rows: Object.entries(g).sort((a, b) => b[1] - a[1]).map(([t, v]) => ({ tipo: t, valor: v, pct: te ? v / te : 0 })),
          columns: [{ key: 'tipo', label: 'Tipo de despesa' }, { key: 'valor', label: 'Total', type: 'money' }, { key: 'pct', label: '% das despesas', type: 'percent' }], totals: { tipo: 'TOTAL', valor: te, pct: te ? 1 : 0 } }
      }
      const rows = monthsBetween(f.start, f.end).map((ym) => { const m = list.filter((s) => s.date.startsWith(ym)); return { mes: monthLabel(ym), qtd: m.reduce((s, x) => s + x.qty, 0), bruto: m.reduce((s, x) => s + x.gross, 0), desp: m.reduce((s, x) => s + x.expensesTotal, 0), liq: m.reduce((s, x) => s + x.net, 0) } })
      return { title: id === 'bruto' ? 'Total bruto de vendas' : 'Total líquido de vendas', subtitle: period, rows,
        columns: [{ key: 'mes', label: 'Mês' }, { key: 'qtd', label: 'Cabeças', type: 'number' }, { key: 'bruto', label: 'Bruto', type: 'money' }, { key: 'desp', label: 'Despesas', type: 'money' }, { key: 'liq', label: 'Líquido', type: 'money' }],
        totals: { mes: 'TOTAL', qtd: tq, bruto: tg, desp: te, liq: tn } }
    }
    case 'mortes': {
      const list = d.deaths.filter((x) => inRange(x.date, f) && okOp(x, f)).sort((a, b) => a.date.localeCompare(b.date))
      return { title: 'Mortes por período', subtitle: period, rows: list.map((x) => ({ data: x.date, lote: d.lotName(x.lotId), cat: d.catName(x.categoryId), sexo: x.sex === 'M' ? 'Macho' : 'Fêmea', qtd: x.qty, causa: x.cause, resp: x.responsible ?? '' })),
        columns: [{ key: 'data', label: 'Data', type: 'date' }, { key: 'lote', label: 'Lote' }, { key: 'cat', label: 'Categoria' }, { key: 'sexo', label: 'Sexo' }, { key: 'qtd', label: 'Cab.', type: 'number' }, { key: 'causa', label: 'Causa provável' }, { key: 'resp', label: 'Responsável' }],
        totals: { data: 'TOTAL', qtd: list.reduce((s, x) => s + x.qty, 0) } }
    }
    case 'transferencias': {
      const list = d.transfers.filter((x) => inRange(x.date, f) && (!f.lotId || x.lotId === f.lotId || x.toLotId === f.lotId) && (!f.categoryId || x.categoryId === f.categoryId) && (!f.sex || x.sex === f.sex)).sort((a, b) => a.date.localeCompare(b.date))
      return { title: 'Transferências por período', subtitle: period, rows: list.map((x) => ({ data: x.date, origem: x.direction === 'entrada' ? 'Outra fazenda' : d.lotName(x.lotId), destino: x.external && x.direction !== 'entrada' ? 'Outra fazenda' : d.lotName(x.toLotId), cat: d.catName(x.categoryId), qtd: x.qty, tipo: x.external ? 'Entre fazendas' : 'Interna', motivo: x.reason })),
        columns: [{ key: 'data', label: 'Data', type: 'date' }, { key: 'origem', label: 'Origem' }, { key: 'destino', label: 'Destino' }, { key: 'cat', label: 'Categoria' }, { key: 'qtd', label: 'Cab.', type: 'number' }, { key: 'tipo', label: 'Tipo' }, { key: 'motivo', label: 'Motivo' }],
        totals: { data: 'TOTAL', qtd: list.reduce((s, x) => s + x.qty, 0) } }
    }
    case 'movimentos': {
      const list = d.movs.filter((m) => inRange(m.date, f) && (!f.lotId || m.lotId === f.lotId) && (!f.movType || m.type === f.movType) && m.keys.some((k) => okKey(k, f)))
      const rows = list.map((m) => ({ data: m.date, tipo: MOVEMENT_LABEL[m.type], lote: d.lotName(m.lotId), cat: m.key2 ? `${d.catName(parseKey(m.key1).categoryId)} → ${d.catName(parseKey(m.key2).categoryId)}` : d.catName(parseKey(m.key1).categoryId),
        ent: m.key2 ? 0 : Math.max(0, m.total), sai: m.key2 ? 0 : Math.max(0, -m.total), obs: m.note ?? '' }))
      return { title: 'Histórico de entradas e saídas', subtitle: period, rows,
        columns: [{ key: 'data', label: 'Data', type: 'date' }, { key: 'tipo', label: 'Movimentação' }, { key: 'lote', label: 'Lote' }, { key: 'cat', label: 'Categoria' }, { key: 'ent', label: 'Entradas', type: 'number' }, { key: 'sai', label: 'Saídas', type: 'number' }, { key: 'obs', label: 'Observação' }],
        totals: { data: 'TOTAL', ent: rows.reduce((s, r) => s + r.ent, 0), sai: rows.reduce((s, r) => s + r.sai, 0) } }
    }
    case 'vac_lote':
    case 'vac_hist': {
      const list = d.vaccinations.filter((v) => v.status === 'aplicada' && inRange(v.date, f) && (!f.lotId || v.lotId === f.lotId) && (!f.categoryId || !v.categoryId || v.categoryId === f.categoryId)).sort((a, b) => a.date.localeCompare(b.date))
      if (id === 'vac_hist') return { title: 'Histórico de vacinação', subtitle: period, rows: list.map((v) => ({ data: v.date, lote: d.lotName(v.lotId), cat: v.categoryId ? d.catName(v.categoryId) : 'Todas', vacina: v.vaccine, fab: v.manufacturer ?? '', plote: v.productLot ?? '', dose: v.dose ?? '', qtd: v.qty, resp: v.responsible ?? '', reforco: v.boosterDate ?? null })),
        columns: [{ key: 'data', label: 'Data', type: 'date' }, { key: 'lote', label: 'Lote' }, { key: 'cat', label: 'Categoria' }, { key: 'vacina', label: 'Vacina' }, { key: 'fab', label: 'Fabricante' }, { key: 'plote', label: 'Lote do produto' }, { key: 'dose', label: 'Dose' }, { key: 'qtd', label: 'Cab.', type: 'number' }, { key: 'resp', label: 'Responsável' }, { key: 'reforco', label: 'Reforço', type: 'date' }],
        totals: { data: 'TOTAL', qtd: list.reduce((s, v) => s + v.qty, 0) } }
      const g: Record<string, { apps: number; qtd: number; vac: Set<string>; last: string }> = {}
      for (const v of list) { const r = (g[v.lotId] ??= { apps: 0, qtd: 0, vac: new Set(), last: '' }); r.apps++; r.qtd += v.qty; r.vac.add(v.vaccine); if (v.date > r.last) r.last = v.date }
      return { title: 'Vacinação por lote', subtitle: period, rows: Object.entries(g).map(([l, r]) => ({ lote: d.lotName(l), apps: r.apps, qtd: r.qtd, vacinas: [...r.vac].join(', '), ult: r.last })),
        columns: [{ key: 'lote', label: 'Lote' }, { key: 'apps', label: 'Aplicações', type: 'number' }, { key: 'qtd', label: 'Animais vacinados', type: 'number' }, { key: 'vacinas', label: 'Vacinas' }, { key: 'ult', label: 'Última aplicação', type: 'date' }],
        totals: { lote: 'TOTAL', apps: list.length, qtd: list.reduce((s, v) => s + v.qty, 0) } }
    }
    case 'vac_pend':
    case 'reforcos': {
      const rows = d.vaccinations.flatMap((v) => {
        if (v.boosterDoneById) return []
        if (id === 'vac_pend' && v.status === 'programada') return [{ v, due: v.date, kind: 'Programada' }]
        if (v.status === 'aplicada' && v.boosterDate && (id === 'reforcos' ? v.boosterDate >= d.today : v.boosterDate < d.today)) return [{ v, due: v.boosterDate, kind: id === 'reforcos' ? 'Reforço' : 'Reforço atrasado' }]
        return []
      }).filter((x) => (!f.lotId || x.v.lotId === f.lotId)).sort((a, b) => a.due.localeCompare(b.due))
        .map((x) => ({ due: x.due, tipo: x.kind, situacao: x.due < d.today ? 'Atrasada' : 'No prazo', lote: d.lotName(x.v.lotId), vacina: x.v.vaccine, qtd: x.v.qty, origem: x.v.status === 'aplicada' ? x.v.date : null }))
      return { title: id === 'vac_pend' ? 'Vacinas pendentes (programadas e reforços atrasados)' : 'Próximos reforços', subtitle: `Posição em ${fmtDate(d.today)}`, rows,
        columns: [{ key: 'due', label: 'Data prevista', type: 'date' }, { key: 'tipo', label: 'Tipo' }, { key: 'situacao', label: 'Situação' }, { key: 'lote', label: 'Lote' }, { key: 'vacina', label: 'Vacina' }, { key: 'qtd', label: 'Cab.', type: 'number' }, { key: 'origem', label: 'Aplicação de origem', type: 'date' }],
        totals: { due: `TOTAL (${rows.length})`, qtd: rows.reduce((s, r) => s + r.qtd, 0) } }
    }
  }
}
