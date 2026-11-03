import { describe, expect, it } from 'vitest'
import { addYears, fmtDate, money, monthsBetween, parseMoney, today } from '../format'
import { alertMilestone, nextOccurrence, obligationAlerts, obligationState } from '../domain'
import { laborTotals, otherTotal, validateSheet, type LaborRow, type OtherRow } from '../sheet'
import { buildReport, filterEntries, type Filters } from '../reports'
import { toCsv } from '../export'
import type { Collaborator, ExpenseEntry, Named, Obligation } from '../types'

const nbsp = (s: string) => s.replace(/ /g, ' ')

describe('formatação brasileira', () => {
  it('moeda em R$', () => expect(nbsp(money(180050))).toBe('R$ 1.800,50'))
  it('datas DD/MM/AAAA', () => expect(fmtDate('2026-03-10')).toBe('10/03/2026'))
  it('interpreta valores digitados', () => {
    expect(parseMoney('1.800,50')).toBe(180050)
    expect(parseMoney('R$ 250')).toBe(25000)
    expect(parseMoney('1800.5')).toBe(180050)
    expect(parseMoney('1.800')).toBe(180000)
    expect(parseMoney('120,00')).toBe(12000)
    expect(parseMoney('abc')).toBeNull()
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('1,234,5')).toBeNull()
  })
  it('data de hoje no fuso America/Bahia', () => {
    // 02:00 UTC de 1/1 ainda é 31/12 na Bahia (UTC-3)
    expect(today(new Date('2026-01-01T02:00:00Z'))).toBe('2025-12-31')
  })
  it('anos e meses', () => {
    expect(addYears('2024-02-29', 1)).toBe('2025-02-28')
    expect(monthsBetween('2026-11-15', '2027-02-01')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
  })
})

const types: Named[] = [{ id: 'vaq', name: 'Vaqueiro', active: true }, { id: 'tra', name: 'Tratorista', active: true }, { id: 'dia', name: 'Diarista', active: true }, { id: 'lar', name: 'Diarista do lar', active: true }]
const cats: Named[] = [{ id: 'comb', name: 'Combustível', active: true }, { id: 'ali', name: 'Alimentação', active: true }, { id: 'man', name: 'Manutenção', active: true }]
const col = (id: string, name: string, laborTypeId: string, active = true): Collaborator => ({ id, name, laborTypeId, bond: 'clt', active })
const cols = [col('joao', 'João', 'vaq'), col('pedro', 'Pedro', 'tra'), col('maria', 'Maria', 'dia'), col('ana', 'Ana', 'lar'), col('ze', 'Zé', 'vaq', false)]
const L = (laborTypeId: string, collaboratorId: string, amount: string, date = '2026-11-03'): LaborRow => ({ key: collaboratorId + amount, date, laborTypeId, collaboratorId, amount, note: '' })
const O = (categoryId: string, description: string, amount: string): OtherRow => ({ key: description, date: '2026-11-03', categoryId, description, amount })

