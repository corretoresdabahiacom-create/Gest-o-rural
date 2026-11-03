import { doc, getDoc, getDocs, query, orderBy, runTransaction, serverTimestamp, where, type Transaction, collection } from 'firebase/firestore'
import { auth, db } from './firebase'
import { clean, farmCol, farmDoc, newId } from './db'
import { balanceKey, inverseMovement, parseKey, REVERSIBLE_LABEL, weightedAvg, type Animal, type HerdLot, type HerdMovement, type MovementType, type ReversibleCol, type Sex } from './herd'

export class HerdError extends Error {}

const uid = () => auth.currentUser!.uid
const ts = () => serverTimestamp()

interface MoveSpec {
  farmId?: string // padrão: farmId da operação (outra fazenda em transferências externas)
  lotId: string
  type: MovementType
  date: string
  key1: string
  qty1: number
  key2?: string
  qty2?: number
  animalIds?: string[]
  transferId?: string
  otherLotId?: string
  otherFarmId?: string
  note?: string
  /** Atualizações extras de metadados do lote (ex.: peso médio). */
  lotExtra?: (lot: HerdLot) => Record<string, unknown>
}

/**
 * Núcleo do ledger: dentro de uma transação, lê os lotes, valida que nenhum saldo
 * fica negativo e grava cada movimentação junto com o novo saldo agregado do lote.
 * As Security Rules conferem que saldo novo = saldo anterior + movimentação.
 * Regra: no máximo uma movimentação por lote em cada transação.
 */
async function applyMoves(tx: Transaction, farmId: string, opId: string, refType: string, moves: MoveSpec[], lotNames: Record<string, string> = {}) {
  const seen = new Set<string>()
  const lots: { ref: ReturnType<typeof farmDoc>; data: HerdLot; m: MoveSpec; f: string }[] = []
  for (const m of moves) {
    const f = m.farmId ?? farmId
    const k = `${f}/${m.lotId}`
    if (seen.has(k)) throw new HerdError('Operação inválida: o mesmo lote aparece duas vezes.')
    seen.add(k)
    const ref = farmDoc(f, 'herdLots', m.lotId)
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new HerdError('Lote não encontrado.')
    lots.push({ ref, data: { id: snap.id, ...snap.data() } as HerdLot, m, f })
  }
  for (const { ref, data, m, f } of lots) {
    const balances = { ...(data.balances ?? {}) }
    const apply = (k: string, q: number) => {
      const next = (balances[k] ?? 0) + q
      if (next < 0) {
        const name = lotNames[data.id] ?? data.name
        throw new HerdError(`Saldo insuficiente no lote “${name}”: disponível ${balances[k] ?? 0}, solicitado ${-q}.`)
      }
      balances[k] = next
    }
    apply(m.key1, m.qty1)
    if (m.key2) apply(m.key2, m.qty2 ?? 0)
    const total = m.qty1 + (m.qty2 ?? 0)
    const movId = `${opId}-${data.id}`
    tx.set(farmDoc(f, 'herdMovements', movId), clean({
      type: m.type, date: m.date, lotId: data.id, keys: m.key2 ? [m.key1, m.key2] : [m.key1],
      key1: m.key1, qty1: m.qty1, key2: m.key2, qty2: m.key2 ? m.qty2 : undefined, total,
      animalIds: m.animalIds?.length ? m.animalIds : undefined, refType, refId: opId,
      transferId: m.transferId, otherLotId: m.otherLotId, otherFarmId: m.otherFarmId, note: m.note?.slice(0, 300),
      createdBy: uid(), createdAt: ts(),
    }))
    tx.update(ref, { count: (data.count ?? 0) + total, balances, lastMovementId: movId, ...(m.lotExtra?.(data) ?? {}), updatedAt: ts() })
  }
}

/** Operação idempotente: o id é gerado ao abrir o formulário; se já existe, não regrava. */
async function idempotent(farmId: string, col: string, opId: string, fn: (tx: Transaction) => Promise<void>): Promise<'saved' | 'already-saved'> {
  return runTransaction(db, async (tx) => {
    const op = await tx.get(farmDoc(farmId, col, opId))
    if (op.exists()) return 'already-saved' as const
    await fn(tx)
    return 'saved' as const
  })
}

