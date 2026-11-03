import {
  collection, doc, onSnapshot, query, where, orderBy, getDocs, getDocFromServer, writeBatch, serverTimestamp,
  type DocumentData, type WriteBatch,
} from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { auth, db } from './firebase'
import type { ValidatedSheet } from './sheet'
import type { ExpenseEntry, RevenueEntry } from './types'

export const farmCol = (farmId: string, name: string) => collection(db, 'farms', farmId, name)
export const farmDoc = (farmId: string, name: string, id: string) => doc(db, 'farms', farmId, name, id)
export const newId = (farmId: string, name: string) => doc(farmCol(farmId, name)).id

/** Remove undefined (Firestore rejeita) */
export function clean<T extends DocumentData>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

export function addLog(b: WriteBatch, farmId: string, action: string, detail: string) {
  b.set(doc(farmCol(farmId, 'logs')), { action, detail: detail.slice(0, 500), uid: auth.currentUser!.uid, at: serverTimestamp() })
}

/** Assina uma subcoleção da fazenda em tempo real. */
export function useFarmCollection<T>(farmId: string | null, name: string): { data: T[]; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ data: T[]; loading: boolean; error: string | null }>({ data: [], loading: true, error: null })
  useEffect(() => {
    if (!farmId) return
    setState((s) => ({ ...s, loading: true }))
    return onSnapshot(
      farmCol(farmId, name),
      (snap) => setState({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T), loading: false, error: null }),
      (e) => setState({ data: [], loading: false, error: e.message }),
    )
  }, [farmId, name])
  return state
}

/** Lançamentos num intervalo de datas (YYYY-MM-DD), em tempo real. */
export function useEntries(farmId: string | null, start: string, end: string) {
  const [state, setState] = useState<{ data: ExpenseEntry[]; loading: boolean; error: string | null }>({ data: [], loading: true, error: null })
  useEffect(() => {
    if (!farmId || !start || !end) return
    setState((s) => ({ ...s, loading: true }))
    const q = query(farmCol(farmId, 'expenseEntries'), where('date', '>=', start), where('date', '<=', end), orderBy('date', 'desc'))
    return onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ExpenseEntry), loading: false, error: null }),
      (e) => setState({ data: [], loading: false, error: e.message }),
    )
  }, [farmId, start, end])
  return state
}

export async function fetchEntries(farmId: string, start: string, end: string): Promise<ExpenseEntry[]> {
  const q = query(farmCol(farmId, 'expenseEntries'), where('date', '>=', start), where('date', '<=', end), orderBy('date', 'desc'))
  return (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }) as ExpenseEntry)
}

export const MAX_SHEET_ROWS = 450 // limite de 500 operações por lote do Firestore (lote + log + linhas)

/**
 * Salva a planilha num único writeBatch (atômico: tudo ou nada).
 * batchId é gerado no cliente e guardado no rascunho, então um reenvio
 * (clique duplo, queda de rede) nunca duplica: se o lote já existe no servidor, é considerado salvo,
 * e as regras proíbem recriar um lote existente.
 * Só resolve quando o servidor confirma a gravação.
 */
export async function saveSheet(farmId: string, batchId: string, v: ValidatedSheet): Promise<'saved' | 'already-saved'> {
  const batchRef = farmDoc(farmId, 'expenseBatches', batchId)
  try {
    if ((await getDocFromServer(batchRef)).exists()) return 'already-saved'
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'unavailable') throw new Error('Sem conexão com o servidor. Seus dados continuam na planilha; tente novamente.')
    throw e
  }
  const uid = auth.currentUser!.uid
  const laborTotal = v.labor.reduce((s, r) => s + r.amount, 0)
  const otherTotal = v.other.reduce((s, r) => s + r.amount, 0)
  const count = v.labor.length + v.other.length
  const b = writeBatch(db)
  b.set(batchRef, { createdBy: uid, createdAt: serverTimestamp(), laborTotal, otherTotal, total: laborTotal + otherTotal, count })
  let i = 0
  const ts = serverTimestamp()
  for (const r of v.labor)
    b.set(farmDoc(farmId, 'expenseEntries', `${batchId}-${i++}`), { kind: 'labor', ...r, batchId, createdBy: uid, createdAt: ts })
  for (const r of v.other)
    b.set(farmDoc(farmId, 'expenseEntries', `${batchId}-${i++}`), { kind: 'other', ...r, batchId, createdBy: uid, createdAt: ts })
  addLog(b, farmId, 'lancamento_salvo', `${count} linhas, total ${laborTotal + otherTotal} centavos (lote ${batchId})`)
  await commitConfirmed(b)
  return 'saved'
}

/** commit() com timeout: o Firestore só resolve após confirmação do servidor. */
export async function commitConfirmed(b: WriteBatch, ms = 25000) {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error('O servidor não confirmou a gravação a tempo. Verifique a conexão; os dados foram mantidos e não serão duplicados ao reenviar.')), ms)
  })
  try {
    await Promise.race([b.commit(), timeout])
  } finally {
    clearTimeout(timer!)
  }
}

export function friendlyError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? ''
  if (code.includes('permission-denied')) return 'Você não tem permissão para esta operação.'
  if (code.includes('unavailable')) return 'Sem conexão com o servidor. Tente novamente.'
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return 'E-mail ou senha incorretos.'
  if (code === 'auth/email-already-in-use') return 'Este e-mail já possui conta. Faça login.'
  if (code === 'auth/weak-password') return 'Senha fraca: use pelo menos 6 caracteres.'
  if (code === 'auth/invalid-email') return 'E-mail inválido.'
  if (code === 'auth/too-many-requests') return 'Muitas tentativas. Aguarde alguns minutos.'
  return (e as Error)?.message || 'Erro inesperado.'
}

/** Receitas num intervalo de datas, em tempo real. */
export function useRevenues(farmId: string | null, start: string, end: string) {
  const [state, setState] = useState<{ data: RevenueEntry[]; loading: boolean; error: string | null }>({ data: [], loading: true, error: null })
  useEffect(() => {
    if (!farmId || !start || !end) return
    setState((s) => ({ ...s, loading: true }))
    const q = query(farmCol(farmId, 'revenueEntries'), where('date', '>=', start), where('date', '<=', end), orderBy('date', 'desc'))
    return onSnapshot(q, (snap) => setState({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RevenueEntry), loading: false, error: null }),
      (e) => setState({ data: [], loading: false, error: e.message }))
  }, [farmId, start, end])
  return state
}
