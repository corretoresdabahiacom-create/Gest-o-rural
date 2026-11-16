import { Link } from 'react-router-dom'
import { money } from '../../lib/format'
import { avgCostCents, categoryLabel, fmtQty, STATUS_LABEL, stockStatus, type StockItem } from '../../lib/stock'
import { Badge, Empty } from '../ui'

export function ItemTable({ items, showCategory }: { items: StockItem[]; showCategory?: boolean }) {
  if (!items.length) return <Empty title="Nenhum item" text="Cadastre os itens para começar a controlar o estoque." />
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-stone-200 dark:border-stone-800">
          <tr><th className="th">Item</th>{showCategory && <th className="th">Categoria</th>}<th className="th text-right">Saldo</th><th className="th text-right">Mínimo</th><th className="th text-right">Custo médio</th><th className="th text-right">Valor</th><th className="th">Situação</th></tr>
        </thead>
        <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
          {items.map((i) => {
            const st = stockStatus(i)
            return (
              <tr key={i.id} className={i.active ? '' : 'opacity-60'}>
                <td className="td"><Link className="font-medium text-brand-700 hover:underline dark:text-brand-300" to={`/estoque/item/${i.id}`}>{i.name}</Link>{!i.active && <span className="ml-2 text-xs text-stone-500">(inativo)</span>}</td>
                {showCategory && <td className="td">{categoryLabel(i.category)}</td>}
                <td className="td tabular text-right">{fmtQty(i.qtyMilli, i.unit)}</td>
                <td className="td tabular text-right">{i.minMilli ? fmtQty(i.minMilli, i.unit) : '—'}</td>
                <td className="td tabular text-right">{i.qtyMilli > 0 ? money(Math.round(avgCostCents(i))) : '—'}</td>
                <td className="td tabular text-right">{money(i.valueCents)}</td>
                <td className="td"><Badge tone={st === 'ok' ? 'green' : st === 'baixo' ? 'amber' : 'red'}>{STATUS_LABEL[st]}</Badge></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