function log(tx: Transaction, farmId: string, action: string, detail: string) {
  tx.set(doc(farmCol(farmId, 'logs')), { action, detail: detail.slice(0, 500), uid: uid(), at: ts() })
}

/* ---------------- Lotes e animais ---------------- */

export interface LotInput { name: string; code?: string; categoryId?: string; sex: HerdLot['sex']; formedAt?: string; origin?: string; sellerName?: string; buyerName?: string; notes?: string }

export async function createLot(farmId: string, input: LotInput, initial?: { categoryId: string; sex: Sex; qty: number; avgKg?: number | null }) {
  const lotId = newId(farmId, 'herdLots')
  await runTransaction(db, async (tx) => {
    const base = clean({ ...input, name: input.name.trim(), active: true, createdAt: ts() })
    if (initial && initial.qty > 0) {
      const key = balanceKey(initial.categoryId, initial.sex)
      const movId = `${lotId}-${lotId}`
      tx.set(farmDoc(farmId, 'herdLots', lotId), { ...base, count: initial.qty, balances: { [key]: initial.qty }, lastMovementId: movId, avgWeightKg: initial.avgKg ?? null, avgWeightAt: initial.avgKg ? input.formedAt ?? null : null })
      tx.set(farmDoc(farmId, 'herdMovements', movId), clean({
        type: 'inicial', date: input.formedAt || new Date().toISOString().slice(0, 10), lotId, keys: [key], key1: key, qty1: initial.qty, total: initial.qty,
        refType: 'lote', refId: lotId, createdBy: uid(), createdAt: ts(),
      }))
    } else {
      tx.set(farmDoc(farmId, 'herdLots', lotId), { ...base, count: 0, balances: {} })
    }
    log(tx, farmId, 'lote_criado', `${input.name}${initial ? ` com ${initial.qty} cab.` : ''}`)
  })
  return lotId
}

export async function updateLotMeta(farmId: string, lotId: string, meta: Partial<LotInput> & { active?: boolean }) {
  await runTransaction(db, async (tx) => {
    tx.update(farmDoc(farmId, 'herdLots', lotId), { ...clean(meta), updatedAt: ts() })
    log(tx, farmId, 'lote_editado', `${lotId}: ${Object.keys(meta).join(', ')}`)
  })
}

export type AnimalInput = Omit<Animal, 'id' | 'status' | 'lastWeighing'>

/**
 * Cadastro individual. Se o animal é uma nova entrada (nascimento/compra/transferência),
 * gera movimentação +1 no lote. Se `alreadyCounted`, apenas identifica um animal que já
 * fazia parte do saldo do lote (sem alterar quantidades).
 */
export async function registerAnimal(farmId: string, a: AnimalInput, alreadyCounted: boolean, identifiedInKey: number) {
  const id = newId(farmId, 'animals')
  const key = balanceKey(a.categoryId, a.sex)
  await runTransaction(db, async (tx) => {
    if (alreadyCounted) {
      const lot = await tx.get(farmDoc(farmId, 'herdLots', a.lotId))
      const available = ((lot.data()?.balances ?? {}) as Record<string, number>)[key] ?? 0
      if (available - identifiedInKey < 1) throw new HerdError('Não há animais não identificados desta categoria/sexo no lote. Desmarque “já contabilizado” para registrar como nova entrada.')
    } else {
      const type: MovementType = a.origin === 'nascimento' ? 'nascimento' : a.origin === 'compra' ? 'compra' : 'transf_entrada'
      await applyMoves(tx, farmId, id, 'animal', [{
        lotId: a.lotId, type, date: a.entryDate, key1: key, qty1: 1, animalIds: [id], note: `Cadastro individual ${a.tag}`,
        lotExtra: (lot) => (a.weightKg ? { avgWeightKg: weightedAvg(lot.count, lot.avgWeightKg, 1, a.weightKg) } : {}),
      }])
    }
    tx.set(farmDoc(farmId, 'animals', id), clean({ ...a, tag: a.tag.trim(), status: 'ativo', createdBy: uid(), createdAt: ts() }))
    log(tx, farmId, 'animal_cadastrado', `${a.tag} (${alreadyCounted ? 'identificação' : 'nova entrada'})`)
  })
  return id
}

