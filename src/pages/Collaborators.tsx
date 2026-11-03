import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Plus, Search, UserCheck, UserX, Users } from 'lucide-react'
import { serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { addLog, farmDoc, friendlyError } from '../lib/db'
import { money } from '../lib/format'
import { BOND_LABEL, type Collaborator } from '../lib/types'
import { useApp } from '../contexts/AppContext'
import { Badge, Button, Card, Empty, PageHeader, Spinner, useToast } from '../components/ui'
import { CollaboratorForm } from '../components/CollaboratorForm'

export async function setCollaboratorActive(farmId: string, c: Collaborator, active: boolean) {
  const b = writeBatch(db)
  b.update(farmDoc(farmId, 'collaborators', c.id), { active, updatedAt: serverTimestamp() })
  addLog(b, farmId, active ? 'colaborador_reativado' : 'colaborador_inativado', c.name)
  await b.commit()
}

export default function Collaborators() {
  const { farm, collaborators, laborTypes, canEdit, dataReady } = useApp()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active')
  const [form, setForm] = useState<{ open: boolean; editing?: Collaborator | null }>({ open: false })
  const typeName = (id: string) => laborTypes.find((t) => t.id === id)?.name ?? '—'

  const list = useMemo(() => collaborators.filter((c) =>
    (status === 'all' || (status === 'active') === c.active) && (!type || c.laborTypeId === type) &&
    (!q || c.name.toLowerCase().includes(q.toLowerCase()) || (c.cpf ?? '').includes(q))), [collaborators, q, type, status])

  async function toggle(c: Collaborator) {
    if (c.active && !confirm(`Inativar ${c.name}? O histórico de pagamentos será preservado e ele não aparecerá em novos lançamentos.`)) return
    try { await setCollaboratorActive(farm!.id, c, !c.active); toast('success', c.active ? 'Colaborador inativado.' : 'Colaborador reativado.') }
    catch (e) { toast('error', friendlyError(e)) }
  }

  return (
    <>
      <PageHeader title="Colaboradores" subtitle={`${collaborators.filter((c) => c.active).length} ativos`}
        actions={canEdit && <Button onClick={() => setForm({ open: true, editing: null })}><Plus className="size-4" />Novo colaborador</Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute top-2.5 left-3 size-4 text-stone-400" />
          <input className="input pl-9" placeholder="Buscar por nome ou CPF" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          {laborTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status">
          <option value="active">Ativos</option><option value="inactive">Inativos</option><option value="all">Todos</option>
        </select>
      </div>
      <Card>
        {!dataReady ? <Spinner /> : list.length === 0 ? (
          <Empty icon={<Users className="size-5" />} title="Nenhum colaborador encontrado"
            action={canEdit && collaborators.length === 0 && <Button onClick={() => setForm({ open: true })}><Plus className="size-4" />Cadastrar o primeiro</Button>} />
        ) : (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {list.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                  {c.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <Link to={`/colaboradores/${c.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="truncate font-medium hover:underline">{c.name}</span>{!c.active && <Badge>Inativo</Badge>}</div>
                  <div className="truncate text-xs text-stone-500">{typeName(c.laborTypeId)} · {BOND_LABEL[c.bond]}{c.referenceAmount ? ` · ref. ${money(c.referenceAmount)}` : ''}{c.phone ? ` · ${c.phone}` : ''}</div>
                </Link>
                {canEdit && (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setForm({ open: true, editing: c })} aria-label="Editar"><Pencil className="size-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => toggle(c)} aria-label={c.active ? 'Inativar' : 'Reativar'} title={c.active ? 'Inativar' : 'Reativar'}>
                      {c.active ? <UserX className="size-4 text-stone-500" /> : <UserCheck className="size-4 text-brand-600" />}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <CollaboratorForm open={form.open} editing={form.editing} onClose={() => setForm({ open: false })} />
    </>
  )
}
