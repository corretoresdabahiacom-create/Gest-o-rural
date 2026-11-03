// Pesagem: cálculos puros (GMD, estatísticas, comparabilidade, importação). Sem Firebase.
import { daysBetween } from './format'
import type { HerdMovement } from './herd'

export type WeighMode = 'individual' | 'collective'
export type CollectiveMethod = 'balanca_coletiva' | 'media_informada'

/** Registro de pesagem. Individual: qty = 1, avgKg = totalKg = peso do animal. Coletiva: dado agregado do lote. */
export interface Weighing {
  id: string
  sessionId: string
  date: string
  mode: WeighMode
  lotId: string
  categoryId?: string | null
  animalId?: string | null
  tag?: string | null
  qty: number
  totalKg: number
  avgKg: number
  prevKg?: number | null
  prevDate?: string | null
  gainKg?: number | null
  gmd?: number | null
  method?: CollectiveMethod | 'individual'
  lotCountAtWeighing?: number | null
  correctsId?: string | null
  correctionReason?: string | null
  supersededBy?: string | null
}

export interface WeighingSession {
  id: string
  date: string
  mode: WeighMode
  lotId: string
  categoryId?: string | null
  responsible: string
  location?: string
  notes?: string
  count: number
  totalKg: number
  avgKg: number
  gainAvg?: number | null
  gmdAvg?: number | null
  source?: 'manual' | 'importacao'
}

const r2 = (n: number) => Math.round(n * 100) / 100
const r1 = (n: number) => Math.round(n * 10) / 10

export const diffKg = (cur: number, prev?: number | null) => (prev != null && prev > 0 && cur > 0 ? r1(cur - prev) : null)

/** GMD = (atual − anterior) / dias. Indisponível sem pesagem anterior válida ou com intervalo ≤ 0. */
export function gmd(cur: number, curDate: string, prev?: number | null, prevDate?: string | null): number | null {
  if (prev == null || !(prev > 0) || !(cur > 0) || !prevDate) return null
  const days = daysBetween(prevDate, curDate)
  return days > 0 ? Math.round(((cur - prev) / days) * 1000) / 1000 : null
}

export const toArrobas = (kg: number, kgPerUnit: number) => (kgPerUnit > 0 ? r2(kg / kgPerUnit) : 0)

/** Pesagem coletiva: média = total / quantidade, ou total = média × quantidade. */
export function collectiveCalc(qty: number, totalKg: number | null, avgKg: number | null): { totalKg: number; avgKg: number; method: CollectiveMethod } | null {
  if (!(qty > 0)) return null
  if (totalKg != null && totalKg > 0) return { totalKg: r1(totalKg), avgKg: r1(totalKg / qty), method: 'balanca_coletiva' }
  if (avgKg != null && avgKg > 0) return { totalKg: r1(avgKg * qty), avgKg: r1(avgKg), method: 'media_informada' }
  return null
}

export interface SessionStats { count: number; totalKg: number; avgKg: number; maxKg: number | null; minKg: number | null; gainTotal: number | null; gainAvg: number | null; gmdAvg: number | null; gmdCount: number }
/** Indicadores da planilha. Média de GMD só sobre animais com GMD calculável. */
export function sessionStats(rows: { qty: number; totalKg: number; avgKg: number; gainKg?: number | null; gmd?: number | null }[]): SessionStats {
  const valid = rows.filter((r) => r.qty > 0 && r.totalKg > 0)
  const count = valid.reduce((s, r) => s + r.qty, 0)
  const totalKg = valid.reduce((s, r) => s + r.totalKg, 0)
  const gains = valid.filter((r) => r.gainKg != null)
  const gmds = valid.filter((r) => r.gmd != null)
  return {
    count, totalKg: r1(totalKg), avgKg: count ? r1(totalKg / count) : 0,
    maxKg: valid.length ? Math.max(...valid.map((r) => r.avgKg)) : null,
    minKg: valid.length ? Math.min(...valid.map((r) => r.avgKg)) : null,
    gainTotal: gains.length ? r1(gains.reduce((s, r) => s + r.gainKg!, 0)) : null,
    gainAvg: gains.length ? r1(gains.reduce((s, r) => s + r.gainKg!, 0) / gains.length) : null,
    gmdAvg: gmds.length ? Math.round((gmds.reduce((s, r) => s + r.gmd!, 0) / gmds.length) * 1000) / 1000 : null,
    gmdCount: gmds.length,
  }
}

