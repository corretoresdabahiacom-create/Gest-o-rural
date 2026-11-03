import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useApp } from '../../contexts/AppContext'
import { friendlyError } from '../../lib/db'
import { fetchMovements } from '../../lib/herdDb'
import { fetchSessions, fetchWeighings } from '../../lib/weighingDb'
import type { HerdMovement } from '../../lib/herd'
import type { Weighing, WeighingSession } from '../../lib/weighing'

interface WeighState { sessions: WeighingSession[]; weighings: Weighing[]; active: Weighing[]; movs: HerdMovement[]; ready: boolean; error: string; reload: () => void }
const Ctx = createContext<WeighState | null>(null)
export const useWeigh = () => useContext(Ctx)!

export function WeighProvider({ children }: { children: ReactNode }) {
  const { farm } = useApp()
  const [s, setS] = useState<Omit<WeighState, 'reload' | 'active'>>({ sessions: [], weighings: [], movs: [], ready: false, error: '' })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    Promise.all([fetchSessions(farm!.id), fetchWeighings(farm!.id), fetchMovements(farm!.id)])
      .then(([sessions, weighings, movs]) => setS({ sessions, weighings: weighings.sort((a, b) => a.date.localeCompare(b.date)), movs, ready: true, error: '' }))
      .catch((e) => setS((x) => ({ ...x, ready: true, error: friendlyError(e) })))
  }, [farm, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return <Ctx.Provider value={{ ...s, active: s.weighings.filter((w) => !w.supersededBy), reload }}>{children}</Ctx.Provider>
}
