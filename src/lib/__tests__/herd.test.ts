import { describe, expect, it } from 'vitest'
import { balancesFromMovements, herdEvolution, inventoryTable, reconcile, saleNet, tradeCalc, vaccineAlerts, weightedAvg, type HerdLot, type HerdMovement, type Vaccination } from '../herd'
import { buildHerdReport, type HerdData, type HerdFilters } from '../herdReports'
import { daysBetween, monthRange } from '../format'

// Simula o ledger como o app faz: cada operação gera movimentações e atualiza o saldo agregado.
let seq = 0
function mv(lotId: string, type: HerdMovement['type'], date: string, key1: string, qty1: number, key2?: string, qty2?: number): HerdMovement {
  return { id: `m${seq++}`, type, date, lotId, keys: key2 ? [key1, key2] : [key1], key1, qty1, key2, qty2, total: qty1 + (qty2 ?? 0) }
}
function applyToLot(lot: HerdLot, m: HerdMovement): HerdLot {
  const balances = { ...lot.balances }
  for (const [k, q] of [[m.key1, m.qty1], ...(m.key2 ? [[m.key2, m.qty2!]] : [])] as [string, number][]) {
    const next = (balances[k] ?? 0) + q
    if (next < 0) throw new Error('Saldo insuficiente')
    balances[k] = next
  }
  return { ...lot, balances, count: lot.count + m.total, lastMovementId: m.id }
}
const BOI = 'bois|M', GAR = 'garrotes|M'
const lot = (id: string): HerdLot => ({ id, name: id, sex: 'M', active: true, count: 0, balances: {} })