/** Edição cadastral: lote, categoria e sexo só mudam por movimentações (transferência/troca). */
export async function updateAnimalMeta(farmId: string, id: string, meta: Partial<Pick<Animal, 'tag' | 'name' | 'breed' | 'birthDate' | 'weightKg' | 'notes' | 'sellerName' | 'buyerName' | 'acquisitionCost'>>) {
  await runTransaction(db, async (tx) => {
    tx.update(farmDoc(farmId, 'animals', id), { ...clean(meta), updatedAt: ts() })
    log(tx, farmId, 'animal_editado', `${id}: ${Object.keys(meta).join(', ')}`)
  })
}

/* ---------------- Entradas ---------------- */

export interface PurchaseInput {
  date: string; sellerName: string; buyerName: string; lotId: string; categoryId: string; sex: Sex; qty: number
  totalKg: number; avgKg: number; unit: string; kgPerUnit: number; pricePerUnit: number
  computedAmount: number; amount: number; manualAmount: boolean; costPerHead: number; notes: string
  animals?: { tag: string; kg: number | null }[]
  finance?: { categoryId: string; categoryName: string } | null
}

export async function savePurchase(farmId: string, opId: string, p: PurchaseInput) {
  const key = balanceKey(p.categoryId, p.sex)
  return idempotent(farmId, 'purchases', opId, async (tx) => {
    const animalIds = (p.animals ?? []).map((_, i) => `${opId}-a${i}`)
    await applyMoves(tx, farmId, opId, 'compra', [{
      lotId: p.lotId, type: 'compra', date: p.date, key1: key, qty1: p.qty, animalIds, note: `Compra de ${p.sellerName}`,
      lotExtra: (lot) => ({ avgWeightKg: weightedAvg(lot.count, lot.avgWeightKg, p.qty, p.avgKg), avgWeightAt: p.avgKg ? p.date : lot.avgWeightAt ?? null }),
    }])
    const integrationId = `herd-purchase-${opId}`
    tx.set(farmDoc(farmId, 'purchases', opId), clean({
      ...p, animals: p.animals?.length ? p.animals : undefined, finance: undefined, integrationId,
      financeEntryId: p.finance ? integrationId : null, createdBy: uid(), createdAt: ts(),
    }))
    p.animals?.forEach((a, i) => tx.set(farmDoc(farmId, 'animals', animalIds[i]), clean({
      tag: a.tag.trim(), sex: p.sex, categoryId: p.categoryId, lotId: p.lotId, entryDate: p.date, origin: 'compra',
      sellerName: p.sellerName, buyerName: p.buyerName, weightKg: a.kg, acquisitionCost: p.costPerHead, status: 'ativo',
      purchaseId: opId, createdBy: uid(), createdAt: ts(),
    })))
    // Integração financeira opcional: id determinístico = nunca duplica.
    if (p.finance && p.amount > 0) {
      tx.set(farmDoc(farmId, 'expenseEntries', integrationId), {
        kind: 'other', date: p.date, amount: p.amount, categoryId: p.finance.categoryId, categoryName: p.finance.categoryName,
        description: `Compra de ${p.qty} cab. — ${p.sellerName}`.slice(0, 300), createdBy: uid(), createdAt: ts(),
      })
    }
    log(tx, farmId, 'compra_animais', `${p.qty} cab. de ${p.sellerName}, ${p.amount} centavos`)
  })
}

export async function saveBirth(farmId: string, opId: string, b: { date: string; lotId: string; categoryId: string; sex: Sex; qty: number; notes: string; responsible: string }) {
  return idempotent(farmId, 'births', opId, async (tx) => {
    await applyMoves(tx, farmId, opId, 'nascimento', [{ lotId: b.lotId, type: 'nascimento', date: b.date, key1: balanceKey(b.categoryId, b.sex), qty1: b.qty, note: b.notes }])
    tx.set(farmDoc(farmId, 'births', opId), { ...b, createdBy: uid(), createdAt: ts() })
    log(tx, farmId, 'nascimento', `${b.qty} cab.`)
  })
}

