import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { serverTimestamp, writeBatch } from 'firebase/firestore'
import { Pencil, Plus, Search, Tag } from 'lucide-react'
import { db } from '../../lib/firebase'
import { addLog, farmDoc, friendlyError, newId } from '../../lib/db'
import { useApp } from '../../contexts/AppContext'
import { useHerd } from '../../contexts/HerdContext'
import { DEFAULT_ANIMAL_CATEGORIES, LOT_SEX_LABEL, SEX_LABEL, type Animal, type HerdLot } from '../../lib/herd'
import { Badge, Button, Card, Empty, PageHeader, Spinner, cx, useToast } from '../../components/ui'
import { NamedList } from '../../components/NamedList'
import { AnimalForm, LotForm } from '../../components/herd/HerdForms'

export async function seedAnimalCategories(farmId: string) {
  const b = writeBatch(db)
  for (const n of DEFAULT_ANIMAL_CATEGORIES) b.set(farmDoc(farmId, 'animalCategories', newId(farmId, 'animalCategories')), { name: n, active: true, createdAt: serverTimestamp() })
  addLog(b, farmId, 'categorias_animais_criadas', DEFAULT_ANIMAL_CATEGORIES.join(', '))
  await b.commit()
}

export default function LotsAnimals() {
  const { farm, canEdit } = useApp()
  const { lots, animals, categories, catName, lotName, ready } = useHerd()
  const toast = useToast()
  const [tab, setTab] = useState<'lotes' | 'animais' | 'categorias'>('lotes')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [lotForm, setLotForm] = useState<{ open: boolean; editing?: HerdLot | null }>({ open: false })
  const [animalForm, setAnimalForm] = useState<{ open: boolean; editing?: Animal | null }>({ open: false })
  const [seeding, setSeeding] = useState(false)

  const lotList = useMemo(() => lots.filter((l) => (showInactive || l.active) &&
    (!cat || l.categoryId === cat || Object.keys(l.balances ?? {}).some((k) => k.startsWith(cat + '|') && l.balances[k] > 0)) &&
    (!q || `${l.name} ${l.code ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [lots, q, cat, showInactive])
  const animalList = useMemo(() => animals.filter((a) => (showInactive || a.status === 'ativo') && (!cat || a.categoryId === cat) &&
    (!q || `${a.tag} ${a.name ?? ''} ${lotName(a.lotId)}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.tag.localeCompare(b.tag, 'pt-BR', { numeric: true })), [animals, q, cat, showInactive, lotName])

  if (!ready) return <Spinner />
  return (
    <>
      <PageHeader title="Animais e lotes" subtitle={`${lots.filter((l) => l.active).reduce((s, l) => s + l.count, 0)} cabeças em ${lots.filter((l) => l.active).length} lotes`}
        actions={canEdit && categories.length > 0 && <>
          <Button variant="secondary" onClick={() => setAnimalForm({ open: true })} disabled={!lots.some((l) => l.active)}><Tag className="size-4" />Animal individual</Button>
          <Button onClick={() => setLotForm({ open: true })}><Plus className="size-4" />Novo lote</Button>
        </>} />
      {categories.length === 0 && (
        <Card className="mb-5"><Empty title="Cadastre as categorias de animais para começar"
          text="Bezerros, Bezerras, Garrotes, Novilhas, Bois, Vacas, Touros e Outras — você poderá editar depois."
          action={canEdit && <Button loading={seeding} onClick={async () => { setSeeding(true); try { await seedAnimalCategories(farm!.id) } catch (e) { toast('error', friendlyError(e)) } finally { setSeeding(false) } }}>Criar categorias padrão</Button>} /></Card>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-stone-200 bg-white p-0.5 dark:border-stone-800 dark:bg-stone-900">
          {(['lotes', 'animais', 'categorias'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cx('rounded-md px-3 py-1.5 text-sm capitalize', tab === t ? 'bg-brand-600 text-white' : 'text-stone-600 dark:text-stone-300')}>{t}</button>
          ))}
        </div>
        {tab !== 'categorias' && <>
          <div className="relative min-w-40 flex-1"><Search className="absolute top-2.5 left-3 size-4 text-stone-400" /><input className="input pl-9" placeholder={tab === 'lotes' ? 'Buscar lote' : 'Buscar brinco, nome ou lote'} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className="input w-auto" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoria"><option value="">Todas as categorias</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <label className="flex items-center gap-1.5 text-sm text-stone-600 dark:text-stone-300"><input type="checkbox" className="accent-brand-600" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />{tab === 'lotes' ? 'Inativos' : 'Saídos'}</label>
        </>}
      </div>

      {tab === 'lotes' && (
        <Card>{lotList.length === 0 ? <Empty title="Nenhum lote" /> : (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {lotList.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-4 py-3">
                <Link to={`/rebanho/lotes/${l.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="truncate font-medium hover:underline">{l.name}</span>{l.code && <span className="text-xs text-stone-400">{l.code}</span>}{!l.active && <Badge>Inativo</Badge>}</div>
                  <div className="truncate text-xs text-stone-500">{catName(l.categoryId)} · {LOT_SEX_LABEL[l.sex]}{l.avgWeightKg ? ` · ${l.avgWeightKg.toLocaleString('pt-BR')} kg médio` : ''}</div>
                </Link>
                <span className="tabular text-right"><b className="text-lg">{l.count}</b><span className="block text-[11px] text-stone-500">cabeças</span></span>
                {canEdit && <Button size="sm" variant="ghost" onClick={() => setLotForm({ open: true, editing: l })} aria-label="Editar"><Pencil className="size-4" /></Button>}
              </li>
            ))}
          </ul>
        )}</Card>
      )}
      {tab === 'animais' && (
        <Card>{animalList.length === 0 ? <Empty title="Nenhum animal identificado" text="O controle por lote funciona sem cadastro individual. Use o cadastro individual para animais com brinco." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[560px]">
            <thead className="border-b border-stone-200 dark:border-stone-800"><tr><th className="th">Identificação</th><th className="th">Categoria</th><th className="th">Sexo</th><th className="th">Lote</th><th className="th text-right">Peso</th><th className="th">Situação</th>{canEdit && <th className="th" />}</tr></thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {animalList.map((a) => (
                <tr key={a.id}>
                  <td className="td font-medium"><Link to={`/rebanho/animais/${a.id}`} className="hover:underline">{a.tag}</Link>{a.name && <span className="text-stone-500"> · {a.name}</span>}</td>
                  <td className="td">{catName(a.categoryId)}</td><td className="td">{SEX_LABEL[a.sex]}</td><td className="td">{lotName(a.lotId)}</td>
                  <td className="td tabular text-right">{a.lastWeighing?.kg ?? a.weightKg ? `${(a.lastWeighing?.kg ?? a.weightKg)!.toLocaleString('pt-BR')} kg` : '—'}</td>
                  <td className="td"><Badge tone={a.status === 'ativo' ? 'green' : a.status === 'morto' ? 'red' : 'stone'}>{a.status}</Badge></td>
                  {canEdit && <td className="td text-right">{a.status === 'ativo' && <Button size="sm" variant="ghost" onClick={() => setAnimalForm({ open: true, editing: a })} aria-label="Editar"><Pencil className="size-4" /></Button>}</td>}
                </tr>
              ))}
            </tbody>
          </table></div>
        )}</Card>
      )}
      {tab === 'categorias' && <Card><NamedList collection="animalCategories" items={categories} noun="categoria" /></Card>}

      <LotForm open={lotForm.open} editing={lotForm.editing} onClose={() => setLotForm({ open: false })} />
      <AnimalForm open={animalForm.open} editing={animalForm.editing} onClose={() => setAnimalForm({ open: false })} />
    </>
  )
}
