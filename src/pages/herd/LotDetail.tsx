import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Repeat } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { useHerd } from '../../contexts/HerdContext'
import { friendlyError, newId } from '../../lib/db'
import { changeCategory, fetchMovements, fetchOps } from '../../lib/herdDb'
import { fmtDate, money, number, today } from '../../lib/format'
import { LOT_SEX_LABEL, MOVEMENT_LABEL, parseKey, type HerdMovement } from '../../lib/herd'
import { Badge, Button, Card, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, Stat, cx, useToast } from '../../components/ui'
import { LotForm, herdErr } from '../../components/herd/HerdForms'
import { LotKeyPicker, emptyExit, readExit } from '../../components/herd/LotKeyPicker'
import { Beef, Scale, Syringe } from 'lucide-react'

type Rec = Record<string, unknown> & { id: string; date: string }

function CategoryChange({ lotId, open, onClose }: { lotId: string; open: boolean; onClose: () => void }) {
  const { farm } = useApp()
  const { lots, categories, identified } = useHerd()
  const toast = useToast()
  const [f, setF] = useState({ opId: '', date: today(), sel: { ...emptyExit(), lotId }, to: '', notes: '' })
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) { setF({ opId: newId(farm!.id, 'categoryChanges'), date: today(), sel: { ...emptyExit(), lotId }, to: '', notes: '' }); setErr('') } }, [open, lotId, farm])
  const lot = lots.find((l) => l.id === lotId)
  async function save() {
    const idc = f.sel.key ? identified(lotId, f.sel.key).length : 0
    const r = readExit(f.sel, idc, lot?.balances?.[f.sel.key] ?? 0)
    if ('error' in r) return setErr(r.error!)
    if (!f.to || f.to === r.data!.categoryId) return setErr('Escolha uma nova categoria diferente da atual.')
    setSaving(true); setErr('')
    try {
      await changeCategory(farm!.id, f.opId, { date: f.date, lotId, sex: r.data!.sex, fromCategoryId: r.data!.categoryId, toCategoryId: f.to, anonQty: r.data!.anonQty, animalIds: r.data!.animalIds, notes: f.notes.trim() }, idc)
      toast('success', 'Mudança de categoria registrada. O total do lote não mudou.'); onClose()
    } catch (e) { setErr(herdErr(e)) } finally { setSaving(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Mudar categoria (ex.: bezerros → garrotes)" wide
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Registrar</Button></>}>
      <div className="space-y-4">
        <Field label="Data"><input type="date" className="input w-auto" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <LotKeyPicker label="Lote" value={f.sel} onChange={(sel) => setF({ ...f, sel: { ...sel, lotId } })} />
        <Field label="Nova categoria"><select className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })}><option value="">Selecione…</option>{categories.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Observações"><input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        {err && <ErrorBox>{err}</ErrorBox>}
      </div>
    </Modal>
  )
}

