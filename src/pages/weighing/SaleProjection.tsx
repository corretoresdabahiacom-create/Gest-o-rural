import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Info, TrendingDown, TrendingUp } from 'lucide-react'
import { useHerd } from '../../contexts/HerdContext'
import { fmtDate, money, number, parseMoney, today } from '../../lib/format'
import { project, validateProjection } from '../../lib/projection'
import { Card, Empty, ErrorBox, Field, Stat, cx } from '../../components/ui'
import { useWeigh } from './WeighContext'
import { lotAssessment } from './LotEvolution'

const dec = (s: string) => { const t = s.trim(); if (!t) return NaN; return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t) }
const str = (n: number | null | undefined, digits = 3) => (n == null || !Number.isFinite(n) ? '' : String(Math.round(n * 10 ** digits) / 10 ** digits).replace('.', ','))
const KEY = 'ag-projecao'

/** Ponto de venda: valor hoje × valor esperando, com o GMD real do lote e o custo diário informado. */
export default function SaleProjection() {
  const { activeLots, arroba } = useHerd()
  const { active, movs } = useWeigh()
  const t = today()
  const lots = useMemo(() => activeLots.filter((l) => l.count > 0 && active.some((w) => w.lotId === l.id)), [activeLots, active])
  const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} } })()
  const [lotId, setLotId] = useState<string>('')
  const [f, setF] = useState({ gmd: '', price: saved.price ?? '', unit: (saved.unit as 'carcaca' | 'vivo') ?? 'carcaca', yieldPct: saved.yieldPct ?? '52', cost: saved.cost ?? '', target: '' })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  const lot = lots.find((l) => l.id === lotId) ?? lots[0]
  const assess = useMemo(() => (lot ? lotAssessment(lot.id, active, movs) : null), [lot, active, movs])
  // Ao trocar de lote, sugere o GMD validado do lote (editável).
  useEffect(() => { setF((x) => ({ ...x, gmd: assess?.gmd != null ? str(assess.gmd) : '' })) }, [assess?.gmd, lot?.id])
  // Preço, unidade, rendimento e custo ficam lembrados neste aparelho.
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify({ price: f.price, unit: f.unit, yieldPct: f.yieldPct, cost: f.cost })) } catch { /* ignore */ } }, [f.price, f.unit, f.yieldPct, f.cost])

  if (!lots.length) return <Empty title="Nenhum lote com pesagem" text="Registre ao menos uma pesagem de um lote ativo para projetar a venda." />
  if (!lot || !assess) return null

  const input = {
    lastKg: assess.last.avgKg, lastDate: assess.last.date, gmd: dec(f.gmd), heads: lot.count,
    pricePerArroba: parseMoney(f.price) ?? 0, kgPerArroba: f.unit === 'carcaca' ? arroba.carcaca : arroba.vivo,
    carcassYield: f.unit === 'carcaca' ? dec(f.yieldPct) / 100 : 1, dailyCost: f.cost.trim() ? parseMoney(f.cost) ?? -1 : 0,
    targetKg: f.target.trim() ? dec(f.target) : null,
  }
  const err = validateProjection(input)
  const r = err ? null : project(input, t)

  return (
    <div className="space-y-5">
      <Card>
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Lote"><select className="input" value={lot.id} onChange={(e) => setLotId(e.target.value)}>{lots.map((l) => <option key={l.id} value={l.id}>{l.name} — {l.count} cab.</option>)}</select></Field>
          <Field label="GMD (kg/dia) *" hint={assess.gmd != null ? `Do lote: ${str(assess.gmd)} kg/dia. ${assess.note}` : `Sem GMD válido do lote: ${assess.note || 'só há uma pesagem'}. Informe uma estimativa.`}>
            <input className="input" inputMode="decimal" value={f.gmd} onChange={set('gmd')} placeholder="Ex.: 0,7" /></Field>
          <Field label="Preço da arroba (R$) *"><input className="input" inputMode="decimal" value={f.price} onChange={set('price')} placeholder="Ex.: 310,00" /></Field>
          <Field label="Arroba"><select className="input" value={f.unit} onChange={set('unit')}>
            <option value="carcaca">@ de carcaça ({number(arroba.carcaca)} kg)</option><option value="vivo">@ de peso vivo ({number(arroba.vivo)} kg)</option></select></Field>
          {f.unit === 'carcaca' && <Field label="Rendimento de carcaça (%)" hint="Ajuste ao histórico de abate do seu gado."><input className="input" inputMode="decimal" value={f.yieldPct} onChange={set('yieldPct')} /></Field>}
          <Field label="Custo diário por cabeça (R$)" hint="Pasto, ração, sal, sanidade e mão de obra, por dia."><input className="input" inputMode="decimal" value={f.cost} onChange={set('cost')} placeholder="Ex.: 6,50" /></Field>
          <Field label="Peso-alvo de venda (kg/cabeça)"><input className="input" inputMode="decimal" value={f.target} onChange={set('target')} placeholder="Ex.: 540" /></Field>
        </div>
        <p className="border-t border-stone-200 px-4 py-2 text-xs text-stone-500 dark:border-stone-800">
          Última pesagem: {number(assess.last.avgKg)} kg/cab. em {fmtDate(assess.last.date)}{r && r.daysSinceWeighing > 0 ? ` · peso de hoje estimado em ${number(r.today.kg)} kg (${r.daysSinceWeighing} dias depois)` : ''}.
        </p>
      </Card>

      {err && <ErrorBox>{err}</ErrorBox>}
      {r && (
        <>
          <div className={cx('flex items-start gap-3 rounded-lg p-4 text-sm', r.waitingPays ? 'bg-brand-50 text-brand-900 dark:bg-brand-900/30 dark:text-brand-100' : 'bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100')}>
            {r.waitingPays ? <TrendingUp className="mt-0.5 size-5 shrink-0" /> : <TrendingDown className="mt-0.5 size-5 shrink-0" />}
            <div>
              <b>{r.waitingPays ? 'Esperar ainda compensa.' : 'Esperar não compensa: o custo diário supera o ganho de peso.'}</b>{' '}
              Cada dia a mais rende {money(r.dailyGainValue)} por cabeça em peso e custa {money(input.dailyCost)}.
              {r.breakEvenGmd != null && input.dailyCost > 0 && <> Para valer a pena, o GMD precisa ficar acima de <b>{str(r.breakEvenGmd)} kg/dia</b>.</>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Valor hoje (lote)" value={money(r.today.valuePerHead * lot.count)} sub={`${money(r.today.valuePerHead)}/cab. · ${number(r.today.arrobas)} @`} icon={<TrendingUp className="size-4" />} />
            <Stat label="Peso estimado hoje" value={`${number(r.today.kg)} kg`} sub="por cabeça" icon={<Info className="size-4" />} tone="stone" />
            <Stat label="Peso-alvo" value={r.targetDate ? fmtDate(r.targetDate) : '—'} sub={r.daysToTarget != null ? `em ${r.daysToTarget} dias` : input.targetKg ? 'já atingido ou GMD ≤ 0' : 'informe o peso-alvo'} icon={<CalendarClock className="size-4" />} tone="earth" />
            <Stat label="Resultado no peso-alvo" value={r.targetPoint ? money(r.targetPoint.netVsNowTotal) : '—'} sub="a mais que vender hoje, já descontado o custo" icon={<TrendingUp className="size-4" />} tone={r.targetPoint && r.targetPoint.netVsNowTotal < 0 ? 'earth' : 'brand'} />
          </div>
          <Card title="Vender hoje ou esperar">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="border-b border-stone-200 dark:border-stone-800"><tr>
                  <th className="th">Venda em</th><th className="th text-right">Peso/cab.</th><th className="th text-right">@/cab.</th><th className="th text-right">Valor/cab.</th><th className="th text-right">Custo acumulado/cab.</th><th className="th text-right">A mais que hoje (lote)</th>
                </tr></thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {[...r.points, ...(r.targetPoint && !r.points.some((p) => p.days === r.targetPoint!.days) ? [r.targetPoint] : [])].sort((a, b) => a.days - b.days).map((p) => (
                    <tr key={p.days} className={p === r.targetPoint ? 'bg-brand-50/60 dark:bg-brand-900/20' : ''}>
                      <td className="td">{p.days === 0 ? 'Hoje' : `${fmtDate(p.date)} (+${p.days} d)`}{p === r.targetPoint && <span className="ml-2 text-xs text-brand-700 dark:text-brand-300">peso-alvo</span>}</td>
                      <td className="td tabular text-right">{number(p.kg)} kg</td>
                      <td className="td tabular text-right">{number(p.arrobas)}</td>
                      <td className="td tabular text-right">{money(p.valuePerHead)}</td>
                      <td className="td tabular text-right">{money(p.costPerHead)}</td>
                      <td className={cx('td tabular text-right font-medium', p.netVsNowTotal < 0 && 'text-red-700 dark:text-red-400')}>{p.days === 0 ? '—' : money(p.netVsNowTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="text-xs text-stone-500">Estimativa com GMD e preço constantes. Na prática o GMD costuma cair perto do acabamento e o preço varia: refaça a conta a cada pesagem. Não substitui a análise de um técnico.</p>
        </>
      )}
    </div>
  )
}