/* ---------------- Saídas ---------------- */

export interface ExitBase { date: string; lotId: string; categoryId: string; sex: Sex; anonQty: number; animalIds: string[]; notes: string }

/** Quantidade total = animais selecionados + cabeças não identificadas (estas limitadas ao saldo não identificado). */
function exitQty(e: ExitBase) { return e.anonQty + e.animalIds.length }

async function checkUnidentified(tx: Transaction, farmId: string, e: ExitBase, identifiedActiveInKey: number) {
  if (!e.anonQty) return
  const lot = await tx.get(farmDoc(farmId, 'herdLots', e.lotId))
  const bal = ((lot.data()?.balances ?? {}) as Record<string, number>)[balanceKey(e.categoryId, e.sex)] ?? 0
  if (e.anonQty > bal - identifiedActiveInKey) throw new HerdError(`Só há ${Math.max(0, bal - identifiedActiveInKey)} animal(is) não identificado(s) nesta categoria. Selecione os animais individualmente.`)
}

export interface SaleInput extends ExitBase {
  buyerName: string; totalKg: number; avgKg: number; unit: string; kgPerUnit: number; pricePerUnit: number
  computedGross: number; gross: number; manualGross: boolean; expenses: { type: string; description: string; amount: number }[]; expensesTotal: number; net: number
  /** Lança a receita líquida no financeiro (id determinístico: nunca duplica). */
  postRevenue?: boolean
}
export async function saveSale(farmId: string, opId: string, s: SaleInput, identifiedActiveInKey: number) {
  const qty = exitQty(s)
  if (qty < 1) throw new HerdError('Informe a quantidade vendida.')
  return idempotent(farmId, 'sales', opId, async (tx) => {
    await checkUnidentified(tx, farmId, s, identifiedActiveInKey)
    await applyMoves(tx, farmId, opId, 'venda', [{ lotId: s.lotId, type: 'venda', date: s.date, key1: balanceKey(s.categoryId, s.sex), qty1: -qty, animalIds: s.animalIds, note: `Venda para ${s.buyerName}` }])
    const integrationId = `herd-sale-${opId}`
    const post = s.postRevenue && s.net > 0
    tx.set(farmDoc(farmId, 'sales', opId), clean({ ...s, postRevenue: undefined, qty, integrationId, revenueEntryId: post ? integrationId : null, createdBy: uid(), createdAt: ts() }))
    if (post) tx.set(farmDoc(farmId, 'revenueEntries', integrationId), revenueDoc(opId, s.date, s.net, s.buyerName, qty))
    s.animalIds.forEach((id) => tx.update(farmDoc(farmId, 'animals', id), { status: 'vendido', exitRef: opId, updatedAt: ts() }))
    log(tx, farmId, 'venda_animais', `${qty} cab. para ${s.buyerName}, líquido ${s.net} centavos`)
  })
}

export interface DeathInput extends ExitBase { cause: string; responsible: string }
export async function saveDeath(farmId: string, opId: string, d: DeathInput, identifiedActiveInKey: number) {
  const qty = exitQty(d)
  if (qty < 1) throw new HerdError('Informe a quantidade.')
  return idempotent(farmId, 'mortalityRecords', opId, async (tx) => {
    await checkUnidentified(tx, farmId, d, identifiedActiveInKey)
    await applyMoves(tx, farmId, opId, 'morte', [{ lotId: d.lotId, type: 'morte', date: d.date, key1: balanceKey(d.categoryId, d.sex), qty1: -qty, animalIds: d.animalIds, note: d.cause }])
    tx.set(farmDoc(farmId, 'mortalityRecords', opId), clean({ ...d, qty, createdBy: uid(), createdAt: ts() }))
    d.animalIds.forEach((id) => tx.update(farmDoc(farmId, 'animals', id), { status: 'morto', exitRef: opId, updatedAt: ts() }))
    log(tx, farmId, 'morte_animais', `${qty} cab. — ${d.cause}`)
  })
}

