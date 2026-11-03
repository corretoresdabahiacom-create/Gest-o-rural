export const TZ = 'America/Bahia'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const num = new Intl.NumberFormat('pt-BR')

/** Centavos -> "R$ 1.234,56" */
export const money = (cents: number) => brl.format((cents || 0) / 100)
export const number = (n: number) => num.format(n)

/** Texto digitado pelo usuário ("1.800,50", "1800.5", "R$ 250") -> centavos. null se inválido. */
export function parseMoney(input: string): number | null {
  let s = input.replace(/[R$\s]/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const cents = Math.round(parseFloat(s) * 100)
  return Number.isFinite(cents) ? cents : null
}

/** Centavos -> "1.800,50" para preencher inputs */
export const centsToInput = (cents: number | null | undefined) =>
  cents == null ? '' : (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Data de hoje (YYYY-MM-DD) no fuso America/Bahia. */
export function today(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** "2026-03-10" -> "10/03/2026" */
export function fmtDate(iso?: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** Diferença em dias entre datas ISO (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000)
}

export function addYears(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const last = new Date(Date.UTC(y + n, m, 0)).getUTCDate()
  return `${y + n}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

export function monthRange(ym: string): [string, string] {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return [`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`]
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`

/** Lista de meses "YYYY-MM" entre duas datas (inclusive). */
export function monthsBetween(start: string, end: string): string[] {
  const out: string[] = []
  let [y, m] = start.slice(0, 7).split('-').map(Number)
  const endYm = end.slice(0, 7)
  for (let i = 0; i < 240; i++) {
    const ym = `${y}-${String(m).padStart(2, '0')}`
    out.push(ym)
    if (ym >= endYm) break
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

export function shiftMonth(ym: string, delta: number): string {
  let [y, m] = ym.split('-').map(Number)
  m += delta
  while (m > 12) { m -= 12; y++ }
  while (m < 1) { m += 12; y-- }
  return `${y}-${String(m).padStart(2, '0')}`
}
