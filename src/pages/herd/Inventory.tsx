import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ClipboardCheck } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { useHerd } from '../../contexts/HerdContext'
import { friendlyError, newId } from '../../lib/db'
import { confirmPhysicalCount, fetchMovements, type CountItem } from '../../lib/herdDb'
import { today } from '../../lib/format'
import { balancesFromMovements, inventoryTable, reconcile, type HerdMovement, type Sex } from '../../lib/herd'
import { Badge, Button, Card, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, cx, useToast } from '../../components/ui'
import { herdErr } from '../../components/herd/HerdForms'

export default function Inventory() {
  const { farm, canEdit } = useApp()
  const { lots, activeLots, catName, lotName, keyLabel, categories, ready } = useHerd()
  const toast = useToast()
  const t = today()
  const [tab, setTab] = useState<'atual' | 'data' | 'fisico' | 'conciliar'>('atual')
  const [movs, setMovs] = useState<HerdMovement[] | null>(null)
  const [err, setErr] = useState('')
  const [date, setDate] = useState(t)
  const [flt, setFlt] = useState({ lotId: '', categoryId: '', sex: '' as Sex | '' })
  useEffect(() => { fetchMovements(farm!.id).then(setMovs).catch((e) => setErr(friendlyError(e))) }, [farm, lots])

  const current = useMemo(() => Object.fromEntries(lots.map((l) => [l.id, l.balances ?? {}])), [lots])
  const source = tab === 'data' && movs ? balancesFromMovements(movs, date) : current
  const rows = inventoryTable(source, lotName).filter((r) => (!flt.lotId || r.lotId === flt.lotId) && (!flt.categoryId || r.categoryId === flt.categoryId))
    .map((r) => (flt.sex === 'M' ? { ...r, females: 0, total: r.males } : flt.sex === 'F' ? { ...r, males: 0, total: r.females } : r)).filter((r) => r.total)
  const tot = rows.reduce((s, r) => ({ m: s.m + r.males, f: s.f + r.females, t: s.t + r.total }), { m: 0, f: 0, t: 0 })
  const issues = movs ? reconcile(lots, movs) : []

  /* Conferência física */
  const [count, setCount] = useState<Record<string, { found: string; just: string }>>({})
  const [meta, setMeta] = useState({ invId: newId(farm!.id, 'herdInventories'), date: t, responsible: '', notes: '' })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const countRows = activeLots.flatMap((l) => Object.entries(l.balances ?? {}).filter(([, q]) => q > 0).map(([k, q]) => ({ lotId: l.id, key: k, registered: q })))
  const items: CountItem[] = countRows.filter((r) => count[`${r.lotId}::${r.key}`]?.found?.trim()).map((r) => {
    const c = count[`${r.lotId}::${r.key}`]
    return { lotId: r.lotId, key: r.key, registered: r.registered, found: Number(c.found), justification: c.just.trim() }
  })
  const diffs = items.filter((i) => i.found !== i.registered)

  async function confirmCount() {
    if (diffs.some((d) => !d.justification)) return setErr('Informe a justificativa de todas as diferenças.')
    if (!meta.responsible.trim()) return setErr('Informe o responsável pela conferência.')
    setSaving(true); setErr('')
    try {
      await confirmPhysicalCount(farm!.id, meta.invId, { date: meta.date, responsible: meta.responsible.trim(), notes: meta.notes.trim() }, items)
      toast('success', diffs.length ? `Inventário confirmado com ${diffs.length} ajuste(s).` : 'Inventário confirmado sem diferenças.')
      setConfirmOpen(false); setCount({}); setMeta({ ...meta, invId: newId(farm!.id, 'herdInventories') })
    } catch (e) { setErr(herdErr(e)) } finally { setSaving(false) }
  }

  if (!ready) return <Spinner />
  return (
    <>
      <PageHeader title="Inventário do rebanho" subtitle={farm!.name} />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="flex rounded-lg border border-stone-200 bg-white p-0.5 dark:border-stone-800 dark:bg-stone-900">
          {([['atual', 'Atual'], ['data', 'Em uma data'], ['fisico', 'Conferência física'], ['conciliar', 'Reconciliação']] as const).map(([k, l]) =>
            <button key={k} onClick={() => setTab(k)} className={cx('rounded-md px-3 py-1.5 text-sm', tab === k ? 'bg-brand-600 text-white' : 'text-stone-600 dark:text-stone-300')}>{l}</button>)}
        </div>
        {(tab === 'atual' || tab === 'data') && <>
          {tab === 'data' && <input type="date" className="input w-auto" value={date} max={t} onChange={(e) => setDate(e.target.value)} aria-label="Data" />}
          <select className="input w-auto" value={flt.lotId} onChange={(e) => setFlt({ ...flt, lotId: e.target.value })}><option value="">Todos os lotes</option>{lots.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          <select className="input w-auto" value={flt.categoryId} onChange={(e) => setFlt({ ...flt, categoryId: e.target.value })}><option value="">Todas as categorias</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select className="input w-auto" value={flt.sex} onChange={(e) => setFlt({ ...flt, sex: e.target.value as Sex | '' })}><option value="">Ambos os sexos</option><option value="M">Machos</option><option value="F">Fêmeas</option></select>
        </>}
      </div>
      {err && <div className="mb-3"><ErrorBox>{err}</ErrorBox></div>}

      {(tab === 'atual' || tab === 'data') && (
        <Card title={tab === 'data' ? `Saldo reconstruído pelas movimentações até ${date.split('-').reverse().join('/')}` : 'Saldo atual por lote e categoria'}>
          {tab === 'data' && !movs ? <Spinner /> : rows.length === 0 ? <Empty title="Sem animais para os filtros" /> : (
            <div className="overflow-x-auto"><table className="w-full">
              <thead className="border-b border-stone-200 dark:border-stone-800"><tr><th className="th">Lote</th><th className="th">Categoria</th><th className="th text-right">Machos</th><th className="th text-right">Fêmeas</th><th className="th text-right">Total</th></tr></thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">{rows.map((r) => <tr key={r.lotId + r.categoryId}><td className="td">{r.lotName}</td><td className="td">{catName(r.categoryId)}</td><td className="td tabular text-right">{r.males}</td><td className="td tabular text-right">{r.females}</td><td className="td tabular text-right font-medium">{r.total}</td></tr>)}</tbody>
              <tfoot className="border-t-2 border-stone-300 bg-stone-50 font-semibold dark:border-stone-700 dark:bg-stone-800/50"><tr><td className="td" colSpan={2}>TOTAL GERAL</td><td className="td tabular text-right">{tot.m}</td><td className="td tabular text-right">{tot.f}</td><td className="td tabular text-right">{tot.t}</td></tr></tfoot>
            </table></div>
          )}
        </Card>
      )}

      {tab === 'fisico' && (
        <Card title="Conferência física" action={<span className="text-xs text-stone-500">O saldo só muda após sua confirmação</span>}>
          <div className="grid gap-3 border-b border-stone-200 p-4 sm:grid-cols-3 dark:border-stone-800">
            <Field label="Data da contagem"><input type="date" className="input" value={meta.date} max={t} onChange={(e) => setMeta({ ...meta, date: e.target.value })} /></Field>
            <Field label="Responsável *"><input className="input" value={meta.responsible} onChange={(e) => setMeta({ ...meta, responsible: e.target.value })} /></Field>
            <Field label="Observações"><input className="input" value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} /></Field>
          </div>
          {countRows.length === 0 ? <Empty title="Nenhum saldo para conferir" /> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
              <thead className="border-b border-stone-200 dark:border-stone-800"><tr><th className="th">Lote</th><th className="th">Categoria</th><th className="th text-right">Registrado</th><th className="th w-28">Encontrado</th><th className="th text-right">Diferença</th><th className="th">Justificativa</th></tr></thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">{countRows.map((r) => {
                const k = `${r.lotId}::${r.key}`, c = count[k] ?? { found: '', just: '' }
                const diff = c.found.trim() ? Number(c.found) - r.registered : null
                return (
                  <tr key={k}>
                    <td className="td">{lotName(r.lotId)}</td><td className="td">{keyLabel(r.key)}</td><td className="td tabular text-right">{r.registered}</td>
                    <td className="td"><input className="input py-1 text-right" inputMode="numeric" value={c.found} onChange={(e) => setCount({ ...count, [k]: { ...c, found: e.target.value.replace(/\D/g, '') } })} /></td>
                    <td className={cx('td tabular text-right font-medium', diff ? (diff > 0 ? 'text-brand-700' : 'text-red-600') : '')}>{diff == null ? '—' : diff > 0 ? `+${diff}` : diff}</td>
                    <td className="td">{diff ? <input className="input py-1" value={c.just} placeholder="Obrigatória" onChange={(e) => setCount({ ...count, [k]: { ...c, just: e.target.value } })} /> : ''}</td>
                  </tr>)
              })}</tbody>
            </table></div>
          )}
          {canEdit && <div className="flex items-center justify-between border-t border-stone-200 p-3 text-sm dark:border-stone-800">
            <span>{items.length} contagem(ns), {diffs.length} diferença(s)</span>
            <Button disabled={!items.length} onClick={() => { setErr(''); setConfirmOpen(true) }}><ClipboardCheck className="size-4" />Revisar e confirmar</Button>
          </div>}
        </Card>
      )}

      {tab === 'conciliar' && (
        <Card title="Saldos armazenados × histórico de movimentações">
          {!movs ? <Spinner /> : issues.length === 0 ? (
            <Empty icon={<CheckCircle2 className="size-5 text-brand-600" />} title="Tudo conciliado" text={`${movs.length} movimentações conferidas: os saldos dos lotes correspondem exatamente ao histórico.`} />
          ) : (
            <ul className="divide-y divide-stone-100 text-sm dark:divide-stone-800">{issues.map((i) => <li key={i.lotId + i.key} className="flex justify-between px-4 py-2"><span>{lotName(i.lotId)} · {keyLabel(i.key)}</span><span><Badge tone="red">armazenado {i.stored} × histórico {i.ledger}</Badge></span></li>)}</ul>
          )}
        </Card>
      )}

      <Modal open={confirmOpen} onClose={() => !saving && setConfirmOpen(false)} title="Confirmar inventário físico" wide
        footer={<><Button variant="secondary" disabled={saving} onClick={() => setConfirmOpen(false)}>Voltar</Button><Button loading={saving} onClick={confirmCount}>Confirmar e ajustar saldos</Button></>}>
        <div className="space-y-3 text-sm">
          {diffs.length === 0 ? <p>Nenhuma diferença encontrada. A conferência será registrada sem ajustes.</p> : <>
            <p>Os seguintes ajustes serão registrados como movimentações de inventário, com antes/depois e justificativa:</p>
            <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
              {diffs.map((d) => <li key={d.lotId + d.key} className="px-3 py-2"><b>{lotName(d.lotId)}</b> · {keyLabel(d.key)}: {d.registered} → {d.found} <span className="text-stone-500">({d.justification || 'sem justificativa'})</span></li>)}
            </ul>
          </>}
          {err && <ErrorBox>{err}</ErrorBox>}
        </div>
      </Modal>
    </>
  )
}
