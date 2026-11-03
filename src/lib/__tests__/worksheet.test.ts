import { describe, expect, it } from 'vitest'
import { historyCandidates, rowCalc, sheetTotals, type SheetRow } from '../worksheet'

const r = (p: Partial<SheetRow>): SheetRow => ({ id: Math.random().toString(), quantity: 0, weightKg: 0, arrobaPrice: 0, ...p })

describe('planilha de pesagem', () => {
  it('linha: 10 bois, 4.500 kg, R$ 310,00/@ (30 kg)', () => {
    const c = rowCalc(r({ quantity: 10, weightKg: 4500, arrobaPrice: 31000 }), 30)
    expect(c.avgKg).toBe(450); expect(c.arrobas).toBe(150); expect(c.arrobasPerHead).toBe(15)
    expect(c.valuePerHead).toBe(465000); expect(c.total).toBe(4650000)
  })
  it('fator configurável (carcaça 15 kg) e linha vazia', () => {
    expect(rowCalc(r({ quantity: 1, weightKg: 270, arrobaPrice: 30000 }), 15).arrobas).toBe(18)
    expect(rowCalc(r({}), 30)).toEqual({ avgKg: 0, arrobas: 0, arrobasPerHead: 0, valuePerHead: 0, total: 0 })
  })
  it('totais com preço médio ponderado pelas arrobas', () => {
    const t = sheetTotals([r({ quantity: 10, weightKg: 4500, arrobaPrice: 31000 }), r({ quantity: 20, weightKg: 6000, arrobaPrice: 28000 })], 30)
    expect(t).toMatchObject({ qty: 30, weightKg: 10500, avgKg: 350, arrobas: 350, total: 4650000 + 5600000 })
    expect(Math.round(t.avgArrobaPrice)).toBe(Math.round((150 * 31000 + 200 * 28000) / 350))
    expect(Math.round(t.valuePerHead)).toBe(Math.round(10250000 / 30))
  })
  it('candidatos ao histórico do lote', () => {
    const lots = [{ id: 'L1', count: 50, active: true }, { id: 'L2', count: 5, active: true }]
    const res = historyCandidates([
      r({ lotId: 'L1', quantity: 50, weightKg: 20000, loadedAvgKg: 380 }),
      r({ lotId: 'L2', quantity: 10, weightKg: 3000 }),
      r({ lotId: 'L1', quantity: 10, weightKg: 4000 }),
      r({ lotId: 'L2', quantity: 5, weightKg: 1500, loadedAvgKg: 300 }),
      r({ quantity: 3, weightKg: 900 }),
    ], lots)
    expect(res.ok).toHaveLength(1)
    expect(res.skipped.map((s) => s.reason)).toEqual(['quantidade maior que o saldo do lote (5)', 'lote repetido na planilha', 'peso igual ao do cadastro (não veio da balança)'])
  })
})
