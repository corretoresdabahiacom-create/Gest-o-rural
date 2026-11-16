// Módulo de Estoque — domínio puro (sem Firebase). Quantidades em milésimos (inteiros) e valores em centavos.
import type { Column, ReportResult } from './reports'

export type StockCategory = 'insumo' | 'medicamento' | 'alimentacao' | 'combustivel' | 'ferramenta'
export const STOCK_CATEGORIES: { id: StockCategory; label: string; plural: string; hint: string }[] = [
  { id: 'insumo', label: 'Insumo', plural: 'Insumos', hint: 'Sal mineral, arame, cercas, adubo, sementes…' },
  { id: 'medicamento', label: 'Medicamento', plural: 'Medicamentos', hint: 'Vacinas, vermífugos, antibióticos…' },
  { id: 'alimentacao', label: 'Alimentação', plural: 'Alimentação', hint: 'Rações, suplementos, milho, farelos…' },
  { id: 'combustivel', label: 'Combustível', plural: 'Combustíveis', hint: 'Diesel, gasolina, óleos e lubrificantes…' },
  { id: 'ferramenta', label: 'Ferramenta', plural: 'Ferramentas', hint: 'Ferramentas e equipamentos de uso na fazenda.' },
]
export const categoryLabel = (c: string) => STOCK_CATEGORIES.find((x) => x.id === c)?.label ?? c
export const STOCK_UNITS = ['kg', 'g', 't', 'L', 'mL', 'un', 'saco', 'dose', 'frasco', 'caixa', 'm']

export interface StockItem {
  id: string
  name: string
  category: StockCategory
  unit: string
  qtyMilli: number
  valueCents: number
  minMilli?: number | null
  supplier?: string
  notes?: string
  active: boolean
  lastMovementId?: string
}

export type StockMoveType = 'entrada' | 'saida' | 'ajuste' | 'estorno'
export const MOVE_LABEL: Record<StockMoveType, string> = { entrada: 'Entrada', saida: 'Saída', ajuste: 'Ajuste de contagem', estorno: 'Estorno' }
export const ENTRY_REASONS: Record<string, string> = { compra: 'Compra', doacao: 'Doação / bonificação', saldo_inicial: 'Saldo inicial', devolucao: 'Devolução', outro: 'Outro' }
export const EXIT_REASONS: Record<string, string> = { consumo: 'Consumo / uso', aplicacao: 'Aplicação no rebanho', perda: 'Perda / vencimento', venda: 'Venda / cessão', emprestimo: 'Empréstimo / baixa de ferramenta', outro: 'Outro' }
export const reasonLabel = (r?: string) => (r && (ENTRY_REASONS[r] ?? EXIT_REASONS[r] ?? (r === 'contagem' ? 'Contagem física' : r === 'estorno' ? 'Estorno' : r))) || ''

export interface StockMovement {
  id: string
  itemId: string
  itemName: string
  itemCategory?: StockCategory
  itemUnit?: string
  type: StockMoveType
  date: string
  qtyDelta: number
  valueDelta: number
  unitCostCents?: number | null
  reason?: string
  party?: string
  lotId?: string | null
  lotName?: string | null
  batchCode?: string
  expiryDate?: string
  note?: string
  reversesId?: string
  expenseEntryId?: string | null
  vaccinationId?: string | null
}

export class StockError extends Error {}

/* ---------- Quantidades ---------- */

/** "12,5" ou "1.234,567" → milésimos inteiros (12500). null se inválido ou negativo. */
export function parseQty(input: string): number | null {
  const s = input.trim().replace(/\s/g, '')
  if (!s) return null
  const norm = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  if (!/^\d+(\.\d{1,3})?$/.test(norm)) return null
  const n = Number(norm)
  if (!Number.isFinite(n) || n < 0 || n > 1e9) return null
  return Math.round(n * 1000)
}
export const qtyToInput = (milli: number | null | undefined) => (milli == null ? '' : String(milli / 1000).replace('.', ','))
export const fmtQty = (milli: number, unit = '') => `${(milli / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ''}`

