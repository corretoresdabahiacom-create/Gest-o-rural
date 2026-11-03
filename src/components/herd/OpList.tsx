import { useEffect, useState, type ReactNode } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { farmCol } from '../../lib/db'
import { useApp } from '../../contexts/AppContext'
import { Card, Empty, Spinner } from '../ui'

/** Lista em tempo real de registros de uma operação (compras, vendas, mortes…), mais recentes primeiro. */
export function useOps<T extends { date: string }>(col: string) {
  const { farm } = useApp()
  const [list, setList] = useState<(T & { id: string })[] | null>(null)
  useEffect(() => onSnapshot(farmCol(farm!.id, col), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }) as T & { id: string }).sort((a, b) => b.date.localeCompare(a.date))), () => setList([])), [farm, col])
  return list
}

export function OpTable<T>({ title, rows, head, render }: { title: string; rows: T[] | null; head: string[]; render: (r: T) => ReactNode }) {
  return (
    <Card title={title}>
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty title="Nenhum registro" /> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[560px]">
          <thead className="border-b border-stone-200 dark:border-stone-800"><tr>{head.map((h, i) => <th key={i} className="th">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-800">{rows.slice(0, 100).map(render)}</tbody>
        </table></div>
      )}
    </Card>
  )
}
