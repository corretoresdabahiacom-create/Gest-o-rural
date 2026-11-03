import { money } from '../lib/format'

const PALETTE = ['#2c643d', '#b97f2f', '#5d9a6d', '#8a6b4e', '#3f7f8c', '#a3a35a', '#7d5a8c', '#c25b4a']

export function BarList({ items, format = money }: { items: { label: string; value: number }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  const total = items.reduce((s, i) => s + i.value, 0)
  return (
    <ul className="space-y-3">
      {items.map((i, idx) => (
        <li key={i.label}>
          <div className="mb-1 flex justify-between gap-2 text-sm">
            <span className="truncate">{i.label}</span>
            <span className="tabular shrink-0 font-medium">{format(i.value)} <span className="text-xs font-normal text-stone-500">{total ? Math.round((i.value / total) * 100) : 0}%</span></span>
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

/** Barras verticais genéricas (uma ou duas séries). */
export function Bars({ data, series, format = (n: number) => n.toLocaleString('pt-BR') }: {
  data: { label: string; values: number[] }[]; series: { name: string; color: string }[]; format?: (n: number) => string
}) {
  const max = Math.max(1, ...data.flatMap((d) => d.values.map(Math.abs)))
  return (
    <div>
      <div className="flex h-44 items-end gap-1.5 sm:gap-3">
        {data.map((d) => (
          <div key={d.label} className="group relative flex h-full flex-1 items-end justify-center gap-0.5">
            <div className="pointer-events-none absolute -top-1 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-stone-900 px-2 py-1 text-xs text-white group-hover:block dark:bg-stone-700">
              {series.map((s, i) => <div key={s.name}>{s.name}: {format(d.values[i] ?? 0)}</div>)}
            </div>
            {d.values.map((v, i) => <div key={i} className="w-full max-w-8 rounded-t-sm" style={{ height: `${(Math.abs(v) / max) * 100}%`, background: series[i]?.color }} />)}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5 sm:gap-3">{data.map((d) => <div key={d.label} className="flex-1 truncate text-center text-[11px] text-stone-500">{d.label}</div>)}</div>
      {series.length > 1 && <div className="mt-3 flex gap-4 text-xs text-stone-500">{series.map((s) => <span key={s.name} className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm" style={{ background: s.color }} />{s.name}</span>)}</div>}
    </div>
  )
}

/** Linha simples em SVG (evolução), com pontos e rótulos. */
export function LineChart({ points, format = (n: number) => n.toLocaleString('pt-BR') }: { points: { label: string; value: number | null }[]; format?: (n: number) => string }) {
  const vals = points.map((p) => p.value).filter((v): v is number => v != null)
  if (!vals.length) return <p className="py-10 text-center text-sm text-stone-500">Sem dados no período.</p>
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1
  const W = 600, H = 180, pad = 24
  const x = (i: number) => pad + (points.length === 1 ? (W - 2 * pad) / 2 : (i * (W - 2 * pad)) / (points.length - 1))
  const y = (v: number) => H - pad - ((v - min) / span) * (H - 2 * pad)
  const pts = points.map((p, i) => (p.value == null ? null : [x(i), y(p.value)] as const)).filter(Boolean) as (readonly [number, number])[]
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" role="img" aria-label="Gráfico de evolução">
      <polyline fill="none" stroke="var(--color-brand-600)" strokeWidth="2.5" points={pts.map((p) => p.join(',')).join(' ')} />
      {points.map((p, i) => p.value == null ? null : (
        <g key={i}><circle cx={x(i)} cy={y(p.value)} r="3.5" fill="var(--color-brand-600)" /><title>{`${p.label}: ${format(p.value)}`}</title>
          {(points.length <= 12 || i % Math.ceil(points.length / 12) === 0) && <text x={x(i)} y={y(p.value) - 8} textAnchor="middle" fontSize="11" fill="currentColor" opacity=".7">{format(p.value)}</text>}</g>
      ))}
      {points.map((p, i) => (points.length <= 12 || i % Math.ceil(points.length / 12) === 0) && <text key={'l' + i} x={x(i)} y={H + 12} textAnchor="middle" fontSize="11" fill="currentColor" opacity=".55">{p.label}</text>)}
    </svg>
  )
}
