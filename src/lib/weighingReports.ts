import { fmtDate } from './format'
import { gmd, lotSeries, sessionStats, toArrobas, type Weighing } from './weighing'
import type { Column, ReportResult } from './reports'

export type WeighReportId = 'periodo' | 'lote' | 'categoria' | 'individual' | 'coletiva' | 'gmd_animal' | 'gmd_lote' | 'maior' | 'menor' | 'comparativo' | 'completo'
export const WEIGH_REPORTS: { id: WeighReportId; label: string }[] = [
  { id: 'periodo', label: 'Pesagens por período' }, { id: 'lote', label: 'Peso médio por lote' }, { id: 'categoria', label: 'Peso médio por categoria' },
  { id: 'individual', label: 'Evolução individual' }, { id: 'coletiva', label: 'Evolução coletiva' }, { id: 'gmd_animal', label: 'GMD por animal' },
  { id: 'gmd_lote', label: 'GMD por lote' }, { id: 'maior', label: 'Maior ganho de peso' }, { id: 'menor', label: 'Menor ganho de peso' },
  { id: 'comparativo', label: 'Comparativo entre lotes' }, { id: 'completo', label: 'Histórico completo' },
]
export interface WeighFilters { start: string; end: string; lotId: string; categoryId: string; animalId: string; mode: string; sex: string }
export interface WeighCtx { lotName: (id?: string) => string; catName: (id?: string) => string; sexOf: (animalId?: string | null) => string | undefined; kgPerArroba: number; arrobaLabel: string }

/** Ganho de cada animal entre a primeira e a última pesagem individual do período. */
export function animalGains(ws: Weighing[]) {
  const by = new Map<string, Weighing[]>()
  for (const w of ws) if (w.mode === 'individual' && w.animalId) by.set(w.animalId, [...(by.get(w.animalId) ?? []), w])
  return [...by.entries()].map(([animalId, list]) => {
    list.sort((a, b) => a.date.localeCompare(b.date))
    const f = list[0], l = list[list.length - 1]
    return { animalId, tag: l.tag ?? '', lotId: l.lotId, categoryId: l.categoryId, n: list.length, first: f, last: l, gain: list.length > 1 ? Math.round((l.avgKg - f.avgKg) * 10) / 10 : null, gmd: list.length > 1 ? gmd(l.avgKg, l.date, f.avgKg, f.date) : null }
  })
}

