import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getDocs, query, where } from 'firebase/firestore'
import { ArrowLeft, Pencil, Plus } from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import { farmCol, friendlyError } from '../lib/db'
import { fmtDate, money } from '../lib/format'
import { sum } from '../lib/domain'
import { BOND_LABEL, type ExpenseEntry } from '../lib/types'
import { Badge, Button, Card, Empty, ErrorBox, PageHeader, Spinner, Stat } from '../components/ui'
import { CollaboratorForm } from '../components/CollaboratorForm'
import { ObligationForm } from '../components/ObligationForm'
import { ObligationList } from '../components/ObligationList'
import { Wallet, CalendarCheck } from 'lucide-react'

export default function CollaboratorDetail() {
  const { id } = useParams()
  const { farm, collaborators, laborTypes, obligations, canEdit, dataReady } = useApp()
  const c = collaborators.find((x) => x.id === id)
  const [entries, setEntries] = useState<ExpenseEntry[] | null>(null)
  const [error, setError] = useState('')
  const [edit, setEdit] = useState(false)
  const [newObl, setNewObl] = useState(false)

  useEffect(() => {
    if (!id) return
    getDocs(query(farmCol(farm!.id, 'expenseEntries'), where('collaboratorId', '==', id)))
      .then((s) => setEntries(s.docs.map((d) => ({ id: d.id, ...d.data() }) as ExpenseEntry).sort((a, b) => b.date.localeCompare(a.date))))
      .catch((e) => setError(friendlyError(e)))
  }, [farm, id, obligations])

  const obls = useMemo(() => obligations.filter((o) => o.collaboratorId === id).sort((a, b) => b.dueDate.localeCompare(a.dueDate)), [obligations, id])
  if (!dataReady) return <Spinner />
  if (!c) return <Empty title="Colaborador não encontrado" action={<Link to="/colaboradores"><Button variant="secondary">Voltar</Button></Link>} />
  const year = new Date().getFullYear().toString()

  return (
    <>
      <Link to="/colaboradores" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 hover:underline"><ArrowLeft className="size-4" />Colaboradores</Link>
      <PageHeader title={c.name}
        subtitle={`${laborTypes.find((t) => t.id === c.laborTypeId)?.name ?? '—'} · ${BOND_LABEL[c.bond]}${c.admissionDate ? ` · admissão ${fmtDate(c.admissionDate)}` : ''}`}
        actions={<>{!c.active && <Badge>Inativo</Badge>}{canEdit && <Button variant="secondary" onClick={() => setEdit(true)}><Pencil className="size-4" />Editar</Button>}</>} />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Total pago (histórico)" value={entries ? money(sum(entries)) : '…'} icon={<Wallet className="size-4" />} />
        <Stat label={`Pago em ${year}`} value={entries ? money(sum(entries.filter((e) => e.date.startsWith(year)))) : '…'} icon={<Wallet className="size-4" />} />
        <Stat label="Obrigações pendentes" value={String(obls.filter((o) => o.status === 'pendente').length)} icon={<CalendarCheck className="size-4" />} tone="earth" />
      </div>
      {(c.phone || c.cpf || c.notes || c.referenceAmount) && (
        <Card className="mb-5"><dl className="grid gap-3 p-4 text-sm sm:grid-cols-4">
          {c.phone && <div><dt className="text-xs text-stone-500">Telefone</dt><dd>{c.phone}</dd></div>}
          {c.cpf && <div><dt className="text-xs text-stone-500">CPF</dt><dd>{c.cpf}</dd></div>}
          {c.referenceAmount ? <div><dt className="text-xs text-stone-500">Valor de referência</dt><dd>{money(c.referenceAmount)}</dd></div> : null}
          {c.notes && <div className="sm:col-span-4"><dt className="text-xs text-stone-500">Observações</dt><dd className="whitespace-pre-wrap">{c.notes}</dd></div>}
        </dl></Card>
      )}
      <Card title="Histórico de obrigações" className="mb-5"
        action={canEdit && <Button size="sm" variant="secondary" onClick={() => setNewObl(true)}><Plus className="size-4" />Registrar</Button>}>
        <ObligationList items={obls} showCollaborator={false} />
      </Card>
      <Card title="Pagamentos">
        {error ? <div className="p-4"><ErrorBox>{error}</ErrorBox></div> : !entries ? <Spinner /> : entries.length === 0 ? <Empty title="Nenhum pagamento registrado" /> : (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {entries.map((e) => (
              <li key={e.id} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0"><div className="tabular">{fmtDate(e.date)}</div>{e.note && <div className="truncate text-xs text-stone-500">{e.note}</div>}</div>
                <span className="tabular font-medium">{money(e.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <CollaboratorForm open={edit} editing={c} onClose={() => setEdit(false)} />
      <ObligationForm open={newObl} collaboratorId={c.id} onClose={() => setNewObl(false)} />
    </>
  )
}