describe('cenários do rebanho', () => {
  let A = lot('A'), B = lot('B')
  const movs: HerdMovement[] = []
  const run = (l: 'A' | 'B', m: HerdMovement) => { movs.push(m); if (l === 'A') A = applyToLot(A, m); else B = applyToLot(B, m) }

  it('cenário 1 — compra de 100 bois aumenta o rebanho em 100', () => {
    const c = tradeCalc({ qty: 100, totalKg: 36000, pricePerUnit: 31000, kgPerUnit: 30 })
    expect(c).toMatchObject({ avgKg: 360, units: 1200, computedAmount: 37200000, amount: 37200000, costPerHead: 372000 })
    run('A', mv('A', 'compra', '2026-08-01', BOI, 100))
    expect(A.count + B.count).toBe(100)
  })
  it('valor manual prevalece sobre o calculado; carcaça usa o próprio fator', () => {
    expect(tradeCalc({ qty: 10, avgKg: 300, pricePerUnit: 30000, kgPerUnit: 30, manualAmount: 2900000 }).amount).toBe(2900000)
    expect(tradeCalc({ qty: 1, totalKg: 270, pricePerUnit: 30000, kgPerUnit: 15 }).units).toBe(18)
  })
  it('cenário 2 — venda de 30: saldo 70 e líquido correto', () => {
    const c = tradeCalc({ qty: 30, totalKg: 13500, pricePerUnit: 30000, kgPerUnit: 30 })
    const n = saleNet(c.amount, [{ amount: 300000 }, { amount: 135000 }, { amount: 20000 }])
    expect(c.amount).toBe(13500000)
    expect(n).toEqual({ gross: 13500000, expenses: 455000, net: 13045000 })
    run('A', mv('A', 'venda', '2026-09-10', BOI, -30))
    expect(A.count).toBe(70)
  })
  it('venda acima do saldo é bloqueada', () => {
    expect(() => applyToLot(A, mv('A', 'venda', '2026-09-11', BOI, -71))).toThrow('Saldo insuficiente')
  })
  it('cenário 3 — morte de 2: saldo 68', () => {
    run('A', mv('A', 'morte', '2026-09-20', BOI, -2))
    expect(A.count).toBe(68)
  })
  it('cenário 4 — transferência de 20 mantém o total da fazenda', () => {
    run('A', mv('A', 'transf_saida', '2026-10-01', BOI, -20)); run('B', mv('B', 'transf_entrada', '2026-10-01', BOI, 20))
    expect([A.count, B.count, A.count + B.count]).toEqual([48, 20, 68])
  })
  it('mudança de categoria não altera o total', () => {
    run('B', mv('B', 'troca_categoria', '2026-10-05', BOI, -5, GAR, 5))
    expect(B.count).toBe(20)
    expect(B.balances).toEqual({ [BOI]: 15, [GAR]: 5 })
  })
  it('cenário 6 — inventário corresponde às movimentações (reconciliação sem diferenças)', () => {
    expect(reconcile([A, B], movs)).toEqual([])
    const rows = inventoryTable(balancesFromMovements(movs), (id) => id)
    expect(rows.reduce((s, r) => s + r.total, 0)).toBe(68)
    expect(reconcile([{ ...A, balances: { [BOI]: 50 } }], movs)[0]).toMatchObject({ stored: 50, ledger: 48 })
  })
  it('cenário 7 — saldo histórico em datas passadas', () => {
    const at = (d: string) => Object.values(balancesFromMovements(movs, d)).reduce((s, k) => s + Object.values(k).reduce((a, q) => a + q, 0), 0)
    expect(at('2026-07-31')).toBe(0)
    expect(at('2026-08-15')).toBe(100)
    expect(at('2026-09-15')).toBe(70)
    expect(at('2026-09-30')).toBe(68)
    const evo = herdEvolution(movs, ['2026-08', '2026-09', '2026-10'], (ym) => monthRange(ym)[1])
    expect(evo.map((e) => e.total)).toEqual([100, 68, 68])
  })
  it('relatórios de quantidade, movimentação e financeiro', () => {
    const f: HerdFilters = { start: '2026-01-01', end: '2026-12-31', lotId: '', categoryId: '', sex: '', movType: '', seller: '', buyer: '' }
    const d: HerdData = { lots: [A, B], movs, today: '2026-11-03', catName: (c) => c ?? '', lotName: (l) => l ?? '', unitName: (u) => u, vaccinations: [], deaths: [], transfers: [],
      purchases: [{ id: 'p', date: '2026-08-01', sellerName: 'Zé', buyerName: 'Ana', lotId: 'A', categoryId: 'bois', sex: 'M', qty: 100, totalKg: 36000, avgKg: 360, unit: 'vivo', kgPerUnit: 30, pricePerUnit: 31000, amount: 37200000, costPerHead: 372000 }],
      sales: [{ id: 's', date: '2026-09-10', buyerName: 'Frigorífico', lotId: 'A', categoryId: 'bois', sex: 'M', qty: 30, totalKg: 13500, avgKg: 450, unit: 'vivo', gross: 13500000, expenses: [{ type: 'Frete', amount: 300000 }, { type: 'Comissão', amount: 155000 }], expensesTotal: 455000, net: 13045000 }] }
    expect(buildHerdReport('atual', f, d).totals).toMatchObject({ t: 68 })
    expect(buildHerdReport('categoria', f, d).rows.map((r) => [r.nome, r.t])).toEqual([['bois', 63], ['garrotes', 5]])
    expect(buildHerdReport('data', { ...f, end: '2026-09-15' }, d).totals).toMatchObject({ t: 70 })
    expect(buildHerdReport('lote', { ...f, lotId: 'B' }, d).totals).toMatchObject({ t: 20 })
    expect(buildHerdReport('custo', f, d).totals).toMatchObject({ qtd: 100, cab: 372000 })
    expect(buildHerdReport('liquido', f, d).totals).toMatchObject({ bruto: 13500000, liq: 13045000 })
    expect(buildHerdReport('despesas', f, d).rows[0]).toMatchObject({ tipo: 'Frete', valor: 300000 })
    expect(buildHerdReport('compras', { ...f, seller: 'maria' }, d).rows).toHaveLength(0)
    expect(buildHerdReport('movimentos', { ...f, movType: 'morte' }, d).totals).toMatchObject({ sai: 2 })
  })
})

describe('vacinação e pesos', () => {
  const v = (p: Partial<Vaccination>): Vaccination => ({ id: Math.random().toString(), status: 'aplicada', date: '2026-10-01', lotId: 'A', qty: 50, vaccine: 'Aftosa', ...p })
  it('cenário 5 — vacinação de 50 entra no histórico e gera reforço', () => {
    const list = [v({ boosterDate: '2026-11-10' }), v({ status: 'programada', date: '2026-11-01' }), v({ boosterDate: '2026-11-05', boosterDoneById: 'x' })]
    const a = vaccineAlerts(list, '2026-11-03', 30, daysBetween)
    expect(a.map((x) => [x.kind, x.daysLeft])).toEqual([['programada', -2], ['reforco', 7]])
    expect(list.filter((x) => x.status === 'aplicada').reduce((s, x) => s + x.qty, 0)).toBe(100)
  })
  it('peso médio ponderado do lote', () => {
    expect(weightedAvg(100, 400, 50, 300)).toBe(366.7)
    expect(weightedAvg(0, null, 10, 280)).toBe(280)
    expect(weightedAvg(10, 300, 5, null)).toBe(300)
  })
})