/** Última pesagem individual válida (não substituída) de um animal ANTES da data informada. */
export function previousWeighing(history: Weighing[], animalId: string, beforeDate: string): Weighing | null {
  return history.filter((w) => w.animalId === animalId && !w.supersededBy && w.date < beforeDate)
    .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
}

/**
 * Comparação entre duas pesagens coletivas do mesmo lote. Só é metodologicamente
 * comparável (e só então há GMD) se não houve entradas/saídas/transferências/trocas
 * de categoria entre as datas e se a quantidade pesada for a mesma.
 */
export function collectiveComparison(prev: Weighing, cur: Weighing, lotMovs: HerdMovement[]) {
  const between = lotMovs.filter((m) => m.lotId === cur.lotId && m.date > prev.date && m.date <= cur.date)
  const reasons: string[] = []
  if (between.length) reasons.push(`${between.length} movimentação(ões) no lote entre as pesagens (composição mudou)`)
  if (prev.qty !== cur.qty) reasons.push(`quantidades pesadas diferentes (${prev.qty} × ${cur.qty})`)
  const comparable = reasons.length === 0
  const days = daysBetween(prev.date, cur.date)
  return {
    comparable, reasons, days,
    diffAvg: r1(cur.avgKg - prev.avgKg),
    gmd: comparable && days > 0 ? Math.round(((cur.avgKg - prev.avgKg) / days) * 1000) / 1000 : null,
  }
}

/** Série do peso médio de um lote por sessão (individual = média dos pesados; coletiva = média informada). */
export function lotSeries(weighings: Weighing[], lotId: string) {
  const bySession = new Map<string, { date: string; qty: number; total: number; mode: WeighMode }>()
  for (const w of weighings) {
    if (w.lotId !== lotId || w.supersededBy) continue
    const s = bySession.get(w.sessionId) ?? { date: w.date, qty: 0, total: 0, mode: w.mode }
    s.qty += w.qty; s.total += w.totalKg
    bySession.set(w.sessionId, s)
  }
  return [...bySession.entries()].map(([sessionId, s]) => ({ sessionId, date: s.date, qty: s.qty, avgKg: r1(s.total / s.qty), mode: s.mode })).sort((a, b) => a.date.localeCompare(b.date))
}

/** Faixas de peso para distribuição. */
export function weightBands(weights: number[], step = 50) {
  const bands = new Map<number, number>()
  for (const w of weights) { const b = Math.floor(w / step) * step; bands.set(b, (bands.get(b) ?? 0) + 1) }
  return [...bands.entries()].sort((a, b) => a[0] - b[0]).map(([b, n]) => ({ label: `${b}–${b + step - 1}`, value: n }))
}

/* -------- Entrada de dados -------- */

/** Peso digitado/colado: "330", "330,5", "1.200,5" -> número; inválido -> null. */
export function parseKg(s: string | number | null | undefined): number | null {
  if (typeof s === 'number') return s > 0 && s < 3000 ? s : null
  if (!s) return null
  let t = String(s).trim().replace(/\s*kg$/i, '')
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return n > 0 && n < 3000 ? n : null
}

/** Datas de planilha: DD/MM/AAAA, AAAA-MM-DD, Date ou número serial do Excel. */
export function parseSheetDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10)
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10)
  const s = String(v ?? '').trim()
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    const iso = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    return isValidIso(iso) ? iso : null
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m && isValidIso(m[0]) ? m[0] : null
}
function isValidIso(iso: string) { const d = new Date(iso + 'T00:00:00Z'); return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso }

/** Texto colado de outra planilha (Excel/Sheets usam TAB entre colunas). */
export function parsePasted(text: string): string[][] {
  return text.replace(/\r/g, '').split('\n').map((l) => l.split('\t').map((c) => c.trim())).filter((r) => r.some(Boolean))
}

