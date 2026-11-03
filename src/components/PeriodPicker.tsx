import { ChevronLeft, ChevronRight } from 'lucide-react'
import { monthRange, shiftMonth } from '../lib/format'

export interface Period { mode: 'month' | 'range'; month: string; start: string; end: string }
export const periodFromMonth = (month: string): Period => { const [start, end] = monthRange(month); return { mode: 'month', month, start, end } }

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className="input w-auto" value={value.mode} aria-label="Tipo de período"
        onChange={(e) => onChange(e.target.value === 'month' ? periodFromMonth(value.month) : { ...value, mode: 'range' })}>
        <option value="month">Mês</option>
        <option value="range">Intervalo</option>
      </select>
      {value.mode === 'month' ? (
        <div className="flex items-center gap-1">
          <button className="rounded-lg border border-stone-300 p-2 dark:border-stone-700" onClick={() => onChange(periodFromMonth(shiftMonth(value.month, -1)))} aria-label="Mês anterior"><ChevronLeft className="size-4" /></button>
          <input type="month" className="input w-auto" value={value.month} onChange={(e) => e.target.value && onChange(periodFromMonth(e.target.value))} aria-label="Mês" />
          <button className="rounded-lg border border-stone-300 p-2 dark:border-stone-700" onClick={() => onChange(periodFromMonth(shiftMonth(value.month, 1)))} aria-label="Próximo mês"><ChevronRight className="size-4" /></button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <input type="date" className="input w-auto" value={value.start} onChange={(e) => onChange({ ...value, start: e.target.value })} aria-label="Data inicial" />
          <span className="text-stone-400">até</span>
          <input type="date" className="input w-auto" value={value.end} onChange={(e) => onChange({ ...value, end: e.target.value })} aria-label="Data final" />
        </div>
      )}
    </div>
  )
}
