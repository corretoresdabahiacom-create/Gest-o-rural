// Planilha de pesagem e valorização (portada do app Fazenda), com o fator de kg por arroba
// configurável (padrão: @ de peso vivo = 30 kg, isto é, 15 kg de carcaça com rendimento de 50%).

export interface SheetRow { id: string; lotId?: string | null; label?: string; quantity: number; weightKg: number; arrobaPrice: number; loadedAvgKg?: number | null }

export interface RowCalc { avgKg: number; arrobas: number; arrobasPerHead: number; valuePerHead: number; total: number }

/** Linha: peso é o TOTAL da linha; preço da arroba em centavos. */
export function rowCalc(r: SheetRow, kgPerArroba: number): RowCalc {
  const q = r.quantity > 0 ? r.quantity : 0
  const arrobas = kgPerArroba > 0 && r.weightKg > 0 ? r.weightKg / kgPerArroba : 0
  const arrobasPerHead = q ? arrobas / q : 0
  const valuePerHead = arrobasPerHead * (r.arrobaPrice || 0)
  return { avgKg: q ? r.weightKg / q : 0, arrobas, arrobasPerHead, valuePerHead, total: valuePerHead * q }
}

export interface SheetTotals { qty: number; weightKg: number; avgKg: number; arrobas: number; arrobasPerHead: number; avgArrobaPrice: number; valuePerHead: number; total: number }
export function sheetTotals(rows: SheetRow[], kgPerArroba: number): SheetTotals {
  let qty = 0, weightKg = 0, arrobas = 0, total = 0, priced = 0
  for (const r of rows) {
    const c = rowCalc(r, kgPerArroba)
    qty += r.quantity > 0 ? r.quantity : 0
    weightKg += r.weightKg > 0 ? r.weightKg : 0
    arrobas += c.arrobas
    total += c.total
    priced += c.arrobas * (r.arrobaPrice || 0)
  }
  return {
    qty, weightKg, avgKg: qty ? weightKg / qty : 0, arrobas, arrobasPerHead: qty ? arrobas / qty : 0,
    avgArrobaPrice: arrobas ? priced / arrobas : 0, // média ponderada pelas arrobas
    valuePerHead: qty ? total / qty : 0, total,
  }
}

/**
 * Linhas aptas a virar pesagem coletiva no histórico do lote: ligadas a um lote, com
 * quantidade e peso, quantidade ≤ saldo do lote e peso alterado em relação ao carregado
 * (evita registrar como pesagem um peso que só foi copiado do cadastro).
 */
export function historyCandidates(rows: SheetRow[], lots: { id: string; count: number; active: boolean }[]) {
  const ok: SheetRow[] = [], skipped: { row: SheetRow; reason: string }[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    if (!r.lotId) continue
    const lot = lots.find((l) => l.id === r.lotId)
    if (!lot || !lot.active) skipped.push({ row: r, reason: 'lote inativo ou excluído' })
    else if (!(r.quantity > 0) || !(r.weightKg > 0)) skipped.push({ row: r, reason: 'sem quantidade ou peso' })
    else if (r.quantity > lot.count) skipped.push({ row: r, reason: `quantidade maior que o saldo do lote (${lot.count})` })
    else if (seen.has(r.lotId)) skipped.push({ row: r, reason: 'lote repetido na planilha' })
    else if (r.loadedAvgKg != null && Math.round(r.loadedAvgKg * 10) === Math.round((r.weightKg / r.quantity) * 10)) skipped.push({ row: r, reason: 'peso igual ao do cadastro (não veio da balança)' })
    else { ok.push(r); seen.add(r.lotId) }
  }
  return { ok, skipped }
}