/* ---------------- Transferências ---------------- */

export interface TransferInput extends ExitBase {
  toLotId: string; toFarmId?: string | null; toCategoryId?: string; avgKg?: number | null; reason: string
}
export async function saveTransfer(farmId: string, opId: string, t: TransferInput, identifiedActiveInKey: number, animals: Animal[]) {
  const qty = exitQty(t)
  if (qty < 1) throw new HerdError('Informe a quantidade.')
  const external = !!t.toFarmId && t.toFarmId !== farmId
  if (!external && t.toLotId === t.lotId) throw new HerdError('Origem e destino são o mesmo lote.')
  const fromKey = balanceKey(t.categoryId, t.sex)
  const toKey = balanceKey(external ? t.toCategoryId! : t.categoryId, t.sex)
  return idempotent(farmId, 'herdTransfers', opId, async (tx) => {
    await checkUnidentified(tx, farmId, t, identifiedActiveInKey)
    await applyMoves(tx, farmId, opId, 'transferencia', [
      { lotId: t.lotId, type: 'transf_saida', date: t.date, key1: fromKey, qty1: -qty, animalIds: t.animalIds, transferId: opId, otherLotId: t.toLotId, otherFarmId: external ? t.toFarmId! : undefined, note: t.reason },
      { farmId: external ? t.toFarmId! : farmId, lotId: t.toLotId, type: 'transf_entrada', date: t.date, key1: toKey, qty1: qty, animalIds: external ? t.animalIds.map((id) => `${opId}-${id}`) : t.animalIds, transferId: opId, otherLotId: t.lotId, otherFarmId: external ? farmId : undefined, note: t.reason,
        lotExtra: (lot) => (t.avgKg ? { avgWeightKg: weightedAvg(lot.count, lot.avgWeightKg, qty, t.avgKg) } : {}) },
    ])
    const rec = clean({ ...t, qty, toFarmId: external ? t.toFarmId : null, external, createdBy: uid(), createdAt: ts() })
    tx.set(farmDoc(farmId, 'herdTransfers', opId), rec)
    if (external) {
      tx.set(farmDoc(t.toFarmId!, 'herdTransfers', opId), { ...rec, direction: 'entrada', fromFarmId: farmId })
      for (const id of t.animalIds) {
        const a = animals.find((x) => x.id === id)!
        tx.update(farmDoc(farmId, 'animals', id), { status: 'transferido', exitRef: opId, updatedAt: ts() })
        tx.set(farmDoc(t.toFarmId!, 'animals', `${opId}-${id}`), clean({
          tag: a.tag, name: a.name, sex: a.sex, categoryId: t.toCategoryId, breed: a.breed, birthDate: a.birthDate ?? null, weightKg: a.weightKg ?? null,
          lotId: t.toLotId, entryDate: t.date, origin: 'transferencia', notes: a.notes, status: 'ativo', transferRef: `${farmId}/${id}`, createdBy: uid(), createdAt: ts(),
        }))
      }
      log(tx, t.toFarmId!, 'transferencia_recebida', `${qty} cab. da fazenda ${farmId}`)
    } else {
      t.animalIds.forEach((id) => tx.update(farmDoc(farmId, 'animals', id), { lotId: t.toLotId, updatedAt: ts() }))
    }
    log(tx, farmId, 'transferencia', `${qty} cab. ${t.lotId} → ${external ? `${t.toFarmId}/` : ''}${t.toLotId}`)
  })
}