/* ---------- Custo médio e planejamento de movimentações ---------- */

/** Custo médio por unidade (centavos). */
export const avgCostCents = (item: Pick<StockItem, 'qtyMilli' | 'valueCents'>) => (item.qtyMilli > 0 ? item.valueCents / (item.qtyMilli / 1000) : 0)

export interface Delta { qtyDelta: number; valueDelta: number }

export function planEntry(qtyMilli: number, totalCents: number): Delta {
  if (!(qtyMilli > 0)) throw new StockError('Informe uma quantidade maior que zero.')
  if (!Number.isInteger(totalCents) || totalCents < 0) throw new StockError('Valor inválido.')
  return { qtyDelta: qtyMilli, valueDelta: totalCents }
}

/** Saída valorizada pelo custo médio. Baixa total zera o valor (sem sobra de arredondamento). */
export function planExit(item: Pick<StockItem, 'qtyMilli' | 'valueCents' | 'name' | 'unit'>, qtyMilli: number): Delta {
  if (!(qtyMilli > 0)) throw new StockError('Informe uma quantidade maior que zero.')
  if (qtyMilli > item.qtyMilli) throw new StockError(`Saldo insuficiente de “${item.name}”: disponível ${fmtQty(item.qtyMilli, item.unit)}, solicitado ${fmtQty(qtyMilli, item.unit)}.`)
  const value = qtyMilli === item.qtyMilli ? item.valueCents : Math.round((item.valueCents * qtyMilli) / item.qtyMilli)
  return { qtyDelta: -qtyMilli, valueDelta: -value }
}

/** Ajuste de contagem física: leva o saldo para a quantidade contada, ao custo médio atual. */
export function planAdjust(item: Pick<StockItem, 'qtyMilli' | 'valueCents' | 'name' | 'unit'>, countedMilli: number): Delta {
  if (!(countedMilli >= 0)) throw new StockError('Quantidade contada inválida.')
  const diff = countedMilli - item.qtyMilli
  if (diff === 0) throw new StockError('A quantidade contada é igual ao saldo atual. Nada a ajustar.')
  if (diff < 0) return planExit(item, -diff)
  return { qtyDelta: diff, valueDelta: Math.round(avgCostCents(item) * (diff / 1000)) }
}

/** Estorno: inverte a quantidade. Se a inversão reduz o saldo, valoriza ao custo médio atual; se aumenta, devolve o valor original da baixa. */
export function planReverse(item: Pick<StockItem, 'qtyMilli' | 'valueCents' | 'name' | 'unit'>, orig: Pick<StockMovement, 'qtyDelta' | 'valueDelta' | 'type'>): Delta {
  if (orig.type === 'estorno') throw new StockError('Um estorno não pode ser estornado.')
  const q = -orig.qtyDelta
  if (q < 0) return planExit(item, -q)
  return { qtyDelta: q, valueDelta: Math.max(0, -orig.valueDelta) }
}

export type StockStatus = 'zerado' | 'baixo' | 'ok'
export function stockStatus(i: Pick<StockItem, 'qtyMilli' | 'minMilli'>): StockStatus {
  if (i.qtyMilli <= 0) return 'zerado'
  if (i.minMilli != null && i.minMilli > 0 && i.qtyMilli <= i.minMilli) return 'baixo'
  return 'ok'
}
export const STATUS_LABEL: Record<StockStatus, string> = { zerado: 'Zerado', baixo: 'Abaixo do mínimo', ok: 'Normal' }

export function stockTotals(items: StockItem[]) {
  const active = items.filter((i) => i.active)
  return {
    count: active.length,
    valueCents: active.reduce((s, i) => s + i.valueCents, 0),
    low: active.filter((i) => stockStatus(i) === 'baixo').length,
    zero: active.filter((i) => stockStatus(i) === 'zerado').length,
  }
}

