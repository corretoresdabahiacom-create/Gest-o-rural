import { describe, expect, it } from 'vitest'
import { balancesFromMovements, inverseMovement, reconcile, type HerdLot, type HerdMovement } from '../herd'
import { buildHerdReport, type HerdData, type HerdFilters } from '../herdReports'
import { buildReport, type Filters } from '../reports'
import type { RevenueEntry } from '../types'

const K = 'bois|M', G = 'garrotes|M'
const m = (id: string, type: HerdMovement['type'], lotId: string, key1: string, qty1: number, refId: string, date = '2026-10-01', key2?: string, qty2?: number): HerdMovement =>
  ({ id, type, date, lotId, keys: key2 ? [key1, key2] : [key1], key1, qty1, key2, qty2, total: qty1 + (qty2 ?? 0), refId })
const rev = (orig: HerdMovement, date = '2026-10-05'): HerdMovement => {
  const inv = inverseMovement(orig)
  return { ...orig, ...inv, id: `rev-${orig.refId}-${orig.lotId}`, type: 'estorno', date, keys: inv.key2 ? [inv.key1, inv.key2] : [inv.key1], total: inv.qty1 + (inv.qty2 ?? 0), refId: `rev-${orig.refId}` }
}
const total = (movs: HerdMovement[], upTo?: string) => Object.values(balancesFromMovements(movs, upTo)).reduce((s, k) => s + Object.values(k).reduce((a, q) => a + q, 0), 0)

describe('estorno de operações', () => {
  const compra = m('c', 'compra', 'A', K, 100, 'p1', '2026-09-01')
  const venda = m('v', 'venda', 'A', K, -30, 's1')
  const tSai = m('ts', 'transf_saida', 'A', K, -20, 't1'), tEnt = m('te', 'transf_entrada', 'B', K, 20, 't1')
  const troca = m('tc', 'troca_categoria', 'B', K, -5, 'cc1', '2026-10-02', G, 5)

  it('inverte quantidades das duas chaves', () => {
    expect(inverseMovement(troca)).toEqual({ key1: K, qty1: 5, key2: G, qty2: -5 })
    expect(inverseMovement(venda)).toEqual({ key1: K, qty1: 30, key2: undefined, qty2: undefined })
  })
  it('estorno de venda devolve os 30 animais; histórico anterior ao estorno é preservado', () => {
    const movs = [compra, venda, rev(venda)]
    expect(total(movs)).toBe(100)
    expect(total(movs, '2026-10-03')).toBe(70) // antes do estorno o saldo era 70
  })
  it('estorno de transferência devolve ao lote de origem sem mudar o total', () => {
    const movs = [compra, tSai, tEnt, rev(tSai), rev(tEnt)]
    const bal = balancesFromMovements(movs)
    expect([bal.A[K], bal.B[K], total(movs)]).toEqual([100, 0, 100])
  })
  it('estorno de mudança de categoria restaura as categorias', () => {
    const movs = [compra, tSai, tEnt, troca, rev(troca)]
    expect(balancesFromMovements(movs).B).toEqual({ [K]: 20, [G]: 0 })
  })
  it('estorno de compra zera a entrada e a reconciliação continua correta', () => {
    const movs = [compra, rev(compra)]
    const lot: HerdLot = { id: 'A', name: 'A', sex: 'M', active: true, count: 0, balances: { [K]: 0 } }
    expect(total(movs)).toBe(0)
    expect(reconcile([lot], movs)).toEqual([])
  })

  it('relatórios ignoram operações estornadas e listam os estornos', () => {
    const f: HerdFilters = { start: '2026-01-01', end: '2026-12-31', lotId: '', categoryId: '', sex: '', movType: '', seller: '', buyer: '' }
    const d: HerdData = { lots: [], movs: [], today: '2026-11-03', catName: (c) => c ?? '', lotName: (l) => l ?? '', unitName: (u) => u, vaccinations: [], deaths: [], transfers: [], purchases: [],
      reversals: [{ originalId: 's1', date: '2026-10-05', reason: 'lançada em duplicidade' }],
      sales: [
        { id: 's1', reversedBy: 'rev-s1', date: '2026-10-01', buyerName: 'X', lotId: 'A', categoryId: 'bois', sex: 'M', qty: 30, totalKg: 13500, avgKg: 450, unit: 'vivo', gross: 1000, expenses: [], expensesTotal: 0, net: 1000 },
        { id: 's2', date: '2026-10-02', buyerName: 'Y', lotId: 'A', categoryId: 'bois', sex: 'M', qty: 10, totalKg: 4500, avgKg: 450, unit: 'vivo', gross: 500, expenses: [], expensesTotal: 0, net: 500 },
      ] }
    expect(buildHerdReport('vendas', f, d).totals).toMatchObject({ qtd: 10, liq: 500 })
    expect(buildHerdReport('estornos', f, d).rows).toEqual([{ data: '2026-10-05', tipo: 'Venda', orig: '2026-10-01', lote: 'A', qtd: 30, valor: 1000, motivo: 'lançada em duplicidade' }])
  })
})

describe('receitas no financeiro', () => {
  const f: Filters = { start: '2026-10-01', end: '2026-11-30', collaboratorId: '', laborTypeId: '', expenseType: '' }
  const entries = [{ id: 'e', kind: 'other' as const, date: '2026-10-10', amount: 50000, categoryId: 'c', categoryName: 'Combustível' }]
  const revenues: RevenueEntry[] = [{ id: 'herd-sale-s2', date: '2026-10-15', amount: 13045000, source: 'venda_animais', description: 'Venda de 30 cab.' }, { id: 'r', date: '2026-11-01', amount: 100000, source: 'outra', description: 'Arrendamento' }]
  it('resumo mensal inclui receitas e resultado', () => {
    const r = buildReport('mensal', f, entries, [], '2026-11-03', () => undefined, [], revenues)
    expect(r.rows.map((x) => [x.receitas, x.resultado])).toEqual([[13045000, 12995000], [100000, 100000]])
    expect(r.totals).toMatchObject({ total: 50000, receitas: 13145000, resultado: 13095000 })
  })
  it('com filtro de categoria, receitas ficam fora (não pertencem a categorias de despesa)', () => {
    expect(buildReport('mensal', { ...f, expenseType: 'c' }, entries, [], '2026-11-03', () => undefined, [], revenues).totals).toMatchObject({ receitas: 0 })
  })
  it('relatório de receitas por período', () => {
    const r = buildReport('receitas', { ...f, end: '2026-10-31' }, [], [], '2026-11-03', () => undefined, [], revenues)
    expect(r.rows).toHaveLength(1)
    expect(r.totals).toMatchObject({ valor: 13045000 })
  })
})