/** Mudança de categoria dentro do lote: uma movimentação com duas chaves (−n e +n), total inalterado. */
export async function changeCategory(farmId: string, opId: string, c: { date: string; lotId: string; sex: Sex; fromCategoryId: string; toCategoryId: string; anonQty: number; animalIds: string[]; notes: string }, identifiedActiveInKey: number) {
  const qty = c.anonQty + c.animalIds.length
  if (qty < 1 || c.fromCategoryId === c.toCategoryId) throw new HerdError('Informe a quantidade e categorias diferentes.')
  return idempotent(farmId, 'categoryChanges', opId, async (tx) => {
    await checkUnidentified(tx, farmId, { ...c, categoryId: c.fromCategoryId }, identifiedActiveInKey)
    await applyMoves(tx, farmId, opId, 'troca_categoria', [{ lotId: c.lotId, type: 'troca_categoria', date: c.date, key1: balanceKey(c.fromCategoryId, c.sex), qty1: -qty, key2: balanceKey(c.toCategoryId, c.sex), qty2: qty, animalIds: c.animalIds, note: c.notes }])
    tx.set(farmDoc(farmId, 'categoryChanges', opId), clean({ ...c, qty, createdBy: uid(), createdAt: ts() }))
    c.animalIds.forEach((id) => tx.update(farmDoc(farmId, 'animals', id), { categoryId: c.toCategoryId, updatedAt: ts() }))
    log(tx, farmId, 'troca_categoria', `${qty} cab. no lote ${c.lotId}`)
  })
}

/* ---------------- Inventário físico ---------------- */

export interface CountItem { lotId: string; key: string; registered: number; found: number; justification: string }

/**
 * Confirma uma conferência física: cada diferença vira um ajuste de inventário
 * (movimentação "ajuste" + registro com antes/depois/justificativa). Ids determinísticos:
 * repetir a confirmação não duplica ajustes. Saldo nunca muda sem esta confirmação explícita.
 */
export async function confirmPhysicalCount(farmId: string, invId: string, meta: { date: string; responsible: string; notes: string }, items: CountItem[]) {
  const diffs = items.filter((i) => i.found !== i.registered)
  await runTransaction(db, async (tx) => {
    const ref = farmDoc(farmId, 'herdInventories', invId)
    if ((await tx.get(ref)).exists()) return
    tx.set(ref, { ...meta, items: items.map((i) => ({ ...i, diff: i.found - i.registered })), status: 'confirmando', createdBy: uid(), createdAt: ts() })
  })
  for (const i of diffs) {
    const adjId = `${invId}-${i.lotId}-${i.key.replace('|', '_')}`
    await idempotent(farmId, 'inventoryAdjustments', adjId, async (tx) => {
      const lot = await tx.get(farmDoc(farmId, 'herdLots', i.lotId))
      const before = ((lot.data()?.balances ?? {}) as Record<string, number>)[i.key] ?? 0
      const delta = i.found - before
      if (delta === 0) return
      await applyMoves(tx, farmId, adjId, 'ajuste', [{ lotId: i.lotId, type: 'ajuste', date: meta.date, key1: i.key, qty1: delta, note: i.justification }])
      tx.set(farmDoc(farmId, 'inventoryAdjustments', adjId), { inventoryId: invId, lotId: i.lotId, key: i.key, before, after: i.found, delta, justification: i.justification, responsible: meta.responsible, date: meta.date, createdBy: uid(), createdAt: ts() })
      log(tx, farmId, 'ajuste_inventario', `${i.lotId} ${parseKey(i.key).categoryId}: ${before} → ${i.found}`)
    })
  }
  await runTransaction(db, async (tx) => { tx.update(farmDoc(farmId, 'herdInventories', invId), { status: 'confirmado', confirmedAt: ts() }) })
}

/* ---------------- Vacinação ---------------- */

export async function saveVaccination(farmId: string, opId: string, v: Record<string, unknown> & { boosterOfId?: string | null }) {
  return idempotent(farmId, 'vaccinations', opId, async (tx) => {
    tx.set(farmDoc(farmId, 'vaccinations', opId), clean({ ...v, createdBy: uid(), createdAt: ts() }))
    // Aplicação que cumpre um reforço/agenda anterior encerra o alerta daquele registro.
    if (v.boosterOfId) tx.update(farmDoc(farmId, 'vaccinations', v.boosterOfId), { boosterDoneById: opId, updatedAt: ts() })
    log(tx, farmId, 'vacinacao', `${v.vaccine} — ${v.qty} cab. (${v.status})`)
  })
}

/* ---------------- Consultas ---------------- */

