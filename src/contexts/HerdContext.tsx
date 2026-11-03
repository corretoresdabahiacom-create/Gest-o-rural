import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { useApp } from './AppContext'
import { useFarmCollection } from '../lib/db'
import { DEFAULT_ARROBA, parseKey, SEX_LABEL, type Animal, type HerdLot, type Vaccination } from '../lib/herd'
import type { Named } from '../lib/types'

interface HerdState {
  lots: HerdLot[]
  activeLots: HerdLot[]
  animals: Animal[]
  categories: Named[]
  vaccinations: Vaccination[]
  ready: boolean
  catName: (id?: string) => string
  lotName: (id?: string) => string
  keyLabel: (key: string) => string
  /** Animais individualmente identificados e ativos no lote (opcionalmente numa chave). */
  identified: (lotId: string, key?: string) => Animal[]
  arroba: { vivo: number; carcaca: number; outra: number; outraLabel: string }
}
const Ctx = createContext<HerdState | null>(null)
export const useHerd = () => useContext(Ctx)!

export function HerdProvider({ children }: { children: ReactNode }) {
  const { farm } = useApp()
  const lots = useFarmCollection<HerdLot>(farm!.id, 'herdLots')
  const animals = useFarmCollection<Animal>(farm!.id, 'animals')
  const cats = useFarmCollection<Named>(farm!.id, 'animalCategories')
  const vacc = useFarmCollection<Vaccination>(farm!.id, 'vaccinations')

  const catMap = useMemo(() => new Map(cats.data.map((c) => [c.id, c.name])), [cats.data])
  const lotMap = useMemo(() => new Map(lots.data.map((l) => [l.id, l.name])), [lots.data])
  const catName = useCallback((id?: string) => (id ? catMap.get(id) ?? '—' : '—'), [catMap])
  const lotName = useCallback((id?: string) => (id ? lotMap.get(id) ?? '—' : '—'), [lotMap])
  const keyLabel = useCallback((k: string) => { const { categoryId, sex } = parseKey(k); return `${catName(categoryId)} · ${SEX_LABEL[sex] ?? sex}` }, [catName])
  const identified = useCallback((lotId: string, key?: string) => animals.data.filter((a) => a.status === 'ativo' && a.lotId === lotId &&
    (!key || `${a.categoryId}|${a.sex}` === key)), [animals.data])
  const a = (farm as unknown as { arroba?: Partial<HerdState['arroba']> }).arroba ?? {}

  const value = useMemo<HerdState>(() => ({
    lots: [...lots.data].sort((x, y) => x.name.localeCompare(y.name, 'pt-BR')),
    activeLots: lots.data.filter((l) => l.active).sort((x, y) => x.name.localeCompare(y.name, 'pt-BR')),
    animals: animals.data,
    categories: [...cats.data].sort((x, y) => x.name.localeCompare(y.name, 'pt-BR')),
    vaccinations: vacc.data,
    ready: !lots.loading && !animals.loading && !cats.loading && !vacc.loading,
    catName, lotName, keyLabel, identified,
    arroba: { vivo: a.vivo ?? DEFAULT_ARROBA.vivo, carcaca: a.carcaca ?? DEFAULT_ARROBA.carcaca, outra: a.outra ?? DEFAULT_ARROBA.outra, outraLabel: a.outraLabel ?? 'Outra unidade' },
  }), [lots, animals, cats, vacc, catName, lotName, keyLabel, identified, a.vivo, a.carcaca, a.outra, a.outraLabel])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
