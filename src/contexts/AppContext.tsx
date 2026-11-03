import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { collection, collectionGroup, doc, getDoc, onSnapshot, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { addLog, farmDoc, newId, useFarmCollection } from '../lib/db'
import { DEFAULT_ANIMAL_CATEGORIES, DEFAULT_ARROBA } from '../lib/herd'
import {
  DEFAULT_ALERT_DAYS, DEFAULT_CATEGORIES, DEFAULT_LABOR_TYPES,
  type Collaborator, type Farm, type Invite, type Named, type Obligation, type Role,
} from '../lib/types'

interface FarmRef { id: string; name: string; role: Role }
interface AppState {
  user: User | null
  authReady: boolean
  farms: FarmRef[]
  farmsReady: boolean
  invites: Invite[]
  farm: Farm | null
  role: Role | null
  canEdit: boolean
  laborTypes: Named[]
  categories: Named[]
  collaborators: Collaborator[]
  obligations: Obligation[]
  dataReady: boolean
  selectFarm: (id: string) => void
  createFarm: (name: string) => Promise<void>
  acceptInvite: (inv: Invite) => Promise<void>
  refreshFarms: () => void
}

const Ctx = createContext<AppState | null>(null)
export const useApp = () => useContext(Ctx)!

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, 'pt-BR')

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [farms, setFarms] = useState<FarmRef[]>([])
  const [farmsReady, setFarmsReady] = useState(false)
  const [invites, setInvites] = useState<Invite[]>([])
  const [farmId, setFarmId] = useState<string | null>(null)
  const [farm, setFarm] = useState<Farm | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setAuthReady(true) }), [])

  // Descobre as fazendas do usuário via seus documentos de membro.
  useEffect(() => {
    if (!user) { setFarms([]); setFarmId(null); setFarmsReady(false); return }
    const q = query(collectionGroup(db, 'members'), where('uid', '==', user.uid))
    return onSnapshot(q, async (snap) => {
      const list = await Promise.all(snap.docs.map(async (m) => {
        const id = m.ref.parent.parent!.id
        const f = await getDoc(doc(db, 'farms', id)).catch(() => null)
        return { id, name: (f?.data()?.name as string) ?? 'Fazenda', role: m.data().role as Role }
      }))
      list.sort(byName)
      setFarms(list)
      const saved = localStorage.getItem('ag-farm')
      setFarmId((cur) => (cur && list.some((f) => f.id === cur) ? cur : list.find((f) => f.id === saved)?.id ?? list[0]?.id ?? null))
      setFarmsReady(true)
    }, () => setFarmsReady(true))
  }, [user, tick])

  // Convites pendentes (exige e-mail verificado — validado também nas regras).
  useEffect(() => {
    if (!user?.email || !user.emailVerified) { setInvites([]); return }
    const q = query(collectionGroup(db, 'invites'), where('email', '==', user.email))
    return onSnapshot(q, (snap) => {
      setInvites(snap.docs
        .map((d) => ({ ...(d.data() as Omit<Invite, 'farmId'>), farmId: d.ref.parent.parent!.id }))
        .filter((i) => !farms.some((f) => f.id === i.farmId)))
    }, () => setInvites([]))
  }, [user, farms])

  useEffect(() => {
    if (!farmId) { setFarm(null); return }
    localStorage.setItem('ag-farm', farmId)
    return onSnapshot(doc(db, 'farms', farmId), (s) => setFarm(s.exists() ? ({ id: s.id, alertDays: DEFAULT_ALERT_DAYS, ...s.data() } as Farm) : null))
  }, [farmId])

  const lt = useFarmCollection<Named>(farmId, 'laborTypes')
  const cat = useFarmCollection<Named>(farmId, 'expenseCategories')
  const col = useFarmCollection<Collaborator>(farmId, 'collaborators')
  const obl = useFarmCollection<Obligation>(farmId, 'obligations')

  const role = farms.find((f) => f.id === farmId)?.role ?? null

  const createFarm = useCallback(async (name: string) => {
    const u = auth.currentUser!
    const id = doc(collection(db, 'farms')).id
    const b1 = writeBatch(db)
    b1.set(doc(db, 'farms', id), { name: name.trim(), ownerUid: u.uid, ownerName: u.displayName ?? '', alertDays: DEFAULT_ALERT_DAYS, arroba: { ...DEFAULT_ARROBA, outraLabel: 'Outra unidade' }, createdAt: serverTimestamp() })
    b1.set(farmDoc(id, 'members', u.uid), { uid: u.uid, email: u.email ?? '', name: u.displayName ?? '', role: 'owner', joinedAt: serverTimestamp() })
    await b1.commit()
    const b2 = writeBatch(db)
    for (const n of DEFAULT_LABOR_TYPES) b2.set(farmDoc(id, 'laborTypes', newId(id, 'laborTypes')), { name: n, active: true, createdAt: serverTimestamp() })
    for (const n of DEFAULT_CATEGORIES) b2.set(farmDoc(id, 'expenseCategories', newId(id, 'expenseCategories')), { name: n, active: true, createdAt: serverTimestamp() })
    for (const n of DEFAULT_ANIMAL_CATEGORIES) b2.set(farmDoc(id, 'animalCategories', newId(id, 'animalCategories')), { name: n, active: true, createdAt: serverTimestamp() })
    addLog(b2, id, 'fazenda_criada', name)
    await b2.commit()
    setFarmId(id)
  }, [])

  const acceptInvite = useCallback(async (inv: Invite) => {
    const u = auth.currentUser!
    const b = writeBatch(db)
    b.set(farmDoc(inv.farmId, 'members', u.uid), { uid: u.uid, email: u.email!, name: u.displayName ?? '', role: inv.role, joinedAt: serverTimestamp() })
    await b.commit()
    const b2 = writeBatch(db)
    b2.delete(farmDoc(inv.farmId, 'invites', inv.email))
    addLog(b2, inv.farmId, 'convite_aceito', `${u.email} como ${inv.role}`)
    await b2.commit().catch(() => {})
    setFarmId(inv.farmId)
  }, [])

  const value = useMemo<AppState>(() => ({
    user, authReady, farms, farmsReady, invites, farm, role,
    canEdit: role === 'owner' || role === 'admin',
    laborTypes: [...lt.data].sort(byName),
    categories: [...cat.data].sort(byName),
    collaborators: [...col.data].sort(byName),
    obligations: obl.data,
    dataReady: !lt.loading && !cat.loading && !col.loading && !obl.loading,
    selectFarm: setFarmId,
    createFarm, acceptInvite,
    refreshFarms: () => setTick((t) => t + 1),
  }), [user, authReady, farms, farmsReady, invites, farm, role, lt, cat, col, obl, createFarm, acceptInvite])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
