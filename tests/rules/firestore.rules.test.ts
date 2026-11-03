import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collectionGroup, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, deleteDoc, where, writeBatch } from 'firebase/firestore'

let env: RulesTestEnvironment
const F = 'fazendaA'

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-agrogestao', firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } })
})
afterAll(() => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'farms', F), { name: 'A', ownerUid: 'dono', alertDays: [30, 15, 7, 0] })
    await setDoc(doc(db, `farms/${F}/members/dono`), { uid: 'dono', email: 'dono@x.com', name: 'Dono', role: 'owner' })
    await setDoc(doc(db, `farms/${F}/members/leitor`), { uid: 'leitor', email: 'leitor@x.com', name: 'L', role: 'viewer' })
    await setDoc(doc(db, `farms/${F}/members/adm`), { uid: 'adm', email: 'adm@x.com', name: 'A', role: 'admin' })
    await setDoc(doc(db, `farms/${F}/collaborators/c1`), { name: 'João', laborTypeId: 't1', bond: 'clt', active: true })
    await setDoc(doc(db, `farms/${F}/invites/novo@x.com`), { email: 'novo@x.com', role: 'admin', farmName: 'A', invitedBy: 'dono' })
  })
})

const as = (uid: string, token: Record<string, unknown> = {}) => env.authenticatedContext(uid, token).firestore()
const collab = { name: 'Maria', laborTypeId: 't1', bond: 'diarista', active: true, createdAt: serverTimestamp() }
const entry = (uid: string, amount: unknown = 12000) => ({ kind: 'labor', date: '2026-11-03', amount, laborTypeId: 't1', laborTypeName: 'Vaqueiro', collaboratorId: 'c1', collaboratorName: 'João', note: '', batchId: 'b1', createdBy: uid, createdAt: serverTimestamp() })

describe('isolamento entre fazendas', () => {
  it('anônimo não lê nada', () => assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'farms', F))))
  it('usuário de outra fazenda não lê nem escreve', async () => {
    const db = as('intruso')
    await assertFails(getDoc(doc(db, 'farms', F)))
    await assertFails(getDocs(query(collectionGroup(db, 'collaborators'))))
    await assertFails(getDoc(doc(db, `farms/${F}/collaborators/c1`)))
    await assertFails(setDoc(doc(db, `farms/${F}/collaborators/x`), collab))
    await assertFails(setDoc(doc(db, `farms/${F}/expenseEntries/x`), entry('intruso')))
  })
  it('não é possível se autoadicionar como dono ou admin sem convite', async () => {
    const db = as('intruso', { email: 'intruso@x.com', email_verified: true })
    await assertFails(setDoc(doc(db, `farms/${F}/members/intruso`), { uid: 'intruso', email: 'intruso@x.com', name: '', role: 'owner' }))
    await assertFails(setDoc(doc(db, `farms/${F}/members/intruso`), { uid: 'intruso', email: 'intruso@x.com', name: '', role: 'admin' }))
  })
  it('não é possível tomar a posse da fazenda', () =>
    assertFails(updateDoc(doc(as('adm'), 'farms', F), { ownerUid: 'adm' })))
  it('consulta de grupo de membros só retorna os próprios', async () => {
    await assertSucceeds(getDocs(query(collectionGroup(as('leitor'), 'members'), where('uid', '==', 'leitor'))))
    await assertFails(getDocs(query(collectionGroup(as('leitor'), 'members'))))
  })
})

describe('criação de fazenda', () => {
  it('cria fazenda e vira owner no mesmo lote', async () => {
    const db = as('u2')
    const b = writeBatch(db)
    b.set(doc(db, 'farms', 'B'), { name: 'B', ownerUid: 'u2', alertDays: [30], createdAt: serverTimestamp() })
    b.set(doc(db, 'farms/B/members/u2'), { uid: 'u2', email: 'u2@x.com', name: '', role: 'owner' })
    await assertSucceeds(b.commit())
  })
  it('não cria fazenda em nome de outro', () => assertFails(setDoc(doc(as('u2'), 'farms', 'C'), { name: 'C', ownerUid: 'dono', alertDays: [] })))
})

