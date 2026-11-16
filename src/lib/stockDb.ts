import { doc, getDoc, runTransaction, serverTimestamp, type Transaction } from 'firebase/firestore'
import { auth, db } from './firebase'
import { clean, farmCol, farmDoc, newId } from './db'
import { StockError, planAdjust, planEntry, planExit, planReverse, type Delta, type StockCategory, type StockItem, type StockMovement, type StockMoveType } from './stock'

const uid = () => auth.currentUser!.uid
const ts = () => serverTimestamp()
const log = (tx: Transaction, farmId: string, action: string, detail: string) =>
  tx.set(doc(farmCol(farmId, 'logs')), { action, detail: detail.slice(0, 500), uid: uid(), at: ts() })

export interface ItemInput { name: string; category: StockCategory; unit: string; minMilli?: number | null; supplier?: string; notes?: string }

/** Cria o item; com saldo inicial, grava item e movimentação na mesma transação. */
export async function createItem(farmId: string, input: ItemInput, initial?: { qtyMilli: number; totalCents: number; date: string }) {
  const itemId = newId(farmId, 'stockItems')
  const movId = newId(farmId, 'stockMovements')
  await runTransaction(db, async (tx) => {
    const base = clean({ name: input.name.trim(), category: input.category, unit: input.unit, minMilli: input.minMilli ?? null, supplier: input.supplier?.trim() || undefined, notes: input.notes?.trim() || undefined, active: true })
    if (initial && initial.qtyMilli > 0) {
      const d = planEntry(initial.qtyMilli, initial.totalCents)
      tx.set(farmDoc(farmId, 'stockItems', itemId), { ...base, qtyMilli: d.qtyDelta, valueCents: d.valueDelta, lastMovementId: movId, createdBy: uid(), createdAt: ts() })
      tx.set(farmDoc(farmId, 'stockMovements', movId), movementDoc(itemId, { ...base, name: base.name }, 'entrada', initial.date, d, { reason: 'saldo_inicial', unitCostCents: Math.round(d.valueDelta / (d.qtyDelta / 1000)) }))
    } else {
      tx.set(farmDoc(farmId, 'stockItems', itemId), { ...base, qtyMilli: 0, valueCents: 0, createdBy: uid(), createdAt: ts() })
    }
    log(tx, farmId, 'estoque_item_criado', `${base.name} (${input.category})`)
  })
  return itemId
}

/** Edita só os dados cadastrais. O saldo nunca é editado aqui: só por movimentação. */
export async function updateItem(farmId: string, id: string, patch: Partial<ItemInput> & { active?: boolean }) {
  await runTransaction(db, async (tx) => {
    const ref = farmDoc(farmId, 'stockItems', id)
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new StockError('Item não encontrado.')
    const cur = snap.data()
    const next = clean({ ...cur, ...patch, name: (patch.name ?? cur.name).trim(), updatedAt: ts() })
    if ('supplier' in patch && !patch.supplier) delete (next as Record<string, unknown>).supplier
    if ('notes' in patch && !patch.notes) delete (next as Record<string, unknown>).notes
    tx.set(ref, next)
    log(tx, farmId, patch.active === false ? 'estoque_item_inativado' : 'estoque_item_editado', String(next.name))
  })
}

export function movementDoc(itemId: string, item: { name: string; category: StockCategory; unit: string }, type: StockMoveType, date: string, d: Delta, extra: Partial<StockMovement>) {
  return clean({
    itemId, itemName: item.name, itemCategory: item.category, itemUnit: item.unit, type, date, qtyDelta: d.qtyDelta, valueDelta: d.valueDelta,
    ...extra, createdBy: uid(), createdAt: ts(),
  })
}

export interface MovementInput {
  itemId: string
  type: 'entrada' | 'saida' | 'ajuste'
  date: string
  /** entrada/saída: quantidade; ajuste: quantidade contada (milésimos) */
  qtyMilli: number
  /** só entrada: valor total em centavos */
  totalCents?: number
  reason?: string
  party?: string
  lotId?: string | null
  lotName?: string | null
  batchCode?: string
  expiryDate?: string
  note?: string
  vaccinationId?: string | null
  /** só entrada: lança também como despesa no financeiro */
  finance?: { categoryId: string; categoryName: string } | null
}

/**
 * Registra uma movimentação de forma idempotente (opId gerado ao abrir o formulário).
 * Na mesma transação: movimentação imutável + novo saldo/valor do item (as Security Rules conferem a soma)
 * + despesa opcional + log. Saldo negativo é recusado.
 */
