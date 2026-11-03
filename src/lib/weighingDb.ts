import { doc, getDocFromServer, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { auth, db } from './firebase'
import { clean, commitConfirmed, farmCol, farmDoc } from './db'
import { sessionStats, type Weighing, type WeighingSession } from './weighing'
import type { Animal, HerdLot } from './herd'

/** Limite por sessão: 1 sessão + N registros + N animais + lote + log ≤ 500 operações. */
export const MAX_WEIGH_ROWS = 240

export async function fetchWeighings(farmId: string, f: { lotId?: string; animalIds?: string[] } = {}): Promise<Weighing[]> {
  const col = farmCol(farmId, 'weighings')
  if (f.animalIds) {
    const out: Weighing[] = []
    for (let i = 0; i < f.animalIds.length; i += 30) {
      const chunk = f.animalIds.slice(i, i + 30)
      if (!chunk.length) continue
      out.push(...(await getDocs(query(col, where('animalId', 'in', chunk)))).docs.map((d) => ({ id: d.id, ...d.data() }) as Weighing))
    }
    return out
  }
  const snap = await getDocs(f.lotId ? query(col, where('lotId', '==', f.lotId)) : col)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Weighing)
}

export async function fetchSessions(farmId: string): Promise<WeighingSession[]> {
  return (await getDocs(farmCol(farmId, 'weighingSessions'))).docs.map((d) => ({ id: d.id, ...d.data() }) as WeighingSession).sort((a, b) => b.date.localeCompare(a.date))
}

export type NewRecord = Omit<Weighing, 'id' | 'sessionId' | 'date' | 'mode'> & { date?: string }

/**
 * Grava a sessão e todos os registros num único lote atômico, aguardando a confirmação do servidor.
 * Id da sessão gerado ao abrir a planilha: reenviar não duplica (as regras proíbem recriar registros).
 * Não altera a quantidade do lote; atualiza apenas a referência de última pesagem dos animais e o peso médio do lote.
 */
export async function saveWeighingSession(farmId: string, sessionId: string,
  header: Omit<WeighingSession, 'id' | 'count' | 'totalKg' | 'avgKg' | 'gainAvg' | 'gmdAvg'>, records: NewRecord[],
  ctx: { animals: Animal[]; lots: HerdLot[] }): Promise<'saved' | 'already-saved'> {
  if (!records.length) throw new Error('Nenhum registro para salvar.')
  if (records.length > MAX_WEIGH_ROWS) throw new Error(`Máximo de ${MAX_WEIGH_ROWS} linhas por pesagem. Divida em mais de uma sessão.`)
  const ref = farmDoc(farmId, 'weighingSessions', sessionId)
  if ((await getDocFromServer(ref)).exists()) return 'already-saved'
  const uid = auth.currentUser!.uid
  const st = sessionStats(records)
  const b = writeBatch(db)
  b.set(ref, clean({ ...header, count: st.count, records: records.length, totalKg: st.totalKg, avgKg: st.avgKg, gainAvg: st.gainAvg, gmdAvg: st.gmdAvg, createdBy: uid, createdAt: serverTimestamp() }))
  records.forEach((r, i) => b.set(farmDoc(farmId, 'weighings', `${sessionId}-${i}`), clean({
    ...r, sessionId, date: r.date ?? header.date, mode: header.mode, createdBy: uid, createdAt: serverTimestamp(),
  })))
  // Referência da última pesagem: só avança se esta pesagem for mais recente que a registrada.
  for (const r of records) {
    if (!r.animalId) continue
    const a = ctx.animals.find((x) => x.id === r.animalId)
    const date = r.date ?? header.date
    if (a && a.status === 'ativo' && (!a.lastWeighing || a.lastWeighing.date <= date)) b.update(farmDoc(farmId, 'animals', a.id), { lastWeighing: { date, kg: r.avgKg }, updatedAt: serverTimestamp() })
  }
  // Peso médio do(s) lote(s): metadado de referência, nunca a quantidade.
  const lotIds = [...new Set(records.map((r) => r.lotId))]
  for (const lotId of lotIds) {
    const lot = ctx.lots.find((l) => l.id === lotId)
    const rs = records.filter((r) => r.lotId === lotId)
    const date = rs[0].date ?? header.date
    if (lot && (!lot.avgWeightAt || lot.avgWeightAt <= date)) {
      const s = sessionStats(rs)
      b.update(farmDoc(farmId, 'herdLots', lotId), { avgWeightKg: s.avgKg, avgWeightAt: date, updatedAt: serverTimestamp() })
    }
  }
  b.set(doc(farmCol(farmId, 'logs')), { action: 'pesagem_registrada', detail: `${header.mode} ${records.length} registro(s), ${st.count} cab., média ${st.avgKg} kg (${sessionId})`, uid, at: serverTimestamp() })
  await commitConfirmed(b)
  return 'saved'
}

/**
 * Correção rastreável: cria um novo registro que referencia o original (correctsId + motivo)
 * e marca o original como substituído. O original nunca é apagado nem editado em seus valores.
 */
export async function correctWeighing(farmId: string, original: Weighing, newKg: number, reason: string, prevKg?: number | null, prevDate?: string | null, gmdVal?: number | null) {
  const uid = auth.currentUser!.uid
  const newId = `${original.id}-c${Date.now().toString(36)}`
  const b = writeBatch(db)
  const isInd = original.mode === 'individual'
  b.set(farmDoc(farmId, 'weighings', newId), clean({
    ...Object.fromEntries(Object.entries(original).filter(([k]) => !['id', 'supersededBy', 'createdAt', 'createdBy', 'updatedAt'].includes(k))),
    totalKg: isInd ? newKg : Math.round(newKg * original.qty * 10) / 10, avgKg: newKg,
    gainKg: isInd && prevKg ? Math.round((newKg - prevKg) * 10) / 10 : original.gainKg ?? null, gmd: isInd ? gmdVal ?? null : null, prevKg: prevKg ?? original.prevKg ?? null, prevDate: prevDate ?? original.prevDate ?? null,
    correctsId: original.id, correctionReason: reason.slice(0, 300), createdBy: uid, createdAt: serverTimestamp(),
  }))
  b.update(farmDoc(farmId, 'weighings', original.id), { supersededBy: newId, updatedAt: serverTimestamp() })
  b.set(doc(farmCol(farmId, 'logs')), { action: 'pesagem_corrigida', detail: `${original.id}: ${original.avgKg} → ${newKg} kg. Motivo: ${reason}`.slice(0, 500), uid, at: serverTimestamp() })
  await commitConfirmed(b)
  return newId
}
