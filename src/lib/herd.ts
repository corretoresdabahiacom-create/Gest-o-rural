// Domínio do rebanho: tipos e cálculos puros (sem Firebase), testáveis.
// Princípio: herdMovements é a fonte da verdade. O saldo do lote (count/balances)
// é um agregado atualizado na mesma transação e verificado pelas Security Rules.

export type Sex = 'M' | 'F'
export const SEX_LABEL: Record<Sex, string> = { M: 'Macho', F: 'Fêmea' }
export type LotSex = Sex | 'X'
export const LOT_SEX_LABEL: Record<LotSex, string> = { M: 'Machos', F: 'Fêmeas', X: 'Misto' }

export type MovementType =
  | 'inicial' | 'compra' | 'nascimento' | 'venda' | 'morte'
  | 'transf_saida' | 'transf_entrada' | 'ajuste' | 'troca_categoria'
export const MOVEMENT_LABEL: Record<MovementType, string> = {
  inicial: 'Saldo inicial', compra: 'Compra', nascimento: 'Nascimento', venda: 'Venda', morte: 'Morte',
  transf_saida: 'Transferência (saída)', transf_entrada: 'Transferência (entrada)', ajuste: 'Ajuste de inventário',
  troca_categoria: 'Mudança de categoria',
}

/** Chave do saldo dentro do lote: categoria + sexo. */
export const balanceKey = (categoryId: string, sex: Sex) => `${categoryId}|${sex}`
export const parseKey = (k: string) => { const [categoryId, sex] = k.split('|'); return { categoryId, sex: sex as Sex } }

export interface HerdLot {
  id: string
  name: string
  code?: string
  categoryId?: string
  sex: LotSex
  formedAt?: string
  origin?: string
  sellerName?: string
  buyerName?: string
  notes?: string
  active: boolean
  count: number
  balances: Record<string, number>
  lastMovementId?: string
  avgWeightKg?: number | null
  avgWeightAt?: string | null
}

export type AnimalStatus = 'ativo' | 'vendido' | 'morto' | 'transferido'
export interface Animal {
  id: string
  tag: string
  name?: string
  sex: Sex
  categoryId: string
  breed?: string
  birthDate?: string | null
  weightKg?: number | null
  lotId: string
  entryDate: string
  origin: 'nascimento' | 'compra' | 'transferencia' | 'existente'
  sellerName?: string
  buyerName?: string
  acquisitionCost?: number | null
  notes?: string
  status: AnimalStatus
  lastWeighing?: { date: string; kg: number } | null
}

export interface HerdMovement {
  id: string
  type: MovementType
  date: string
  lotId: string
  keys: string[]
  key1: string
  qty1: number
  key2?: string
  qty2?: number
  total: number
  animalIds?: string[]
  refType?: string
  refId?: string
  transferId?: string
  otherLotId?: string
  otherFarmId?: string
  note?: string
}

/* ---------- Unidade comercial (arroba) ---------- */
export type ArrobaUnit = 'vivo' | 'carcaca' | 'outra'
export const ARROBA_LABEL: Record<ArrobaUnit, string> = { vivo: '@ peso vivo', carcaca: '@ carcaça', outra: 'Outra unidade' }
export const DEFAULT_ARROBA = { vivo: 30, carcaca: 15, outra: 30 }

/** kg -> unidades comerciais, usando o fator da própria operação. */
export const kgToUnits = (kg: number, kgPerUnit: number) => (kgPerUnit > 0 ? kg / kgPerUnit : 0)

export interface TradeCalc { totalKg: number; avgKg: number; units: number; computedAmount: number; amount: number; costPerHead: number }
/**
 * Compra/venda: aceita peso total OU médio (o outro é derivado), calcula unidades
 * e valor pelo preço da unidade. Se o usuário informar o valor manualmente, prevalece.
 */
export function tradeCalc(p: { qty: number; totalKg?: number | null; avgKg?: number | null; pricePerUnit?: number | null; kgPerUnit: number; manualAmount?: number | null }): TradeCalc {
  const qty = p.qty > 0 ? p.qty : 0
  const totalKg = p.totalKg && p.totalKg > 0 ? p.totalKg : (p.avgKg && p.avgKg > 0 ? p.avgKg * qty : 0)
  const avgKg = qty ? totalKg / qty : 0
  const units = kgToUnits(totalKg, p.kgPerUnit)
  const computedAmount = Math.round(units * (p.pricePerUnit ?? 0)) // centavos
  const amount = p.manualAmount != null && p.manualAmount > 0 ? p.manualAmount : computedAmount
  return { totalKg: round1(totalKg), avgKg: round1(avgKg), units: Math.round(units * 100) / 100, computedAmount, amount, costPerHead: qty ? Math.round(amount / qty) : 0 }
}
export const round1 = (n: number) => Math.round(n * 10) / 10