describe('planilha de lançamentos', () => {
  const labor = [L('vaq', 'joao', '1.800,00'), L('tra', 'pedro', '250'), L('dia', 'maria', '120'), L('lar', 'ana', '150,00')]
  const other = [O('comb', 'Diesel trator', '500'), O('ali', 'Compra mensal', '300'), O('man', 'Peças do trator', '450')]

  it('totaliza por colaborador e geral (exemplo da especificação)', () => {
    const t = laborTotals(labor, cols)
    expect(t.total).toBe(232000)
    expect(t.perCollaborator.find((p) => p.name === 'João')?.total).toBe(180000)
    expect(otherTotal(other)).toBe(125000)
    expect(t.total + otherTotal(other)).toBe(357000)
  })
  it('soma várias linhas do mesmo colaborador', () => {
    expect(laborTotals([L('vaq', 'joao', '100'), { ...L('vaq', 'joao', '50'), key: 'x' }], cols).perCollaborator).toEqual([{ id: 'joao', name: 'João', total: 15000 }])
  })
  it('valida e converte linhas, ignorando linhas vazias', () => {
    const blank: LaborRow = { key: 'b', date: '2026-11-03', laborTypeId: '', collaboratorId: '', amount: '', note: '' }
    const v = validateSheet([...labor, blank], other, types, cats, cols)
    expect(v.errors).toEqual({})
    expect(v.labor).toHaveLength(4)
    expect(v.other[0]).toMatchObject({ categoryName: 'Combustível', amount: 50000 })
  })
  it('rejeita valor inválido, colaborador de outro tipo e inativo', () => {
    const v = validateSheet([L('vaq', 'joao', '0'), L('tra', 'joao', '10'), L('vaq', 'ze', '10'), L('', '', '10')], [O('', 'x', '-5')], types, cats, cols)
    expect(v.errors['joao0'].amount).toBeTruthy()
    expect(v.errors['joao10'].collaboratorId).toMatch(/não pertence/)
    expect(v.errors['ze10'].collaboratorId).toMatch(/inativo/)
    expect(v.errors['10'].laborTypeId).toBeTruthy()
    expect(v.errors['x'].categoryId).toBeTruthy()
    expect(v.labor).toHaveLength(0)
  })
})

const obl = (p: Partial<Obligation>): Obligation => ({ id: 'o', type: 'ferias', collaboratorId: 'joao', collaboratorName: 'João', dueDate: '2026-12-01', status: 'pendente', recurrence: 'yearly', ...p })

describe('obrigações e lembretes', () => {
  const t = '2026-11-03'
  it('status vencido é derivado da data', () => {
    expect(obligationState(obl({ dueDate: '2026-11-02' }), t)).toBe('vencido')
    expect(obligationState(obl({ dueDate: '2026-11-03' }), t)).toBe('pendente')
    expect(obligationState(obl({ dueDate: '2026-01-01', status: 'pago', paidDate: '2026-01-01' }), t)).toBe('pago')
  })
  it('alertas 30/15/7/0 e vencidas', () => {
    const list = [obl({ id: 'a', dueDate: '2026-12-10' }), obl({ id: 'b', dueDate: '2026-11-20' }), obl({ id: 'c', dueDate: t }), obl({ id: 'd', dueDate: '2026-10-01' }), obl({ id: 'e', dueDate: '2026-11-04', status: 'pago' })]
    const a = obligationAlerts(list, t, [30, 15, 7, 0])
    expect(a.map((x) => x.obligation.id)).toEqual(['d', 'c', 'b'])
    expect(a.map((x) => x.level)).toEqual(['overdue', 'today', 'soon'])
    expect(alertMilestone(17, [30, 15, 7, 0])).toBe(30)
    expect(alertMilestone(12, [30, 15, 7, 0])).toBe(15)
    expect(alertMilestone(0, [30, 15, 7, 0])).toBe(0)
  })
  it('prazos personalizados', () => {
    expect(obligationAlerts([obl({ dueDate: '2026-12-20' })], t, [60])).toHaveLength(1)
    expect(obligationAlerts([obl({ dueDate: '2026-12-20' })], t, [30, 7])).toHaveLength(0)
  })
  it('próxima ocorrência anual fica pendente, sem marcar como paga', () => {
    const n = nextOccurrence(obl({ referencePeriod: '2026', status: 'pago', paidDate: '2026-12-01', amount: 200000 }))
    expect(n).toMatchObject({ dueDate: '2027-12-01', referencePeriod: '2027', status: 'pendente', paidDate: null, amount: 200000 })
  })
})