describe('papéis', () => {
  it('leitor lê mas não escreve', async () => {
    const db = as('leitor')
    await assertSucceeds(getDoc(doc(db, `farms/${F}/collaborators/c1`)))
    await assertFails(setDoc(doc(db, `farms/${F}/collaborators/x`), collab))
    await assertFails(setDoc(doc(db, `farms/${F}/expenseEntries/x`), entry('leitor')))
  })
  it('admin escreve; ninguém exclui colaborador', async () => {
    const db = as('adm')
    await assertSucceeds(setDoc(doc(db, `farms/${F}/collaborators/x`), collab))
    await assertFails(deleteDoc(doc(db, `farms/${F}/collaborators/c1`)))
  })
  it('só o dono altera papéis; admin não se promove a owner', async () => {
    await assertFails(updateDoc(doc(as('adm'), `farms/${F}/members/leitor`), { role: 'admin' }))
    await assertSucceeds(updateDoc(doc(as('dono'), `farms/${F}/members/leitor`), { role: 'admin' }))
    await assertFails(updateDoc(doc(as('dono'), `farms/${F}/members/adm`), { role: 'owner' }))
  })
})

describe('convites', () => {
  const join = (verified: boolean, role = 'admin', email = 'novo@x.com') =>
    setDoc(doc(as('novo', { email, email_verified: verified }), `farms/${F}/members/novo`), { uid: 'novo', email, name: '', role })
  it('aceita convite com e-mail verificado e papel correto', () => assertSucceeds(join(true)))
  it('recusa e-mail não verificado', () => assertFails(join(false)))
  it('recusa papel diferente do convidado', () => assertFails(join(true, 'owner')))
  it('recusa outro e-mail', () => assertFails(join(true, 'admin', 'outro@x.com')))
})

describe('validação de dados financeiros', () => {
  it('aceita lançamento válido em centavos', () => assertSucceeds(setDoc(doc(as('adm'), `farms/${F}/expenseEntries/e1`), entry('adm'))))
  it('rejeita valor fracionado, negativo, zero ou texto', async () => {
    for (const v of [12.5, -100, 0, '100']) await assertFails(setDoc(doc(as('adm'), `farms/${F}/expenseEntries/e1`), entry('adm', v)))
  })
  it('rejeita lançamento em nome de outro usuário e campos extras', async () => {
    await assertFails(setDoc(doc(as('adm'), `farms/${F}/expenseEntries/e1`), entry('dono')))
    await assertFails(setDoc(doc(as('adm'), `farms/${F}/expenseEntries/e1`), { ...entry('adm'), hack: true }))
  })
  it('lote é imutável: reenviar o mesmo lote falha (sem duplicidade)', async () => {
    const send = () => {
      const db = as('adm')
      const b = writeBatch(db)
      b.set(doc(db, `farms/${F}/expenseBatches/b1`), { createdBy: 'adm', createdAt: serverTimestamp(), laborTotal: 12000, otherTotal: 0, total: 12000, count: 1 })
      b.set(doc(db, `farms/${F}/expenseEntries/b1-0`), entry('adm'))
      return b.commit()
    }
    await assertSucceeds(send())
    await assertFails(send())
  })
  it('obrigação paga exige data de pagamento', async () => {
    const o = { type: 'ferias', collaboratorId: 'c1', collaboratorName: 'João', dueDate: '2026-12-01', status: 'pago', recurrence: 'yearly', amount: 200000 }
    await assertFails(setDoc(doc(as('adm'), `farms/${F}/obligations/o1`), o))
    await assertSucceeds(setDoc(doc(as('adm'), `farms/${F}/obligations/o1`), { ...o, paidDate: '2026-11-30' }))
  })
})

describe('logs de auditoria', () => {
  it('só inserção', async () => {
    const db = as('adm')
    await assertSucceeds(setDoc(doc(db, `farms/${F}/logs/l1`), { action: 'teste', detail: '', uid: 'adm', at: serverTimestamp() }))
    await assertFails(updateDoc(doc(db, `farms/${F}/logs/l1`), { detail: 'alterado' }))
    await assertFails(deleteDoc(doc(db, `farms/${F}/logs/l1`)))
    await assertFails(setDoc(doc(db, `farms/${F}/logs/l2`), { action: 'falso', detail: '', uid: 'dono', at: serverTimestamp() }))
  })
})