/** CSV simples com detecção de separador (; ou ,) e aspas. */
export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/)[0] ?? ''
  const sep = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (c === '"') q = false; else cell += c }
    else if (c === '"') q = true
    else if (c === sep) { row.push(cell.trim()); cell = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = '' }
    else cell += c
  }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row)
  return rows
}

export type ImportField = 'date' | 'lot' | 'tag' | 'kg'
export const IMPORT_FIELD_LABEL: Record<ImportField, string> = { date: 'Data', lot: 'Lote', tag: 'Identificação do animal', kg: 'Peso (kg)' }

/** Sugere o mapeamento pelas palavras do cabeçalho. */
export function guessMapping(header: string[]): Partial<Record<ImportField, number>> {
  const norm = header.map((h) => h.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase())
  const find = (re: RegExp) => { const i = norm.findIndex((h) => re.test(h)); return i >= 0 ? i : undefined }
  return { date: find(/data|date|dia/), lot: find(/lote|lot/), tag: find(/brinco|ident|animal|tag|numero|n[ºo°]/), kg: find(/peso|kg|weight/) }
}

export interface ImportRow { line: number; date: string | null; lotId: string | null; animalId: string | null; tag: string; kg: number | null; status: 'ok' | 'erro' | 'duplicado'; message: string }

/**
 * Valida as linhas importadas. Nada inválido é importado: data, lote, animal (deve pertencer
 * ao lote informado) e peso são conferidos; duplicidades no arquivo e com o histórico são marcadas.
 */
export function validateImport(
  rows: unknown[][], map: Partial<Record<ImportField, number>>,
  ctx: { lots: { id: string; name: string; code?: string }[]; animals: { id: string; tag: string; lotId: string; status: string }[]; existing: { animalId?: string | null; date: string; supersededBy?: string | null }[]; defaultLotId?: string; defaultDate?: string; today: string },
): ImportRow[] {
  const norm = (s: string) => s.trim().toLowerCase()
  const seen = new Set<string>()
  const existing = new Set(ctx.existing.filter((e) => e.animalId && !e.supersededBy).map((e) => `${e.animalId}|${e.date}`))
  return rows.map((r, i) => {
    const cell = (f: ImportField) => (map[f] == null ? undefined : r[map[f]!])
    const date = map.date != null ? parseSheetDate(cell('date')) : ctx.defaultDate ?? null
    const lotTxt = map.lot != null ? String(cell('lot') ?? '').trim() : ''
    const lot = lotTxt ? ctx.lots.find((l) => norm(l.name) === norm(lotTxt) || (l.code && norm(l.code) === norm(lotTxt))) : ctx.lots.find((l) => l.id === ctx.defaultLotId)
    const tag = String(cell('tag') ?? '').trim()
    const kg = parseKg(cell('kg') as string)
    const animal = tag ? ctx.animals.find((a) => norm(a.tag) === norm(tag) && a.status === 'ativo') : undefined
    const base = { line: i + 1, date, lotId: lot?.id ?? null, animalId: animal?.id ?? null, tag, kg }
    const err = (message: string): ImportRow => ({ ...base, status: 'erro', message })
    if (!date) return err('Data inválida')
    if (date > ctx.today) return err('Data no futuro')
    if (!lot) return err(lotTxt ? `Lote “${lotTxt}” não encontrado` : 'Lote não informado')
    if (!tag) return err('Identificação vazia')
    if (!animal) return err(`Animal “${tag}” não cadastrado ou inativo`)
    if (animal.lotId !== lot.id) return err(`Animal “${tag}” não pertence ao lote informado`)
    if (kg == null) return err('Peso inválido')
    const key = `${animal.id}|${date}`
    if (seen.has(key)) return { ...base, status: 'duplicado', message: 'Repetido no arquivo' }
    seen.add(key)
    if (existing.has(key)) return { ...base, status: 'duplicado', message: 'Já existe pesagem deste animal nesta data' }
    return { ...base, status: 'ok', message: '' }
  })
}
