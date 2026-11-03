import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getDocs, query, where } from 'firebase/firestore'
import { ArrowLeft, Pencil, Scale } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { useHerd } from '../../contexts/HerdContext'
import { farmCol, friendlyError } from '../../lib/db'
import { fmtDate, money, number } from '../../lib/format'
import { MOVEMENT_LABEL, SEX_LABEL, type HerdMovement } from '../../lib/herd'
import { Badge, Button, Card, Empty, ErrorBox, PageHeader, Spinner, Stat } from '../../components/ui'
import { AnimalForm } from '../../components/herd/HerdForms'

export default function AnimalDetail() {
  const { id } = useParams()
  const { farm, canEdit } = useApp()
  const { animals, catName, lotName, vaccinations, ready } = useHerd()
  const a = animals.find((x) => x.id === id)
  const [movs, setMovs] = useState<HerdMovement[] | null>(null)
  const [err, setErr] = useState('')
  const [edit, setEdit] = useState(false)
  useEffect(() => {
    if (!id) return
    getDocs(query(farmCol(farm!.id, 'herdMovements'), where('animalIds', 'array-contains', id)))
      .then((s) => setMovs(s.docs.map((d) => ({ id: d.id, ...d.data() }) as HerdMovement).sort((x, y) => x.date.localeCompare(y.date)))).catch((e) => setErr(friendlyError(e)))
  }, [farm, id, a?.lotId, a?.status])
  if (!ready) return <Spinner />
  if (!a) return <Empty title="Animal não encontrado" action={<Link to="/rebanho/lotes"><Button variant="secondary">Voltar</Button></Link>} />
  // Vacinas do(s) lote(s) por onde o animal passou, a partir da entrada.
  const lotIds = new Set([a.lotId, ...(movs ?? []).map((m) => m.lotId)])
  const vacc = vaccinations.filter((v) => v.status === 'aplicada' && lotIds.has(v.lotId) && v.date >= a.entryDate && (!v.categoryId || v.categoryId === a.categoryId)).sort((x, y) => y.date.localeCompare(x.date))
  return (
    <>
      <Link to="/rebanho/lotes" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 hover:underline"><ArrowLeft className="size-4" />Animais e lotes</Link>
      <PageHeader title={`${a.tag}${a.name ? ` · ${a.name}` : ''}`} subtitle={`${catName(a.categoryId)} · ${SEX_LABEL[a.sex]}${a.breed ? ` · ${a.breed}` : ''} · lote ${lotName(a.lotId)}`}
        actions={<><Badge tone={a.status === 'ativo' ? 'green' : 'stone'}>{a.status}</Badge>{canEdit && a.status === 'ativo' && <Button variant="secondary" onClick={() => setEdit(true)}><Pencil className="size-4" />Editar</Button>}
          <Link to={`/rebanho/pesagem/animal/${a.id}`}><Button variant="secondary"><Scale className="size-4" />Evolução de peso</Button></Link></>} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Entrada" value={fmtDate(a.entryDate)} icon={<span>📅</span>} tone="stone" sub={`Origem: ${a.origin}`} />
        <Stat label="Peso atual" value={a.lastWeighing?.kg ?? a.weightKg ? `${number((a.lastWeighing?.kg ?? a.weightKg)!)} kg` : '—'} icon={<Scale className="size-4" />} sub={a.lastWeighing ? `pesagem ${fmtDate(a.lastWeighing.date)}` : undefined} />
        <Stat label="Aquisição" value={a.acquisitionCost ? money(a.acquisitionCost) : '—'} icon={<span>R$</span>} tone="earth" sub={a.sellerName ? `de ${a.sellerName}` : undefined} />
        <Stat label="Nascimento" value={fmtDate(a.birthDate)} icon={<span>🐄</span>} tone="stone" />
      </div>
      {a.notes && <p className="mb-4 whitespace-pre-wrap text-sm">{a.notes}</p>}
      {err && <ErrorBox>{err}</ErrorBox>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Movimentações (entrada, transferências, saída)">{!movs ? <Spinner /> : movs.length === 0 ? <Empty title="Animal identificado sem movimentação própria" text="Foi identificado dentro do saldo já existente do lote." /> : (
          <ul className="divide-y divide-stone-100 text-sm dark:divide-stone-800">{movs.map((m) => <li key={m.id} className="flex justify-between px-4 py-2"><span>{fmtDate(m.date)} · {MOVEMENT_LABEL[m.type]}</span><span className="text-stone-500">{lotName(m.lotId)}</span></li>)}</ul>
        )}</Card>
        <Card title="Histórico de vacinação (lote)">{vacc.length === 0 ? <Empty title="Nenhuma vacina registrada" /> : (
          <ul className="divide-y divide-stone-100 text-sm dark:divide-stone-800">{vacc.map((v) => <li key={v.id} className="flex justify-between px-4 py-2"><span>{fmtDate(v.date)} · <b>{v.vaccine}</b></span><span className="text-stone-500">{lotName(v.lotId)}</span></li>)}</ul>
        )}</Card>
      </div>
      <AnimalForm open={edit} editing={a} onClose={() => setEdit(false)} />
    </>
  )
}