export async function saveMovement(farmId: string, opId: string, m: MovementInput): Promise<'saved' | 'already-saved'> {
  return runTransaction(db, async (tx) => {
    const movRef = farmDoc(farmId, 'stockMovements', opId)
    if ((await tx.get(movRef)).exists()) return 'already-saved' as const
    const itemRef = farmDoc(farmId, 'stockItems', m.itemId)
    const snap = await tx.get(itemRef)
    if (!snap.exists()) throw new StockError('Item não encontrado.')
    const item = { id: snap.id, ...snap.data() } as StockItem
    if (!item.active && m.type === 'entrada') throw new StockError('Este item está inativo. Reative-o para registrar entradas.')
    const d = m.type === 'entrada' ? planEntry(m.qtyMilli, m.totalCents ?? 0) : m.type === 'saida' ? planExit(item, m.qtyMilli) : planAdjust(item, m.qtyMilli)
    const expenseId = m.type === 'entrada' && m.finance && d.valueDelta > 0 ? `stock-${opId}` : null
    tx.set(movRef, movementDoc(item.id, item, m.type, m.date, d, {
      reason: m.reason || (m.type === 'ajuste' ? 'contagem' : undefined), party: m.party?.trim() || undefined, lotId: m.lotId ?? undefined, lotName: m.lotName ?? undefined,
      batchCode: m.batchCode?.trim() || undefined, expiryDate: m.expiryDate || undefined, note: m.note?.trim() || undefined, vaccinationId: m.vaccinationId ?? undefined,
      unitCostCents: m.type === 'entrada' ? Math.round(d.valueDelta / (d.qtyDelta / 1000)) : undefined, expenseEntryId: expenseId ?? undefined,
    }))
    tx.update(itemRef, { qtyMilli: item.qtyMilli + d.qtyDelta, valueCents: item.valueCents + d.valueDelta, lastMovementId: opId, updatedAt: ts() })
    if (expenseId && m.finance) {
      tx.set(farmDoc(farmId, 'expenseEntries', expenseId), {
        kind: 'other', date: m.date, amount: d.valueDelta, categoryId: m.finance.categoryId, categoryName: m.finance.categoryName,
        description: `Compra de estoque: ${item.name}${m.party ? ` — ${m.party}` : ''}`.slice(0, 300), createdBy: uid(), createdAt: ts(),
      })
    }
    log(tx, farmId, `estoque_${m.type}`, `${item.name}: ${d.qtyDelta / 1000} ${item.unit}`)
    return 'saved' as const
  })
}

/** Estorno: grava movimentação inversa `rev-{id}` (uma única vez) e remove a despesa vinculada. Nada é apagado do histórico. */
export async function reverseMovement(farmId: string, movId: string, reason: string, date: string) {
  const revId = `rev-${movId}`
  await runTransaction(db, async (tx) => {
    const origSnap = await tx.get(farmDoc(farmId, 'stockMovements', movId))
    if (!origSnap.exists()) throw new StockError('Movimentação não encontrada.')
    if ((await tx.get(farmDoc(farmId, 'stockMovements', revId))).exists()) throw new StockError('Esta movimentação já foi estornada.')
    const orig = { id: origSnap.id, ...origSnap.data() } as StockMovement
    const itemRef = farmDoc(farmId, 'stockItems', orig.itemId)
    const itemSnap = await tx.get(itemRef)
    if (!itemSnap.exists()) throw new StockError('Item não encontrado.')
    const item = { id: itemSnap.id, ...itemSnap.data() } as StockItem
    const d = planReverse(item, orig)
    tx.set(farmDoc(farmId, 'stockMovements', revId), movementDoc(item.id, item, 'estorno', date, d, { reason: 'estorno', note: reason.trim(), reversesId: movId }))
    tx.update(itemRef, { qtyMilli: item.qtyMilli + d.qtyDelta, valueCents: item.valueCents + d.valueDelta, lastMovementId: revId, updatedAt: ts() })
    if (orig.expenseEntryId) tx.delete(farmDoc(farmId, 'expenseEntries', orig.expenseEntryId))
    log(tx, farmId, 'estoque_estorno', `${item.name}: ${reason.trim()}`)
  })
}

export const stockMovementExists = async (farmId: string, id: string) => (await getDoc(farmDoc(farmId, 'stockMovements', id))).exists()
