import { describe, expect, it } from 'vitest'
import { collectiveCalc, collectiveComparison, diffKg, gmd, guessMapping, lotSeries, parseCsv, parseKg, parsePasted, parseSheetDate, previousWeighing, sessionStats, toArrobas, validateImport, weightBands, type Weighing } from '../weighing'
import { animalGains, buildWeighReport, type WeighFilters } from '../weighingReports'
import type { HerdMovement } from '../herd'

const w = (p: Partial<Weighing>): Weighing => ({ id: Math.random().toString(36), sessionId: 's', date: '2026-10-01', mode: 'individual', lotId: 'L1', qty: 1, totalKg: 300, avgKg: 300, ...p })

describe('cálculos de pesagem', () => {
  it('diferença e GMD do exemplo (300 → 330 em 30 dias = 1 kg/dia)', () => {
    expect(diffKg(330, 300)).toBe(30)
    expect(gmd(330, '2026-10-31', 300, '2026-10-01')).toBe(1)
  })
  it('intervalos diferentes e dados ausentes', () => {
    expect(gmd(330, '2026-11-15', 300, '2026-10-01')).toBe(0.667)
    expect(gmd(290, '2026-10-11', 300, '2026-10-01')).toBe(-1)
    expect(gmd(330, '2026-10-01', 300, '2026-10-01')).toBeNull() // mesmo dia
    expect(gmd(330, '2026-10-01', null, null)).toBeNull()       // sem anterior
    expect(gmd(330, '2026-10-01', 300, '2026-10-05')).toBeNull() // anterior posterior
    expect(diffKg(330, null)).toBeNull()
  })
  it('conversão para arrobas respeita o fator configurado', () => {
    expect(toArrobas(450, 30)).toBe(15)
    expect(toArrobas(270, 15)).toBe(18)
    expect(toArrobas(450, 0)).toBe(0)
  })
  it('pesagem coletiva: média a partir do total e total a partir da média', () => {
    expect(collectiveCalc(50, 18000, null)).toEqual({ totalKg: 18000, avgKg: 360, method: 'balanca_coletiva' })
    expect(collectiveCalc(50, null, 360)).toEqual({ totalKg: 18000, avgKg: 360, method: 'media_informada' })
    expect(collectiveCalc(0, 18000, null)).toBeNull()
  })
  it('indicadores da planilha', () => {
    const s = sessionStats([{ qty: 1, totalKg: 330, avgKg: 330, gainKg: 30, gmd: 1 }, { qty: 1, totalKg: 290, avgKg: 290, gainKg: null, gmd: null }, { qty: 1, totalKg: 410, avgKg: 410, gainKg: 10, gmd: 0.5 }])
    expect(s).toMatchObject({ count: 3, totalKg: 1030, avgKg: 343.3, maxKg: 410, minKg: 290, gainTotal: 40, gainAvg: 20, gmdAvg: 0.75, gmdCount: 2 })
  })
})

describe('histórico e comparabilidade', () => {
  const hist = [w({ animalId: 'a1', date: '2026-08-01', avgKg: 280 }), w({ animalId: 'a1', date: '2026-09-01', avgKg: 300, supersededBy: 'x' }), w({ animalId: 'a1', date: '2026-09-01', avgKg: 305 }), w({ animalId: 'a2', date: '2026-09-15', avgKg: 400 })]
  it('recupera o peso anterior correto, ignorando registros corrigidos', () => {
    expect(previousWeighing(hist, 'a1', '2026-10-01')?.avgKg).toBe(305)
    expect(previousWeighing(hist, 'a1', '2026-09-01')?.avgKg).toBe(280)
    expect(previousWeighing(hist, 'a3', '2026-10-01')).toBeNull()
  })
  it('animal transferido mantém histórico (busca por animal, não por lote)', () => {
    const h = [w({ animalId: 'a1', lotId: 'L1', date: '2026-08-01', avgKg: 280 })]
    expect(previousWeighing(h, 'a1', '2026-10-01')?.lotId).toBe('L1')
  })
  it('médias coletivas só geram GMD com a mesma composição', () => {
    const prev = w({ mode: 'collective', date: '2026-09-01', qty: 50, avgKg: 350 }), cur = w({ mode: 'collective', date: '2026-10-01', qty: 50, avgKg: 380 })
    expect(collectiveComparison(prev, cur, [])).toMatchObject({ comparable: true, diffAvg: 30, gmd: 1 })
    const mv = { id: 'm', type: 'venda', date: '2026-09-15', lotId: 'L1', keys: ['k'], key1: 'k', qty1: -10, total: -10 } as HerdMovement
    const c2 = collectiveComparison(prev, cur, [mv])
    expect(c2.comparable).toBe(false); expect(c2.gmd).toBeNull(); expect(c2.reasons[0]).toMatch(/composição/)
    expect(collectiveComparison(prev, { ...cur, qty: 40 }, []).gmd).toBeNull()
  })
  it('série do lote e faixas de peso', () => {
    const ws = [w({ sessionId: 's1', date: '2026-09-01', avgKg: 300, totalKg: 300 }), w({ sessionId: 's1', date: '2026-09-01', avgKg: 320, totalKg: 320 }), w({ sessionId: 's2', mode: 'collective', date: '2026-10-01', qty: 2, totalKg: 680, avgKg: 340 })]
    expect(lotSeries(ws, 'L1').map((s) => [s.avgKg, s.qty])).toEqual([[310, 2], [340, 2]])
    expect(weightBands([310, 340, 355, 420])).toEqual([{ label: '300–349', value: 2 }, { label: '350–399', value: 1 }, { label: '400–449', value: 1 }])
  })
})