/* ---------- Relatórios ---------- */

export type StockReportId = 'posicao' | 'minimo' | 'movimentacoes' | 'consumo' | 'consumo_lote' | 'compras'
export const STOCK_REPORTS: { id: StockReportId; label: string; usesPeriod: boolean }[] = [
  { id: 'posicao', label: 'Posição do estoque (saldo e valor)', usesPeriod: false },
  { id: 'minimo', label: 'Itens abaixo do mínimo ou zerados', usesPeriod: false },
  { id: 'movimentacoes', label: 'Entradas e saídas no período', usesPeriod: true },
  { id: 'consumo', label: 'Consumo por item', usesPeriod: true },
  { id: 'consumo_lote', label: 'Consumo por lote de animais', usesPeriod: true },
  { id: 'compras', label: 'Compras e entradas por fornecedor', usesPeriod: true },
]

const col = (key: string, label: string, type?: Column['type']): Column => ({ key, label, type })
const q = (milli: number) => milli / 1000

export interface StockReportInput {
  items: StockItem[]
  movements: StockMovement[]
  /** ids de movimentações já estornadas */
  reversed: Set<string>
  category: StockCategory | 'todas'
  start: string
  end: string
}

export function buildStockReport(id: StockReportId, inp: StockReportInput): ReportResult {
  const sub = (usesPeriod: boolean) => `${inp.category === 'todas' ? 'Todas as categorias' : categoryLabel(inp.category)}${usesPeriod ? ` · ${inp.start} a ${inp.end}` : ''}`
  const items = inp.items.filter((i) => inp.category === 'todas' || i.category === inp.category)
  const itemIds = new Set(items.map((i) => i.id))
  const moves = inp.movements.filter((m) => itemIds.has(m.itemId) && m.date >= inp.start && m.date <= inp.end)
  const byName = (a: { item?: unknown; itemName?: string; name?: string }, b: typeof a) => String(a.name ?? a.itemName).localeCompare(String(b.name ?? b.itemName), 'pt-BR')

  if (id === 'posicao' || id === 'minimo') {
    let list = items.filter((i) => i.active || i.qtyMilli > 0)
    if (id === 'minimo') list = list.filter((i) => stockStatus(i) !== 'ok')
    list = [...list].sort(byName)
    return {
      title: id === 'posicao' ? 'Posição do estoque' : 'Itens abaixo do mínimo ou zerados', subtitle: sub(false),
      columns: [col('categoria', 'Categoria'), col('item', 'Item'), col('unidade', 'Unidade'), col('saldo', 'Saldo', 'number'), col('minimo', 'Mínimo', 'number'),
        col('custo', 'Custo médio', 'money'), col('valor', 'Valor em estoque', 'money'), col('situacao', 'Situação')],
      rows: list.map((i) => ({ categoria: categoryLabel(i.category), item: i.name, unidade: i.unit, saldo: q(i.qtyMilli), minimo: i.minMilli ? q(i.minMilli) : null,
        custo: Math.round(avgCostCents(i)), valor: i.valueCents, situacao: STATUS_LABEL[stockStatus(i)] })),
      totals: { categoria: 'Total', valor: list.reduce((s, i) => s + i.valueCents, 0) },
    }
  }
  if (id === 'movimentacoes') {
    const list = [...moves].sort((a, b) => a.date.localeCompare(b.date) || a.itemName.localeCompare(b.itemName, 'pt-BR'))
    return {
      title: 'Entradas e saídas no período', subtitle: sub(true),
      columns: [col('data', 'Data', 'date'), col('item', 'Item'), col('tipo', 'Tipo'), col('qtd', 'Quantidade', 'number'), col('unidade', 'Unidade'), col('valor', 'Valor', 'money'),
        col('motivo', 'Motivo'), col('origem', 'Fornecedor / destino'), col('situacao', 'Situação')],
      rows: list.map((m) => ({ data: m.date, item: m.itemName, tipo: MOVE_LABEL[m.type], qtd: q(m.qtyDelta), unidade: m.itemUnit ?? '', valor: Math.abs(m.valueDelta),
        motivo: reasonLabel(m.reason), origem: [m.party, m.lotName].filter(Boolean).join(' · '), situacao: inp.reversed.has(m.id) ? 'Estornada' : '' })),
    }
  }
  const eff = moves.filter((m) => !inp.reversed.has(m.id) && m.type !== 'estorno')
  if (id === 'consumo') {
    const map = new Map<string, { name: string; cat: string; unit: string; qty: number; value: number }>()
    for (const m of eff.filter((x) => x.type === 'saida')) {
      const r = map.get(m.itemId) ?? { name: m.itemName, cat: categoryLabel(m.itemCategory ?? ''), unit: m.itemUnit ?? '', qty: 0, value: 0 }
      r.qty += -m.qtyDelta; r.value += -m.valueDelta; map.set(m.itemId, r)
    }
    const rows = [...map.values()].sort((a, b) => b.value - a.value)
    return {
      title: 'Consumo por item', subtitle: sub(true),
      columns: [col('categoria', 'Categoria'), col('item', 'Item'), col('unidade', 'Unidade'), col('qtd', 'Quantidade consumida', 'number'), col('valor', 'Custo (médio)', 'money')],
      rows: rows.map((r) => ({ categoria: r.cat, item: r.name, unidade: r.unit, qtd: q(r.qty), valor: r.value })),
      totals: { categoria: 'Total', valor: rows.reduce((s, r) => s + r.value, 0) },
    }
  }
  if (id === 'consumo_lote') {
    const map = new Map<string, { lot: string; item: string; unit: string; qty: number; value: number }>()
    for (const m of eff.filter((x) => x.type === 'saida' && x.lotId)) {
      const k = `${m.lotId}|${m.itemId}`
      const r = map.get(k) ?? { lot: m.lotName ?? 'Lote', item: m.itemName, unit: m.itemUnit ?? '', qty: 0, value: 0 }
      r.qty += -m.qtyDelta; r.value += -m.valueDelta; map.set(k, r)
    }
    const rows = [...map.values()].sort((a, b) => a.lot.localeCompare(b.lot, 'pt-BR') || b.value - a.value)
    return {
      title: 'Consumo por lote de animais', subtitle: sub(true),
      columns: [col('lote', 'Lote'), col('item', 'Item'), col('unidade', 'Unidade'), col('qtd', 'Quantidade', 'number'), col('valor', 'Custo (médio)', 'money')],
      rows: rows.map((r) => ({ lote: r.lot, item: r.item, unidade: r.unit, qtd: q(r.qty), valor: r.value })),
      totals: { lote: 'Total', valor: rows.reduce((s, r) => s + r.value, 0) },
    }
  }
  // compras
  const list = eff.filter((m) => m.type === 'entrada').sort((a, b) => (a.party ?? '').localeCompare(b.party ?? '', 'pt-BR') || a.date.localeCompare(b.date))
  return {
    title: 'Compras e entradas por fornecedor', subtitle: sub(true),
    columns: [col('fornecedor', 'Fornecedor'), col('data', 'Data', 'date'), col('item', 'Item'), col('qtd', 'Quantidade', 'number'), col('unidade', 'Unidade'),
      col('custo', 'Custo unitário', 'money'), col('total', 'Valor', 'money'), col('motivo', 'Motivo')],
    rows: list.map((m) => ({ fornecedor: m.party || '—', data: m.date, item: m.itemName, qtd: q(m.qtyDelta), unidade: m.itemUnit ?? '',
      custo: m.unitCostCents ?? (m.qtyDelta ? Math.round(m.valueDelta / q(m.qtyDelta)) : 0), total: m.valueDelta, motivo: reasonLabel(m.reason) })),
    totals: { fornecedor: 'Total', total: list.reduce((s, m) => s + m.valueDelta, 0) },
  }
}