export async function fetchMovements(farmId: string, filter?: { lotId?: string; upTo?: string }): Promise<HerdMovement[]> {
  const base = farmCol(farmId, 'herdMovements')
  const q = filter?.lotId ? query(base, where('lotId', '==', filter.lotId)) : query(base, orderBy('date'))
  const docs = (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }) as HerdMovement)
  return docs.filter((m) => !filter?.upTo || m.date <= filter.upTo).sort((a, b) => a.date.localeCompare(b.date))
}

export async function fetchOps<T>(farmId: string, col: string, lotField?: string, lotId?: string): Promise<T[]> {
  const base = farmCol(farmId, col)
  const snap = await getDocs(lotField && lotId ? query(base, where(lotField, '==', lotId)) : base)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T)
}

export async function fetchOtherFarmLots(farmId: string) {
  const [lots, cats] = await Promise.all([getDocs(collection(db, 'farms', farmId, 'herdLots')), getDocs(collection(db, 'farms', farmId, 'animalCategories'))])
  return {
    lots: lots.docs.map((d) => ({ id: d.id, ...d.data() }) as HerdLot).filter((l) => l.active),
    categories: cats.docs.map((d) => ({ id: d.id, name: d.data().name as string, active: d.data().active as boolean })).filter((c) => c.active),
  }
}

/* ---------------- Receita de vendas ---------------- */

function revenueDoc(saleId: string, date: string, net: number, buyer: string, qty: number) {
  return { date, amount: net, source: 'venda_animais', description: `Venda de ${qty} cab. — ${buyer}`.slice(0, 300), saleId, createdBy: uid(), createdAt: ts() }
}

/** Lança no financeiro a receita de uma venda já registrada (idempotente). */
export async function postSaleRevenue(farmId: string, sale: { id: string; date: string; net: number; buyerName: string; qty: number; revenueEntryId?: string | null; reversedBy?: string }) {
  if (sale.reversedBy) throw new HerdError('Venda estornada não gera receita.')
  if (!(sale.net > 0)) throw new HerdError('Venda sem valor líquido positivo.')
  const id = `herd-sale-${sale.id}`
  await runTransaction(db, async (tx) => {
    const ref = farmDoc(farmId, 'revenueEntries', id)
    if ((await tx.get(ref)).exists()) return
    tx.set(ref, revenueDoc(sale.id, sale.date, sale.net, sale.buyerName, sale.qty))
    tx.update(farmDoc(farmId, 'sales', sale.id), { revenueEntryId: id })
    log(tx, farmId, 'receita_venda_lancada', `${id}: ${sale.net} centavos`)
  })
}

/* ---------------- Estorno ---------------- */

/**
 * Estorna uma operação do rebanho sem apagar nada: grava movimentações inversas
 * (tipo "estorno") em cada lote afetado, um registro em `reversals` e marca a operação
 * original com `reversedBy`. Animais voltam ao estado anterior e o lançamento financeiro
 * vinculado (despesa da compra / receita da venda) é removido. Saldos são revalidados:
 * não é possível estornar uma compra cujos animais já saíram do lote.
 * Id determinístico (rev-{operação}): cada operação só pode ser estornada uma vez.
 */
