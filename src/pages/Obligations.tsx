import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import { today } from '../lib/format'
import { obligationState } from '../lib/domain'
import { Button, Card, PageHeader, Spinner, cx } from '../components/ui'
import { ObligationForm } from '../components/ObligationForm'
import { ObligationList } from '../components/ObligationList'

const TABS = [
  { k: 'open', label: 'Em aberto' }, { k: 'vencido', label: 'Vencidas' }, { k: 'pago', label: 'Pagas' }, { k: 'all', label: 'Todas' },
] as const

export default function Obligations() {
  const { obligations, collaborators, canEdit, dataReady } = useApp()
  const [tab, setTab] = useState<(typeof TABS)[number]['k']>('open')
  const [col, setCol] = useState('')
  const [open, setOpen] = useState(false)
  const t = today()

  const counts = useMemo(() => {
    const c = { open: 0, vencido: 0, pago: 0, all: obligations.length }
    for (const o of obligations) { const s = obligationState(o, t); if (s !== 'pago') c.open++; if (s === 'vencido') c.vencido++; if (s === 'pago') c.pago++ }
    return c
  }, [obligations, t])

  const list = useMemo(() => obligations
    .filter((o) => !col || o.collaboratorId === col)
    .filter((o) => { const s = obligationState(o, t); return tab === 'all' || (tab === 'open' ? s !== 'pago' : s === tab) })
    .sort((a, b) => (tab === 'pago' ? (b.paidDate ?? '').localeCompare(a.paidDate ?? '') : a.dueDate.localeCompare(b.dueDate))), [obligations, col, tab, t])

  return (
    <>
      <PageHeader title="Obrigações e lembretes" subtitle="Férias, 13º e outros pagamentos periódicos"
        actions={canEdit && <Button onClick={() => setOpen(true)}><Plus className="size-4" />Nova obrigação</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-stone-200 bg-white p-0.5 dark:border-stone-800 dark:bg-stone-900">
          {TABS.map((x) => (
            <button key={x.k} onClick={() => setTab(x.k)}
              className={cx('rounded-md px-3 py-1.5 text-sm', tab === x.k ? 'bg-brand-600 text-white' : 'text-stone-600 dark:text-stone-300')}>
              {x.label} <span className="opacity-70">{counts[x.k]}</span>
            </button>
          ))}
        </div>
        <select className="input w-auto" value={col} onChange={(e) => setCol(e.target.value)} aria-label="Colaborador">
          <option value="">Todos os colaboradores</option>
          {collaborators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <Card>{dataReady ? <ObligationList items={list} /> : <Spinner />}</Card>
      <p className="mt-3 text-xs text-stone-500">O Gestão Rural organiza e lembra obrigações informadas por você. Ele não calcula direitos trabalhistas nem substitui orientação contábil ou jurídica.</p>
      <ObligationForm open={open} onClose={() => setOpen(false)} />
    </>
  )
}