describe('entrada de dados e importação', () => {
  it('pesos e datas digitados ou importados', () => {
    expect(parseKg('330,5')).toBe(330.5); expect(parseKg('1.200,5')).toBe(1200.5); expect(parseKg('330 kg')).toBe(330)
    expect(parseKg('-5')).toBeNull(); expect(parseKg('abc')).toBeNull(); expect(parseKg('5000')).toBeNull()
    expect(parseSheetDate('03/11/2026')).toBe('2026-11-03'); expect(parseSheetDate('2026-11-03')).toBe('2026-11-03')
    expect(parseSheetDate(46329)).toBe('2026-11-03'); expect(parseSheetDate('31/02/2026')).toBeNull()
  })
  it('colar do Excel e ler CSV', () => {
    expect(parsePasted('B01\t330\nB02\t341,5\n')).toEqual([['B01', '330'], ['B02', '341,5']])
    expect(parseCsv('Data;Lote;Brinco;Peso\n03/11/2026;Lote 1;"B01";330,5')).toEqual([['Data', 'Lote', 'Brinco', 'Peso'], ['03/11/2026', 'Lote 1', 'B01', '330,5']])
    expect(guessMapping(['Data', 'Lote', 'Brinco', 'Peso (kg)'])).toEqual({ date: 0, lot: 1, tag: 2, kg: 3 })
  })
  it('valida, rejeita inválidos e marca duplicidades', () => {
    const ctx = { today: '2026-11-03', lots: [{ id: 'L1', name: 'Lote 1' }, { id: 'L2', name: 'Lote 2', code: 'L02' }],
      animals: [{ id: 'a1', tag: 'B01', lotId: 'L1', status: 'ativo' }, { id: 'a2', tag: 'B02', lotId: 'L2', status: 'ativo' }, { id: 'a3', tag: 'B03', lotId: 'L1', status: 'vendido' }],
      existing: [{ animalId: 'a1', date: '2026-10-01' }] }
    const rows = [['03/11/2026', 'Lote 1', 'B01', '330'], ['03/11/2026', 'Lote 1', 'B01', '331'], ['03/11/2026', 'L02', 'B02', '400'], ['03/11/2026', 'Lote 1', 'B02', '400'],
      ['03/11/2026', 'Lote 1', 'B03', '300'], ['03/11/2026', 'Lote 9', 'B01', '300'], ['01/10/2026', 'Lote 1', 'B01', '300'], ['03/11/2026', 'Lote 1', 'B01', 'x'], ['10/12/2026', 'Lote 1', 'B01', '300']]
    const r = validateImport(rows, { date: 0, lot: 1, tag: 2, kg: 3 }, ctx)
    expect(r.map((x) => x.status)).toEqual(['ok', 'duplicado', 'ok', 'erro', 'erro', 'erro', 'duplicado', 'erro', 'erro'])
    expect(r[3].message).toMatch(/não pertence/); expect(r[4].message).toMatch(/inativo/); expect(r[5].message).toMatch(/não encontrado/)
  })
})

describe('relatórios de pesagem', () => {
  const ws = [w({ animalId: 'a1', tag: 'B01', date: '2026-09-01', avgKg: 300, totalKg: 300 }), w({ animalId: 'a1', tag: 'B01', date: '2026-10-01', avgKg: 330, totalKg: 330, gmd: 1, gainKg: 30 }),
    w({ animalId: 'a2', tag: 'B02', date: '2026-09-01', avgKg: 400, totalKg: 400 }), w({ animalId: 'a2', tag: 'B02', date: '2026-10-01', avgKg: 410, totalKg: 410, gmd: 0.333, gainKg: 10 }),
    w({ mode: 'collective', lotId: 'L2', qty: 50, totalKg: 18000, avgKg: 360, date: '2026-10-01' })]
  const f: WeighFilters = { start: '2026-01-01', end: '2026-12-31', lotId: '', categoryId: '', animalId: '', mode: '', sex: '' }
  const ctx = { lotName: (x?: string) => x ?? '', catName: (x?: string) => x ?? '', sexOf: () => 'M', kgPerArroba: 30, arrobaLabel: '@ vivo' }
  it('ganhos por animal e rankings', () => {
    expect(animalGains(ws).map((g) => [g.tag, g.gain, g.gmd])).toEqual([['B01', 30, 1], ['B02', 10, 0.333]])
    expect(buildWeighReport('maior', f, ws, ctx).rows[0]).toMatchObject({ animal: 'B01', ganho: 30 })
    expect(buildWeighReport('menor', f, ws, ctx).rows[0]).toMatchObject({ animal: 'B02' })
  })
  it('peso médio por lote e GMD por lote só com animais identificados', () => {
    const r = buildWeighReport('lote', f, ws, ctx)
    expect(r.rows.find((x) => x.nome === 'L2')).toMatchObject({ qtd: 50, medio: 360, arrobas: 12 })
    const g = buildWeighReport('gmd_lote', f, ws, ctx)
    expect(g.rows.find((x) => x.lote === 'L1')).toMatchObject({ gmd: 0.667 })
    expect(g.rows.find((x) => x.lote === 'L2')).toMatchObject({ gmd: null })
  })
  it('filtros combinados', () => {
    expect(buildWeighReport('periodo', { ...f, mode: 'collective' }, ws, ctx).rows).toHaveLength(1)
    expect(buildWeighReport('periodo', { ...f, animalId: 'a1', start: '2026-10-01' }, ws, ctx).rows).toHaveLength(1)
  })
})