export function buildWeighReport(id: WeighReportId, f: WeighFilters, all: Weighing[], c: WeighCtx): ReportResult {
  const subtitle = `Período: ${fmtDate(f.start)} a ${fmtDate(f.end)} · arrobas em ${c.arrobaLabel} (${c.kgPerArroba} kg)`
  const ws = all.filter((w) => !w.supersededBy && w.date >= f.start && w.date <= f.end && (!f.lotId || w.lotId === f.lotId) && (!f.categoryId || w.categoryId === f.categoryId)
    && (!f.animalId || w.animalId === f.animalId) && (!f.mode || w.mode === f.mode) && (!f.sex || c.sexOf(w.animalId) === f.sex)).sort((a, b) => a.date.localeCompare(b.date))
  const tipo = (w: Weighing) => (w.mode === 'individual' ? 'Individual' : 'Coletiva')
  const avgRow = (list: Weighing[]) => { const s = sessionStats(list); return { qtd: s.count, total: s.totalKg, medio: s.avgKg, arrobas: toArrobas(s.avgKg, c.kgPerArroba) } }
  const avgCols: Column[] = [{ key: 'qtd', label: 'Cab. pesadas', type: 'number' }, { key: 'total', label: 'Peso total', type: 'kg' }, { key: 'medio', label: 'Peso médio', type: 'kg' }, { key: 'arrobas', label: '@/cab.', type: 'decimal' }]
  const group = (key: (w: Weighing) => string, label: string) => {
    const g = new Map<string, Weighing[]>(); for (const w of ws) g.set(key(w), [...(g.get(key(w)) ?? []), w])
    return { title: `Peso médio por ${label.toLowerCase()}`, subtitle, columns: [{ key: 'nome', label }, ...avgCols], rows: [...g.entries()].map(([k, l]) => ({ nome: k, ...avgRow(l) })), totals: { nome: 'GERAL', ...avgRow(ws) } }
  }
  switch (id) {
    case 'periodo':
    case 'completo': {
      const rows = ws.map((w) => ({ data: w.date, tipo: tipo(w), lote: c.lotName(w.lotId), cat: w.categoryId ? c.catName(w.categoryId) : '—', animal: w.tag ?? (w.mode === 'collective' ? 'Lote (agregado)' : ''), qtd: w.qty, medio: w.avgKg, total: w.totalKg, ganho: w.gainKg ?? null, gmd: w.gmd ?? null, obs: w.correctsId ? `Correção: ${w.correctionReason ?? ''}` : '' }))
      const cols: Column[] = [{ key: 'data', label: 'Data', type: 'date' }, { key: 'tipo', label: 'Tipo' }, { key: 'lote', label: 'Lote' }, { key: 'cat', label: 'Categoria' }, { key: 'animal', label: 'Animal' }, { key: 'qtd', label: 'Qtd.', type: 'number' }, { key: 'medio', label: 'Peso (médio)', type: 'kg' }, { key: 'total', label: 'Peso total', type: 'kg' }]
      if (id === 'completo') cols.push({ key: 'ganho', label: 'Ganho', type: 'kg' }, { key: 'gmd', label: 'GMD (kg/dia)', type: 'decimal' }, { key: 'obs', label: 'Observação' })
      return { title: id === 'periodo' ? 'Pesagens por período' : 'Histórico completo de pesagens', subtitle, columns: cols, rows, totals: { data: 'TOTAL', ...(() => { const a = avgRow(ws); return { qtd: a.qtd, total: a.total, medio: a.medio } })() } }
    }
    case 'lote': return group((w) => c.lotName(w.lotId), 'Lote')
    case 'categoria': return group((w) => (w.categoryId ? c.catName(w.categoryId) : 'Sem categoria'), 'Categoria')
    case 'individual': {
      const rows = ws.filter((w) => w.mode === 'individual').sort((a, b) => (a.tag ?? '').localeCompare(b.tag ?? '', 'pt-BR', { numeric: true }) || a.date.localeCompare(b.date))
        .map((w) => ({ animal: w.tag ?? '', data: w.date, lote: c.lotName(w.lotId), peso: w.avgKg, ant: w.prevKg ?? null, ganho: w.gainKg ?? null, gmd: w.gmd ?? null }))
      return { title: 'Evolução individual', subtitle, rows, columns: [{ key: 'animal', label: 'Animal' }, { key: 'data', label: 'Data', type: 'date' }, { key: 'lote', label: 'Lote' }, { key: 'ant', label: 'Peso anterior', type: 'kg' }, { key: 'peso', label: 'Peso', type: 'kg' }, { key: 'ganho', label: 'Ganho', type: 'kg' }, { key: 'gmd', label: 'GMD (kg/dia)', type: 'decimal' }] }
    }
    case 'coletiva': {
      const lotIds = [...new Set(ws.map((w) => w.lotId))]
      const rows = lotIds.flatMap((l) => lotSeries(ws, l).map((s, i, arr) => ({ lote: c.lotName(l), data: s.date, tipo: s.mode === 'individual' ? 'Individual (média)' : 'Coletiva', qtd: s.qty, medio: s.avgKg, dif: i ? Math.round((s.avgKg - arr[i - 1].avgKg) * 10) / 10 : null })))
      return { title: 'Evolução coletiva (peso médio por lote)', subtitle: `${subtitle}. Diferenças entre médias de composições diferentes não representam necessariamente ganho dos mesmos animais.`, rows,
        columns: [{ key: 'lote', label: 'Lote' }, { key: 'data', label: 'Data', type: 'date' }, { key: 'tipo', label: 'Pesagem' }, { key: 'qtd', label: 'Cab. pesadas', type: 'number' }, { key: 'medio', label: 'Peso médio', type: 'kg' }, { key: 'dif', label: 'Dif. p/ anterior', type: 'kg' }] }
    }
    case 'gmd_animal':
    case 'maior':
    case 'menor': {
      let g = animalGains(ws).filter((x) => x.gain != null)
      if (id !== 'gmd_animal') g = g.sort((a, b) => (id === 'maior' ? b.gain! - a.gain! : a.gain! - b.gain!)).slice(0, 20)
      else g = g.sort((a, b) => (b.gmd ?? -99) - (a.gmd ?? -99))
      return { title: id === 'gmd_animal' ? 'GMD por animal' : id === 'maior' ? 'Animais com maior ganho de peso' : 'Animais com menor ganho de peso', subtitle: `${subtitle} · entre a primeira e a última pesagem individual do período`,
        rows: g.map((x) => ({ animal: x.tag, lote: c.lotName(x.lotId), cat: x.categoryId ? c.catName(x.categoryId) : '—', n: x.n, ini: x.first.avgKg, fim: x.last.avgKg, ganho: x.gain, dias: Math.round((Date.parse(x.last.date) - Date.parse(x.first.date)) / 86400000), gmd: x.gmd })),
        columns: [{ key: 'animal', label: 'Animal' }, { key: 'lote', label: 'Lote atual' }, { key: 'cat', label: 'Categoria' }, { key: 'n', label: 'Pesagens', type: 'number' }, { key: 'ini', label: 'Peso inicial', type: 'kg' }, { key: 'fim', label: 'Peso final', type: 'kg' }, { key: 'ganho', label: 'Ganho', type: 'kg' }, { key: 'dias', label: 'Dias', type: 'number' }, { key: 'gmd', label: 'GMD (kg/dia)', type: 'decimal' }] }
    }
    case 'gmd_lote':
    case 'comparativo': {
      const lotIds = [...new Set(ws.map((w) => w.lotId))]
      const rows = lotIds.map((l) => {
        const s = lotSeries(ws, l), first = s[0], last = s[s.length - 1]
        const g = animalGains(ws.filter((w) => w.lotId === l)).filter((x) => x.gmd != null)
        const gmdInd = g.length ? Math.round((g.reduce((a, x) => a + x.gmd!, 0) / g.length) * 1000) / 1000 : null
        return { lote: c.lotName(l), n: s.length, ini: first.avgKg, fim: last.avgKg, dif: s.length > 1 ? Math.round((last.avgKg - first.avgKg) * 10) / 10 : null, gmd: gmdInd, base: g.length ? `${g.length} animais identificados` : s.length > 1 ? 'Só médias coletivas: GMD não calculado' : 'Uma pesagem' }
      })
      return { title: id === 'gmd_lote' ? 'GMD por lote' : 'Comparativo entre lotes', subtitle: `${subtitle}. GMD do lote = média dos GMD individuais (mesmos animais).`, rows,
        columns: [{ key: 'lote', label: 'Lote' }, { key: 'n', label: 'Pesagens', type: 'number' }, { key: 'ini', label: 'Peso médio inicial', type: 'kg' }, { key: 'fim', label: 'Peso médio atual', type: 'kg' }, { key: 'dif', label: 'Ganho médio', type: 'kg' }, { key: 'gmd', label: 'GMD (kg/dia)', type: 'decimal' }, { key: 'base', label: 'Base do cálculo' }] }
    }
  }
}