export function saleNet(gross: number, expenses: { amount: number }[]) {
  const exp = expenses.reduce((s, e) => s + (e.amount || 0), 0)
  return { gross, expenses: exp, net: gross - exp }
}

/* ---------- Saldos e inventário ---------- */

/** Aplica movimentações a um mapa lote -> chave -> qtd (para reconstrução/reconciliação). */
export function balancesFromMovements(movs: HerdMovement[], upTo?: string) {
  const out: Record<string, Record<string, number>> = {}
  for (const m of movs) {
    if (upTo && m.date > upTo) continue
    const lot = (out[m.lotId] ??= {})
    lot[m.key1] = (lot[m.key1] ?? 0) + m.qty1
    if (m.key2) lot[m.key2] = (lot[m.key2] ?? 0) + (m.qty2 ?? 0)
  }
  return out
}

export interface InventoryRow { lotId: string; lotName: string; categoryId: string; males: number; females: number; total: number }
/** Tabela Lote × Categoria com machos/fêmeas, a partir de um mapa de saldos. */
export function inventoryTable(bal: Record<string, Record<string, number>>, lotName: (id: string) => string): InventoryRow[] {
  const rows: InventoryRow[] = []
  for (const [lotId, keys] of Object.entries(bal)) {
    const byCat: Record<string, InventoryRow> = {}
    for (const [k, q] of Object.entries(keys)) {
      if (!q) continue
      const { categoryId, sex } = parseKey(k)
      const r = (byCat[categoryId] ??= { lotId, lotName: lotName(lotId), categoryId, males: 0, females: 0, total: 0 })
      if (sex === 'M') r.males += q; else r.females += q
      r.total += q
    }
    rows.push(...Object.values(byCat))
  }
  return rows.sort((a, b) => a.lotName.localeCompare(b.lotName, 'pt-BR') || a.categoryId.localeCompare(b.categoryId))
}

/** Diferenças entre o saldo agregado dos lotes e o reconstruído pelas movimentações. */
export function reconcile(lots: HerdLot[], movs: HerdMovement[]) {
  const rebuilt = balancesFromMovements(movs)
  const issues: { lotId: string; key: string; stored: number; ledger: number }[] = []
  for (const lot of lots) {
    const keys = new Set([...Object.keys(lot.balances ?? {}), ...Object.keys(rebuilt[lot.id] ?? {})])
    for (const k of keys) {
      const stored = lot.balances?.[k] ?? 0, ledger = rebuilt[lot.id]?.[k] ?? 0
      if (stored !== ledger) issues.push({ lotId: lot.id, key: k, stored, ledger })
    }
  }
  return issues
}

/** Total do rebanho por dia de fim de mês (evolução), a partir das movimentações. */
export function herdEvolution(movs: HerdMovement[], months: string[], monthEnd: (ym: string) => string) {
  const sorted = [...movs].sort((a, b) => a.date.localeCompare(b.date))
  return months.map((ym) => {
    const end = monthEnd(ym)
    return { ym, total: sorted.filter((m) => m.date <= end).reduce((s, m) => s + m.total, 0) }
  })
}

/** Média ponderada do peso do lote após entrada de animais. */
export function weightedAvg(curCount: number, curAvg: number | null | undefined, addCount: number, addAvg: number | null | undefined) {
  const a = curAvg && curAvg > 0 ? curAvg : null
  const b = addAvg && addAvg > 0 ? addAvg : null
  if (a == null) return b
  if (b == null) return a
  const n = curCount + addCount
  return n > 0 ? round1((a * curCount + b * addCount) / n) : a
}

export const DEFAULT_ANIMAL_CATEGORIES = ['Bezerros', 'Bezerras', 'Garrotes', 'Novilhas', 'Bois', 'Vacas', 'Touros', 'Outras']

/* ---------- Vacinação ---------- */
export interface Vaccination {
  id: string
  status: 'aplicada' | 'programada'
  date: string
  lotId: string
  categoryId?: string
  qty: number
  vaccine: string
  manufacturer?: string
  productLot?: string
  dose?: string
  responsible?: string
  boosterDate?: string | null
  boosterDoneById?: string | null
  boosterOfId?: string | null
  notes?: string
}

export type VaccineAlert = { v: Vaccination; kind: 'programada' | 'reforco'; due: string; daysLeft: number }
export function vaccineAlerts(list: Vaccination[], today: string, windowDays = 30, daysBetween: (a: string, b: string) => number): VaccineAlert[] {
  const out: VaccineAlert[] = []
  for (const v of list) {
    if (v.status === 'programada') out.push({ v, kind: 'programada', due: v.date, daysLeft: daysBetween(today, v.date) })
    else if (v.boosterDate && !v.boosterDoneById) out.push({ v, kind: 'reforco', due: v.boosterDate, daysLeft: daysBetween(today, v.boosterDate) })
  }
  return out.filter((a) => a.daysLeft <= windowDays).sort((a, b) => a.daysLeft - b.daysLeft)
}