export default function LotDetail() {
  const { id } = useParams()
  const { farm, canEdit } = useApp()
  const { lots, catName, lotName, keyLabel, identified, vaccinations, ready } = useHerd()
  const lot = lots.find((l) => l.id === id)
  const [tab, setTab] = useState('movimentos')
  const [data, setData] = useState<{ movs: HerdMovement[]; purchases: Rec[]; sales: Rec[]; deaths: Rec[]; transfers: Rec[]; weighings: Rec[] } | null>(null)
  const [err, setErr] = useState('')
  const [edit, setEdit] = useState(false)
  const [change, setChange] = useState(false)
  useEffect(() => {
    if (!id) return
    const f = farm!.id
    Promise.all([fetchMovements(f, { lotId: id }), fetchOps<Rec>(f, 'purchases', 'lotId', id), fetchOps<Rec>(f, 'sales', 'lotId', id), fetchOps<Rec>(f, 'mortalityRecords', 'lotId', id),
      fetchOps<Rec>(f, 'herdTransfers', 'lotId', id), fetchOps<Rec>(f, 'herdTransfers', 'toLotId', id), fetchOps<Rec>(f, 'weighings', 'lotId', id)])
      .then(([movs, purchases, sales, deaths, t1, t2, weighings]) => setData({ movs: movs.reverse(), purchases, sales, deaths, transfers: [...t1, ...t2].sort((a, b) => b.date.localeCompare(a.date)), weighings: weighings.filter((w) => !w.supersededBy).sort((a, b) => b.date.localeCompare(a.date)) }))
      .catch((e) => setErr(friendlyError(e)))
  }, [farm, id, lot?.lastMovementId])
  if (!ready) return <Spinner />
  if (!lot) return <Empty title="Lote não encontrado" action={<Link to="/rebanho/lotes"><Button variant="secondary">Voltar</Button></Link>} />
  const vacc = vaccinations.filter((v) => v.lotId === lot.id).sort((a, b) => b.date.localeCompare(a.date))
  const ids = identified(lot.id)
  const TABS: [string, string, number][] = [['movimentos', 'Movimentações', data?.movs.length ?? 0], ['compras', 'Compras', data?.purchases.length ?? 0], ['vendas', 'Vendas', data?.sales.length ?? 0],
    ['mortes', 'Mortes', data?.deaths.length ?? 0], ['transf', 'Transferências', data?.transfers.length ?? 0], ['vacinas', 'Vacinações', vacc.length], ['pesagens', 'Pesagens', data?.weighings.length ?? 0], ['animais', 'Animais identificados', ids.length]]

  return (
    <>
      <Link to="/rebanho/lotes" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 hover:underline"><ArrowLeft className="size-4" />Animais e lotes</Link>
      <PageHeader title={lot.name} subtitle={`${lot.code ? lot.code + ' · ' : ''}${catName(lot.categoryId)} · ${LOT_SEX_LABEL[lot.sex]}${lot.formedAt ? ` · formado em ${fmtDate(lot.formedAt)}` : ''}${lot.origin ? ` · origem: ${lot.origin}` : ''}`}
        actions={canEdit && <><Button variant="secondary" onClick={() => setChange(true)} disabled={!lot.count}><Repeat className="size-4" />Mudar categoria</Button><Button variant="secondary" onClick={() => setEdit(true)}><Pencil className="size-4" />Editar</Button></>} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Quantidade atual" value={`${lot.count} cab.`} icon={<Beef className="size-4" />} />
        <Stat label="Peso médio atual" value={lot.avgWeightKg ? `${number(lot.avgWeightKg)} kg` : '—'} icon={<Scale className="size-4" />} tone="stone" sub={lot.avgWeightAt ? `referência ${fmtDate(lot.avgWeightAt)}` : undefined} />
        <Stat label="Vacinações" value={String(vacc.filter((v) => v.status === 'aplicada').length)} icon={<Syringe className="size-4" />} tone="earth" />
        <div className="card p-4 text-sm"><div className="mb-1 text-xs font-medium text-stone-500">Composição</div>
          {Object.entries(lot.balances ?? {}).filter(([, q]) => q).map(([k, q]) => <div key={k} className="flex justify-between"><span>{keyLabel(k)}</span><b className="tabular">{q}</b></div>)}
          {!lot.count && <span className="text-stone-400">Vazio</span>}</div>
      </div>
      {(lot.sellerName || lot.buyerName || lot.notes) && <p className="mb-4 text-sm text-stone-600 dark:text-stone-300">{lot.sellerName && <>Vendedor: {lot.sellerName}. </>}{lot.buyerName && <>Responsável pela aquisição: {lot.buyerName}. </>}{lot.notes}</p>}
      <div className="mb-3 flex gap-1 overflow-x-auto">
        {TABS.map(([k, l, n]) => <button key={k} onClick={() => setTab(k)} className={cx('shrink-0 rounded-full border px-3 py-1 text-sm', tab === k ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-300 dark:border-stone-700')}>{l} <span className="opacity-70">{n}</span></button>)}
      </div>
      {err && <ErrorBox>{err}</ErrorBox>}
      <Card>
        {!data ? <Spinner /> : (
          <div className="overflow-x-auto">
            {tab === 'movimentos' && (data.movs.length ? <table className="w-full min-w-[560px]"><thead className="border-b border-stone-200 dark:border-stone-800"><tr><th className="th">Data</th><th className="th">Tipo</th><th className="th">Categoria</th><th className="th text-right">Quantidade</th><th className="th">Obs.</th></tr></thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">{data.movs.map((m) => <tr key={m.id}><td className="td tabular">{fmtDate(m.date)}</td><td className="td">{MOVEMENT_LABEL[m.type]}</td>
                <td className="td">{m.key2 ? `${catName(parseKey(m.key1).categoryId)} → ${catName(parseKey(m.key2).categoryId)}` : keyLabel(m.key1)}</td>
                <td className={cx('td tabular text-right font-medium', m.total > 0 ? 'text-brand-700 dark:text-brand-300' : m.total < 0 ? 'text-red-600' : '')}>{m.key2 ? `${-m.qty1} cab.` : m.total > 0 ? `+${m.total}` : m.total}</td><td className="td text-stone-500">{m.note}</td></tr>)}</tbody></table> : <Empty title="Sem movimentações" />)}
            {tab === 'compras' && (data.purchases.length ? <table className="w-full"><tbody className="divide-y divide-stone-100 dark:divide-stone-800">{data.purchases.map((p) => <tr key={p.id}><td className="td tabular">{fmtDate(p.date)}</td><td className="td">{String(p.sellerName)}</td><td className="td tabular">{String(p.qty)} cab.</td><td className="td tabular">{number(Number(p.totalKg))} kg</td><td className="td tabular text-right">{money(Number(p.amount))}</td></tr>)}</tbody></table> : <Empty title="Sem compras" />)}
            {tab === 'vendas' && (data.sales.length ? <table className="w-full"><tbody className="divide-y divide-stone-100 dark:divide-stone-800">{data.sales.map((p) => <tr key={p.id}><td className="td tabular">{fmtDate(p.date)}</td><td className="td">{String(p.buyerName)}</td><td className="td tabular">{String(p.qty)} cab.</td><td className="td tabular">bruto {money(Number(p.gross))}</td><td className="td tabular text-right">líquido {money(Number(p.net))}</td></tr>)}</tbody></table> : <Empty title="Sem vendas" />)}
            {tab === 'mortes' && (data.deaths.length ? <table className="w-full"><tbody className="divide-y divide-stone-100 dark:divide-stone-800">{data.deaths.map((p) => <tr key={p.id}><td className="td tabular">{fmtDate(p.date)}</td><td className="td tabular">{String(p.qty)} cab.</td><td className="td">{String(p.cause)}</td></tr>)}</tbody></table> : <Empty title="Sem mortes" />)}
            {tab === 'transf' && (data.transfers.length ? <table className="w-full"><tbody className="divide-y divide-stone-100 dark:divide-stone-800">{data.transfers.map((p) => <tr key={p.id}><td className="td tabular">{fmtDate(p.date)}</td><td className="td">{p.lotId === lot.id ? `→ ${p.external ? 'outra fazenda' : lotName(String(p.toLotId))}` : `← ${p.direction === 'entrada' ? 'outra fazenda' : lotName(String(p.lotId))}`}</td><td className="td tabular">{String(p.qty)} cab.</td><td className="td">{String(p.reason)}</td></tr>)}</tbody></table> : <Empty title="Sem transferências" />)}
            {tab === 'vacinas' && (vacc.length ? <table className="w-full"><tbody className="divide-y divide-stone-100 dark:divide-stone-800">{vacc.map((v) => <tr key={v.id}><td className="td tabular">{fmtDate(v.date)}</td><td className="td font-medium">{v.vaccine}</td><td className="td tabular">{v.qty} cab.</td><td className="td"><Badge tone={v.status === 'aplicada' ? 'green' : 'amber'}>{v.status}</Badge></td><td className="td">{v.boosterDate ? `reforço ${fmtDate(v.boosterDate)}` : ''}</td></tr>)}</tbody></table> : <Empty title="Sem vacinações" />)}
            {tab === 'pesagens' && (data.weighings.length ? <table className="w-full"><tbody className="divide-y divide-stone-100 dark:divide-stone-800">{data.weighings.map((w) => <tr key={w.id}><td className="td tabular">{fmtDate(w.date)}</td><td className="td">{w.mode === 'individual' ? 'Individual' : 'Coletiva'}</td><td className="td tabular">{String(w.qty)} cab.</td><td className="td tabular text-right">{number(Number(w.avgKg))} kg {w.mode === 'individual' ? '' : 'médio'}</td></tr>)}</tbody></table> : <Empty title="Sem pesagens" />)}
            {tab === 'animais' && (ids.length ? <ul className="divide-y divide-stone-100 dark:divide-stone-800">{ids.map((a) => <li key={a.id} className="px-4 py-2 text-sm"><Link className="font-medium hover:underline" to={`/rebanho/animais/${a.id}`}>{a.tag}</Link> <span className="text-stone-500">{catName(a.categoryId)}</span></li>)}</ul> : <Empty title="Nenhum animal identificado neste lote" />)}
          </div>
        )}
      </Card>
      <LotForm open={edit} editing={lot} onClose={() => setEdit(false)} />
      <CategoryChange lotId={lot.id} open={change} onClose={() => setChange(false)} />
    </>
  )
}
