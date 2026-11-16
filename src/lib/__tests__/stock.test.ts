import { describe, expect, it } from 'vitest'
import { avgCostCents, buildStockReport, fmtQty, parseQty, planAdjust, planEntry, planExit, planReverse, stockStatus, stockTotals, StockError, type StockItem, type StockMovement } from '../stock'

const item = (p: Partial<StockItem> = {}): StockItem => ({ id: 'i1', name: 'Sal mineral', category: 'alimentacao', unit: 'kg', qtyMilli: 0, valueCents: 0, active: true, ...p })

describe('quantidades', () => {
  it('interpreta formatos brasileiros', () => {
    expect(parseQty('12,5')).toBe(12500)
    expect(parseQty('1.234,567')).toBe(1234567)
    expect(parseQty('0,001')).toBe(1)
    expect(parseQty('10')).toBe(10000)
  })
  it('rejeita inválidos e negativos', () => {
    for (const s of ['', 'abc', '-3', '1,2,3', '1,2345']) expect(parseQty(s)).toBeNull()
  })
  it('formata', () => { expect(fmtQty(12500, 'kg')).toBe('12,5 kg') })
})

describe('movimentações e custo médio', () => {
  it('entrada soma quantidade e valor', () => {
    expect(planEntry(100000, 25000)).toEqual({ qtyDelta: 100000, valueDelta: 25000 })
    expect(() => planEntry(0, 100)).toThrow(StockError)
  })
  it('saída parcial usa custo médio', () => {
    const i = item({ qtyMilli: 100000, valueCents: 25000 })
    expect(avgCostCents(i)).toBe(250)
    expect(planExit(i, 40000)).toEqual({ qtyDelta: -40000, valueDelta: -10000 })
  })
  it('baixa total zera o valor sem sobra de arredondamento', () => {
    const i = item({ qtyMilli: 3000, valueCents: 1000 })
    expect(planExit(i, 3000)).toEqual({ qtyDelta: -3000, valueDelta: -1000 })
  })
  it('nunca permite saldo negativo', () => {
    expect(() => planExit(item({ qtyMilli: 5000, valueCents: 500 }), 5001)).toThrow(/Saldo insuficiente/)
  })
  it('ajuste de contagem para mais e para menos', () => {
    const i = item({ qtyMilli: 10000, valueCents: 5000 })
    expect(planAdjust(i, 12000)).toEqual({ qtyDelta: 2000, valueDelta: 1000 })
    expect(planAdjust(i, 4000)).toEqual({ qtyDelta: -6000, valueDelta: -3000 })
    expect(planAdjust(i, 0)).toEqual({ qtyDelta: -10000, valueDelta: -5000 })
    expect(() => planAdjust(i, 10000)).toThrow(StockError)
  })
  it('estorno de entrada baixa a quantidade; de saída devolve o valor original', () => {
    const i = item({ qtyMilli: 100000, valueCents: 30000 })
    expect(planReverse(i, { type: 'entrada', qtyDelta: 40000, valueDelta: 12000 })).toEqual({ qtyDelta: -40000, valueDelta: -12000 })
    expect(planReverse(i, { type: 'saida', qtyDelta: -20000, valueDelta: -6000 })).toEqual({ qtyDelta: 20000, valueDelta: 6000 })
  })
  it('estorno de entrada falha se o saldo já foi consumido', () => {
    expect(() => planReverse(item({ qtyMilli: 10000, valueCents: 3000 }), { type: 'entrada', qtyDelta: 40000, valueDelta: 12000 })).toThrow(/Saldo insuficiente/)
  })
  it('não estorna estorno', () => {
    expect(() => planReverse(item(), { type: 'estorno', qtyDelta: 1, valueDelta: 0 })).toThrow(StockError)
  })
})

describe('situação e totais', () => {
  it('zerado, baixo e normal', () => {
    expect(stockStatus({ qtyMilli: 0, minMilli: 5000 })).toBe('zerado')
    expect(stockStatus({ qtyMilli: 5000, minMilli: 5000 })).toBe('baixo')
    expect(stockStatus({ qtyMilli: 6000, minMilli: 5000 })).toBe('ok')
    expect(stockStatus({ qtyMilli: 1, minMilli: null })).toBe('ok')
  })
  it('totais ignoram itens inativos', () => {
    const t = stockTotals([item({ qtyMilli: 1000, valueCents: 500 }), item({ id: 'i2', qtyMilli: 0 }), item({ id: 'i3', active: false, qtyMilli: 9000, valueCents: 9000 })])
    expect(t).toEqual({ count: 2, valueCents: 500, low: 0, zero: 1 })
  })
})

describe('relatórios', () => {
  const items = [item({ qtyMilli: 6000, valueCents: 3000 }), item({ id: 'i2', name: 'Diesel', category: 'combustivel', unit: 'L', qtyMilli: 0 })]
  const mv = (p: Partial<StockMovement>): StockMovement => ({ id: 'm', itemId: 'i1', itemName: 'Sal mineral', itemCategory: 'alimentacao', itemUnit: 'kg', type: 'saida', date: '2026-11-05', qtyDelta: -2000, valueDelta: -1000, ...p })
  const base = { items, reversed: new Set<string>(), category: 'todas' as const, start: '2026-11-01', end: '2026-11-30' }
  it('posição soma o valor', () => {
    const r = buildStockReport('posicao', { ...base, movements: [] })
    expect(r.rows).toHaveLength(2); expect(r.totals?.valor).toBe(3000)
  })
  it('mínimo lista zerados', () => {
    expect(buildStockReport('minimo', { ...base, movements: [] }).rows.map((r) => r.item)).toEqual(['Diesel'])
  })
  it('consumo ignora saídas estornadas e agrupa por lote', () => {
    const movements = [mv({ id: 'a', lotId: 'L1', lotName: 'Lote 1' }), mv({ id: 'b', qtyDelta: -1000, valueDelta: -500, lotId: 'L1', lotName: 'Lote 1' }), mv({ id: 'c' })]
    const r = buildStockReport('consumo', { ...base, movements, reversed: new Set(['c']) })
    expect(r.rows).toHaveLength(1); expect(r.rows[0]).toMatchObject({ qtd: 3, valor: 1500 })
    const l = buildStockReport('consumo_lote', { ...base, movements, reversed: new Set(['c']) })
    expect(l.rows).toHaveLength(1); expect(l.totals?.valor).toBe(1500)
  })
  it('compras agrupam por fornecedor e ignoram estornadas', () => {
    const movements = [mv({ id: 'e1', type: 'entrada', qtyDelta: 10000, valueDelta: 4000, party: 'Agro Sul' }), mv({ id: 'e2', type: 'entrada', qtyDelta: 5000, valueDelta: 2000, party: 'Agro Sul' })]
    const r = buildStockReport('compras', { ...base, movements, reversed: new Set(['e2']) })
    expect(r.rows).toHaveLength(1); expect(r.totals?.total).toBe(4000)
  })
  it('filtra por categoria e período', () => {
    const movements = [mv({ id: 'x', date: '2026-10-01' }), mv({ id: 'y', itemId: 'i2', itemName: 'Diesel' })]
    expect(buildStockReport('movimentacoes', { ...base, movements, category: 'alimentacao' }).rows).toHaveLength(0)
    expect(buildStockReport('movimentacoes', { ...base, movements }).rows).toHaveLength(1)
  })
})
