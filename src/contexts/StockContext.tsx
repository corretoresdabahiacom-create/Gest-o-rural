import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useApp } from './AppContext'
import { useFarmCollection } from '../lib/db'
import type { StockItem } from '../lib/stock'

interface LotRef { id: string; name: string; active: boolean }
interface StockState { items: StockItem[]; lots: LotRef[]; loading: boolean; error: string | null; byId: (id: string) => StockItem | undefined }
const Ctx = createContext<StockState | null>(null)
export const useStock = () => useContext(Ctx)!

export function StockProvider({ children }: { children: ReactNode }) {
  const { farm } = useApp()
  const it = useFarmCollection<StockItem>(farm!.id, 'stockItems')
  const lt = useFarmCollection<LotRef>(farm!.id, 'herdLots')
  const value = useMemo<StockState>(() => {
    const items = [...it.data].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    return { items, lots: [...lt.data].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), loading: it.loading, error: it.error, byId: (id) => items.find((i) => i.id === id) }
  }, [it, lt])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
