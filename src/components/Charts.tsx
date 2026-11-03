import { money } from '../lib/format'

const PALETTE = ['#2c643d', '#b97f2f', '#5d9a6d', '#8a6b4e', '#3f7f8c', '#a3a35a', '#7d5a8c', '#c25b4a']

export function BarList({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  const total = items.reduce((s, i) => s + i.value, 0)
  return (
    <ul className="space-y-3">
      {items.map((i, idx) => (
        <li key={i.label}>
          <div className="mb-1 flex justify-between gap-2 text-sm">
            <span className="truncate">{i.label}</span>
            <span className="tabular shrink-0 font-medium">{money(i.value)} <span className="text-xs font-normal text-stone-500">{total ? Math.round((i.value / total) * 100) : 0}%</span></span>
          </div>
          <div className="h-2 rounded-full bg-stone-100 dark:bg-stone-800">
            <div className="h-2 rounded-full transition-all" style={{ width: `${(i.value / max) * 100}%`, background: PALETTE[idx % PALETTE.length] }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function MonthBars({ data }: { data: { label: string; labor: number; other: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.labor + d.other))
  return (
    <div>
      <div className="flex h-48 items-end gap-1.5 sm:gap-3" role="img" aria-label="Evolução mensal das despesas">
        {data.map((d) => {
          const t = d.labor + d.other
          return (
            <div key={d.label} className="group relative flex h-full flex-1 flex-col justify-end">
              <div className="pointer-events-none absolute -top-1 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-stone-900 px-2 py-1 text-xs text-white group-hover:block dark:bg-stone-700">
                {money(t)}<br />Mão de obra {money(d.labor)}<br />Outras {money(d.other)}
              </div>
              <div className="w-full rounded-t-sm bg-amber-500/80" style={{ height: `${(d.other / max) * 100}%` }} />
              <div className={`w-full bg-brand-600 ${d.other ? '' : 'rounded-t-sm'}`} style={{ height: `${(d.labor / max) * 100}%` }} />
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex gap-1.5 sm:gap-3">{data.map((d) => <div key={d.label} className="flex-1 text-center text-[11px] text-stone-500">{d.label}</div>)}</div>
      <div className="mt-3 flex gap-4 text-xs text-stone-500">
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-brand-600" />Mão de obra</span>
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-amber-500/80" />Outras despesas</span>
      </div>
    </div>
  )
}
