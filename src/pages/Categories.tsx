import { useState } from 'react'
import { getDocs, query, where } from 'firebase/firestore'
import { ListTree } from 'lucide-react'
import { farmCol, friendlyError } from '../lib/db'
import { fmtDate, money } from '../lib/format'
import { sum } from '../lib/domain'
import type { ExpenseEntry, Named } from '../lib/types'
import { useApp } from '../contexts/AppContext'
import { Button, Card, Empty, ErrorBox, Modal, PageHeader, Spinner } from '../components/ui'
import { NamedList } from '../components/NamedList'

export default function Categories() {
  const { farm, categories, dataReady } = useApp()
  const [view, setView] = useState<{ cat: Named; entries: ExpenseEntry[] | null; error?: string } | null>(null)

  async function open(cat: Named) {
    setView({ cat, entries: null })
    try {
      const s = await getDocs(query(farmCol(farm!.id, 'expenseEntries'), where('categoryId', '==', cat.id)))
      setView({ cat, entries: s.docs.map((d) => ({ id: d.id, ...d.data() }) as ExpenseEntry).sort((a, b) => b.date.localeCompare(a.date)) })
    } catch (e) { setView({ cat, entries: [], error: friendlyError(e) }) }
  }

  return (
    <>
      <PageHeader title="Tipos de despesa" subtitle="Categorias usadas em “Outras despesas”. Inativar oculta dos novos lançamentos e preserva o histórico." />
      <Card>
        {dataReady ? <NamedList collection="expenseCategories" items={categories} noun="categoria"
          extra={(c) => <Button size="sm" variant="ghost" onClick={() => open(c)}><ListTree className="size-4" />Despesas</Button>} /> : <Spinner />}
      </Card>
      <Modal open={!!view} onClose={() => setView(null)} title={`Despesas — ${view?.cat.name ?? ''}`} wide>
        {!view?.entries ? <Spinner /> : view.error ? <ErrorBox>{view.error}</ErrorBox> : view.entries.length === 0 ? <Empty title="Nenhuma despesa nesta categoria" /> : (
          <>
            <ul className="divide-y divide-stone-100 text-sm dark:divide-stone-800">
              {view.entries.map((e) => <li key={e.id} className="flex justify-between gap-2 py-2"><span className="truncate">{fmtDate(e.date)} · {e.description || '—'}</span><span className="tabular">{money(e.amount)}</span></li>)}
            </ul>
            <div className="mt-2 flex justify-between border-t border-stone-200 pt-2 font-semibold dark:border-stone-700"><span>Total ({view.entries.length})</span><span className="tabular">{money(sum(view.entries))}</span></div>
          </>
        )}
      </Modal>
    </>
  )
}
