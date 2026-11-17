import { describe, expect, it } from 'vitest'
import { project, validateProjection, type ProjectionInput } from '../projection'

const base: ProjectionInput = { lastKg: 450, lastDate: '2026-11-01', gmd: 0.8, heads: 100, pricePerArroba: 30000, kgPerArroba: 15, carcassYield: 0.52, dailyCost: 500, targetKg: 510 }

describe('projeção de venda', () => {
  it('estima o peso de hoje a partir da última pesagem', () => {
    const r = project(base, '2026-11-11')
    expect(r.daysSinceWeighing).toBe(10)
    expect(r.today.kg).toBe(458)
  })
  it('arrobas e valor por cabeça na @ de carcaça', () => {
    const r = project({ ...base, lastDate: '2026-11-11' }, '2026-11-11')
    // 450 kg × 52% = 234 kg de carcaça = 15,6 @ × R$ 300 = R$ 4.680
    expect(r.today.arrobas).toBe(15.6)
    expect(r.today.valuePerHead).toBe(468000)
  })
  it('valor de 1 dia a mais e GMD de equilíbrio', () => {
    const r = project({ ...base, lastDate: '2026-11-11' }, '2026-11-11')
    // 0,8 × 0,52 / 15 × 30000 = 832 centavos/dia
    expect(r.dailyGainValue).toBe(832)
    expect(r.waitingPays).toBe(true)
    // 500 × 15 / (0,52 × 30000) = 0,481 kg/dia
    expect(r.breakEvenGmd).toBe(0.481)
  })
  it('ganho líquido de esperar 30 dias', () => {
    const r = project({ ...base, lastDate: '2026-11-11' }, '2026-11-11')
    const d30 = r.points.find((x) => x.days === 30)!
    expect(d30.kg).toBe(474)
    expect(d30.costPerHead).toBe(15000)
    expect(d30.netVsNowPerHead).toBe(d30.valuePerHead - 468000 - 15000)
    expect(d30.netVsNowTotal).toBe(d30.netVsNowPerHead * 100)
  })
  it('esperar não compensa quando o custo diário supera o ganho', () => {
    const r = project({ ...base, dailyCost: 1000, lastDate: '2026-11-11' }, '2026-11-11')
    expect(r.waitingPays).toBe(false)
    expect(r.points.find((x) => x.days === 60)!.netVsNowPerHead).toBeLessThan(0)
  })
  it('dias até o peso-alvo', () => {
    const r = project({ ...base, lastDate: '2026-11-11' }, '2026-11-11')
    expect(r.daysToTarget).toBe(75)
    expect(r.targetDate).toBe('2027-01-25')
    expect(r.targetPoint!.kg).toBe(510)
  })
  it('sem prazo quando o alvo já foi atingido ou o GMD não é positivo', () => {
    expect(project({ ...base, targetKg: 400 }, '2026-11-11').daysToTarget).toBeNull()
    expect(project({ ...base, gmd: 0 }, '2026-11-11').daysToTarget).toBeNull()
  })
  it('@ viva com rendimento 100%', () => {
    const r = project({ ...base, kgPerArroba: 30, carcassYield: 1, lastDate: '2026-11-11' }, '2026-11-11')
    expect(r.today.arrobas).toBe(15)
  })
  it('valida entradas', () => {
    expect(validateProjection(base)).toBeNull()
    expect(validateProjection({ ...base, pricePerArroba: 0 })).toMatch(/arroba/)
    expect(validateProjection({ ...base, carcassYield: 1.2 })).toMatch(/Rendimento/)
    expect(validateProjection({ ...base, gmd: 5 })).toMatch(/GMD/)
  })
})
