// Projeção de venda por lote: quanto o lote vale hoje, quanto valerá esperando e se compensa esperar.
// Hipóteses explícitas na tela: GMD constante (na prática ele cai perto do acabamento) e preço da arroba constante.

export interface ProjectionInput {
  /** peso médio na última pesagem (kg/cabeça) */
  lastKg: number
  lastDate: string
  /** ganho médio diário (kg/dia) */
  gmd: number
  heads: number
  /** preço por arroba, em centavos */
  pricePerArroba: number
  /** kg por arroba: 30 para @ viva, 15 para @ de carcaça */
  kgPerArroba: number
  /** rendimento de carcaça (0–1). Use 1 para @ viva. */
  carcassYield: number
  /** custo diário por cabeça (pasto, ração, sal, mão de obra…), em centavos */
  dailyCost: number
  /** peso-alvo de venda (kg/cabeça), opcional */
  targetKg?: number | null
}

export interface ProjectionPoint {
  days: number
  date: string
  kg: number
  arrobas: number
  valuePerHead: number
  costPerHead: number
  /** ganho líquido por cabeça em relação a vender hoje (valor a mais − custo acumulado) */
  netVsNowPerHead: number
  netVsNowTotal: number
}

export interface Projection {
  today: ProjectionPoint
  points: ProjectionPoint[]
  /** valor de 1 dia a mais de engorda, por cabeça (centavos) */
  dailyGainValue: number
  /** GMD mínimo para que esperar se pague (kg/dia) */
  breakEvenGmd: number | null
  /** esperar compensa? (ganho diário em valor > custo diário) */
  waitingPays: boolean
  /** dias até o peso-alvo e data prevista (null sem alvo, já atingido ou GMD ≤ 0) */
  daysToTarget: number | null
  targetDate: string | null
  targetPoint: ProjectionPoint | null
  /** dias desde a última pesagem até hoje (o peso de hoje é estimado) */
  daysSinceWeighing: number
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000)

export function validateProjection(p: ProjectionInput): string | null {
  if (!(p.lastKg > 0)) return 'Peso médio inválido.'
  if (!Number.isFinite(p.gmd) || p.gmd < -2 || p.gmd > 3) return 'GMD deve estar entre −2 e 3 kg/dia.'
  if (!(p.heads > 0)) return 'Quantidade de cabeças inválida.'
  if (!(p.pricePerArroba > 0)) return 'Informe o preço da arroba.'
  if (!(p.kgPerArroba > 0)) return 'Kg por arroba inválido.'
  if (!(p.carcassYield > 0 && p.carcassYield <= 1)) return 'Rendimento de carcaça deve estar entre 1% e 100%.'
  if (!(p.dailyCost >= 0)) return 'Custo diário inválido.'
  return null
}

export function project(p: ProjectionInput, todayIso: string, horizons = [0, 30, 60, 90, 120]): Projection {
  const since = Math.max(0, dayDiff(p.lastDate, todayIso))
  const kgToday = p.lastKg + p.gmd * since
  const point = (days: number): ProjectionPoint => {
    const kg = Math.round((kgToday + p.gmd * days) * 10) / 10
    const arrobas = Math.round(((kg * p.carcassYield) / p.kgPerArroba) * 100) / 100
    const valuePerHead = Math.round(((kg * p.carcassYield) / p.kgPerArroba) * p.pricePerArroba)
    const costPerHead = Math.round(p.dailyCost * days)
    return { days, date: addDays(todayIso, days), kg, arrobas, valuePerHead, costPerHead, netVsNowPerHead: 0, netVsNowTotal: 0 }
  }
  const t0 = point(0)
  const withNet = (x: ProjectionPoint) => {
    const net = x.valuePerHead - t0.valuePerHead - x.costPerHead
    return { ...x, netVsNowPerHead: net, netVsNowTotal: net * p.heads }
  }
  const dailyGainValue = Math.round(((p.gmd * p.carcassYield) / p.kgPerArroba) * p.pricePerArroba)
  const breakEvenGmd = p.pricePerArroba > 0 ? Math.round(((p.dailyCost * p.kgPerArroba) / (p.carcassYield * p.pricePerArroba)) * 1000) / 1000 : null
  let daysToTarget: number | null = null
  if (p.targetKg && p.targetKg > kgToday && p.gmd > 0) daysToTarget = Math.ceil((p.targetKg - kgToday) / p.gmd)
  return {
    today: withNet(t0),
    points: horizons.map((d) => withNet(point(d))),
    dailyGainValue,
    breakEvenGmd,
    waitingPays: dailyGainValue > p.dailyCost,
    daysToTarget,
    targetDate: daysToTarget != null ? addDays(todayIso, daysToTarget) : null,
    targetPoint: daysToTarget != null ? withNet(point(daysToTarget)) : null,
    daysSinceWeighing: since,
  }
}