export async function reverseOperation(farmId: string, col: ReversibleCol, opId: string, reason: string, date: string) {
  const reversalId = `rev-${opId}`
  const op = (await getDoc(farmDoc(farmId, col, opId))).data() as Record<string, unknown> | undefined
  if (!op) throw new HerdError('Operação não encontrada.')
  if (op.reversedBy) throw new HerdError('Esta operação já foi estornada.')
  const external = col === 'herdTransfers' && !!op.external
  if (col === 'herdTransfers' && op.direction === 'entrada') throw new HerdError('Estorne a transferência na fazenda de origem.')
  const destFarm = external ? (op.toFarmId as string) : null
  const own = (await getDocs(query(farmCol(farmId, 'herdMovements'), where('refId', '==', opId)))).docs.map((d) => ({ id: d.id, ...d.data() }) as HerdMovement)
  const dest = destFarm ? (await getDocs(query(farmCol(destFarm, 'herdMovements'), where('refId', '==', opId)))).docs.map((d) => ({ id: d.id, ...d.data() }) as HerdMovement) : []
  if (!own.length) throw new HerdError('Movimentações da operação não encontradas.')
  const label = REVERSIBLE_LABEL[col]

  return idempotent(farmId, 'reversals', reversalId, async (tx) => {
    const cur = await tx.get(farmDoc(farmId, col, opId))
    if (cur.data()?.reversedBy) throw new HerdError('Esta operação já foi estornada.')
    // Animais afetados: lidos antes das gravações (exigência das transações).
    const animalIds = [...new Set(own.flatMap((m) => m.animalIds ?? []))]
    const animalSnaps = await Promise.all(animalIds.map((id) => tx.get(farmDoc(farmId, 'animals', id))))
    const destAnimalIds = [...new Set(dest.flatMap((m) => m.animalIds ?? []))]
    const destSnaps = destFarm ? await Promise.all(destAnimalIds.map((id) => tx.get(farmDoc(destFarm, 'animals', id)))) : []
    for (const a of destSnaps) if (a.exists() && a.data().status !== 'ativo') throw new HerdError(`O animal ${a.data().tag} já saiu da fazenda de destino; não é possível estornar.`)

    await applyMoves(tx, farmId, reversalId, 'estorno', [
      ...own.map((m) => ({ lotId: m.lotId, type: 'estorno' as const, date, ...inverseMovement(m), animalIds: m.animalIds, note: `Estorno de ${label}: ${reason}` })),
      ...dest.map((m) => ({ farmId: destFarm!, lotId: m.lotId, type: 'estorno' as const, date, ...inverseMovement(m), animalIds: m.animalIds, note: `Estorno de ${label}: ${reason}` })),
    ])
    tx.set(farmDoc(farmId, 'reversals', reversalId), { originalCol: col, originalId: opId, reason: reason.slice(0, 300), date, createdBy: uid(), createdAt: ts() })
    tx.update(farmDoc(farmId, col, opId), { reversedBy: reversalId, reversedAt: ts() })

    // Animais: desfaz o efeito da operação original.
    for (const a of animalSnaps) {
      if (!a.exists()) continue
      const d = a.data(), ref = farmDoc(farmId, 'animals', a.id)
      if (col === 'purchases') {
        if (d.status !== 'ativo') throw new HerdError(`O animal ${d.tag} já saiu do rebanho; estorne antes a saída dele.`)
        tx.update(ref, { status: 'estornado', exitRef: reversalId, updatedAt: ts() })
      } else if (col === 'sales' || col === 'mortalityRecords' || (col === 'herdTransfers' && external)) {
        tx.update(ref, { status: 'ativo', exitRef: null, reversalRef: reversalId, updatedAt: ts() })
      } else if (col === 'herdTransfers') {
        tx.update(ref, { lotId: op.lotId as string, updatedAt: ts() })
      } else if (col === 'categoryChanges') {
        tx.update(ref, { categoryId: op.fromCategoryId as string, updatedAt: ts() })
      }
    }
    if (destFarm) {
      for (const a of destSnaps) if (a.exists()) tx.update(farmDoc(destFarm, 'animals', a.id), { status: 'estornado', exitRef: reversalId, updatedAt: ts() })
      tx.set(farmDoc(destFarm, 'reversals', reversalId), { originalCol: col, originalId: opId, reason: reason.slice(0, 300), date, fromFarmId: farmId, createdBy: uid(), createdAt: ts() })
      tx.update(farmDoc(destFarm, 'herdTransfers', opId), { reversedBy: reversalId, reversedAt: ts() })
      log(tx, destFarm, 'estorno_transferencia', `${opId} estornada na origem: ${reason}`)
    }
    // Financeiro vinculado (ids determinísticos): remove a despesa da compra ou a receita da venda.
    if (col === 'purchases' && op.financeEntryId) tx.delete(farmDoc(farmId, 'expenseEntries', op.financeEntryId as string))
    if (col === 'sales' && op.revenueEntryId) tx.delete(farmDoc(farmId, 'revenueEntries', op.revenueEntryId as string))
    log(tx, farmId, 'estorno', `${label} ${opId}: ${reason}`)
  })
}
