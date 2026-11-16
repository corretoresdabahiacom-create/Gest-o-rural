import { useEffect, useMemo, useState } from 'react'
import { onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { farmCol } from './db'
import type { StockMovement } from './stock'

type St<T> = { data: T[]; loading: boolean; error: string | null }
const init = <T,>(): St<T> => ({ data: [], loading: true, error: null })
const map = (snap: { docs: { id: string; data: () => unknown }[] }) => snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as StockMovement)

/** Movimentações de um período (datas YYYY-MM-DD), em tempo real. */
export function useMovementsByPeriod(farmId: string, start: string, end: string) {
  const [s, setS] = useState<St<StockMovement>>(init)
  useEffect(() => {
    if (!start || !end) return
    setS((x) => ({ ...x, loading: true }))
    const q = query(farmCol(farmId, 'stockMovements'), where('date', '>=', start), where('date', '<=', end), orderBy('date', 'desc'))
    return onSnapshot(q, (snap) => setS({ data: map(snap), loading: false, error: null }), (e) => setS({ data: [], loading: false, error: e.message }))
  }, [farmId, start, end])
  return s
}

/** Todas as movimentações de um item (ordenadas no cliente, sem índice composto). */
export function useMovementsByItem(farmId: string, itemId: string) {
  const [s, setS] = useState<St<StockMovement>>(init)
  useEffect(() => {
    setS((x) => ({ ...x, loading: true }))
    const q = query(farmCol(farmId, 'stockMovements'), where('itemId', '==', itemId))
    return onSnapshot(q, (snap) => setS({
      data: map(snap).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)), loading: false, error: null,
    }), (e) => setS({ data: [], loading: false, error: e.message }))
  }, [farmId, itemId])
  return s
}

/** Ids das movimentações já estornadas (via registros de estorno). */
export function useReversedIds(farmId: string): Set<string> {
  const [ids, setIds] = useState<string[]>([])
  useEffect(() => {
    const q = query(farmCol(farmId, 'stockMovements'), where('type', '==', 'estorno'))
    return onSnapshot(q, (snap) => setIds(snap.docs.map((d) => String((d.data() as { reversesId?: string }).reversesId))), () => setIds([]))
  }, [farmId])
  return useMemo(() => new Set(ids), [ids])
}