describe('relatórios', () => {
  const e = (p: Partial<ExpenseEntry>): ExpenseEntry => ({ id: Math.random().toString(), kind: 'labor', date: '2026-11-03', amount: 1000, ...p })
  const entries = [
    e({ collaboratorId: 'joao', collaboratorName: 'João', laborTypeId: 'vaq', laborTypeName: 'Vaqueiro', amount: 180000 }),
    e({ collaboratorId: 'joao', collaboratorName: 'João', laborTypeId: 'vaq', laborTypeName: 'Vaqueiro', amount: 20000, date: '2026-10-15' }),
    e({ collaboratorId: 'pedro', collaboratorName: 'Pedro', laborTypeId: 'tra', laborTypeName: 'Tratorista', amount: 25000 }),
    e({ kind: 'other', categoryId: 'comb', categoryName: 'Combustível', amount: 50000 }),
    e({ kind: 'other', categoryId: 'comb', categoryName: 'Combustível', amount: 9999, date: '2026-12-01' }),
  ]
  const f: Filters = { start: '2026-11-01', end: '2026-11-30', collaboratorId: '', laborTypeId: '', expenseType: '' }
  const lt = (id: string) => ({ joao: 'vaq', pedro: 'tra' })[id]

  it('respeita período e filtros', () => {
    expect(filterEntries(entries, f)).toHaveLength(3)
    expect(filterEntries(entries, { ...f, collaboratorId: 'joao' })).toHaveLength(1)
    expect(filterEntries(entries, { ...f, expenseType: 'comb' })).toHaveLength(1)
    expect(filterEntries(entries, { ...f, expenseType: 'labor' })).toHaveLength(2)
    expect(filterEntries(entries, { ...f, laborTypeId: 'tra' })).toHaveLength(1)
  })
  it('pagamentos por colaborador com totais', () => {
    const r = buildReport('colaborador', { ...f, start: '2026-10-01' }, entries, [], '2026-11-03', lt)
    expect(r.rows[0]).toMatchObject({ nome: 'João', qtd: 2, valor: 200000 })
    expect(r.totals?.valor).toBe(225000)
  })
  it('categoria inclui mão de obra e percentuais', () => {
    const r = buildReport('categoria', f, entries, [], '2026-11-03', lt)
    expect(r.rows.map((x) => x.nome)).toEqual(['Mão de obra', 'Combustível'])
    expect(r.totals?.valor).toBe(255000)
  })
  it('resumo mensal e comparativo', () => {
    const m = buildReport('mensal', { ...f, start: '2026-10-01', end: '2026-12-31' }, entries, [], '2026-11-03', lt)
    expect(m.rows.map((x) => x.total)).toEqual([20000, 255000, 9999])
    const c = buildReport('comparativo', { ...f, compareStart: '2026-10-01', compareEnd: '2026-10-31' }, entries, [], '2026-11-03', lt, entries)
    expect(c.totals).toMatchObject({ a: 255000, b: 20000, diff: -235000 })
  })
  it('histórico de férias e 13º filtra tipo e colaborador', () => {
    const obls = [obl({ id: '1', paidDate: '2026-11-10', status: 'pago', amount: 200000 }), obl({ id: '2', type: 'decimo_1', dueDate: '2026-11-30' }), obl({ id: '3', collaboratorId: 'pedro', collaboratorName: 'Pedro', dueDate: '2026-11-15' })]
    expect(buildReport('ferias', f, [], obls, '2026-11-03', lt).rows).toHaveLength(2)
    expect(buildReport('ferias', { ...f, collaboratorId: 'joao' }, [], obls, '2026-11-03', lt).totals?.valor).toBe(200000)
    expect(buildReport('decimo', f, [], obls, '2026-11-03', lt).rows).toHaveLength(1)
    expect(buildReport('pendentes', f, [], obls, '2026-11-03', lt).rows).toHaveLength(2)
    expect(buildReport('pagas', f, [], obls, '2026-11-03', lt).rows).toHaveLength(1)
  })
  it('CSV no padrão brasileiro', () => {
    const csv = toCsv(buildReport('tipo', f, entries, [], '2026-11-03', lt))
    expect(csv.split('\r\n')[0]).toBe('Tipo de mão de obra;Pagamentos;Total')
    expect(csv).toContain('Vaqueiro;1;1800,00')
    expect(csv).toContain('TOTAL;2;2050,00')
  })
})
