import { useMemo, useState } from 'react'
import { Pencil } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { useHerd } from '../../contexts/HerdContext'
import { friendlyError } from '../../lib/db'
import { fmtDate, number, today } from '../../lib/format'
import { gmd, type Weighing, type WeighingSession } from '../../lib/weighing'
import { correctWeighing } from '../../lib/weighingDb'
import { Badge, Button, Card, Empty, ErrorBox, Field, Modal, PageHeader, cx, useToast } from '../../components/ui'
import { useWeigh } from './WeighContext'
import { gainTone } from './NewWeighing'

export default function WeighHistory() {
  const { farm, canEdit } = useApp()
  const { lots, animals, categories, lotName, catName } = useHerd()
  const { sessions, weighings, reload } = useWeigh()
  const toast = useToast()
  const t = today()
  const [f, setF] = useState({ start: `${t.slice(0, 4)}-01-01`, end: t, lotId: '', animalId: '', categoryId: '', sex: '', mode: '' })
  const [open, setOpen] = useState<WeighingSession | null>(null)
  const [fix, setFix] = useState<{ w: Weighing; kg: string; reason: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const recsBySession = useMemo(() => { const m = new Map<string, Weighing[]>(); for (const w of weighings) m.set(w.sessionId, [...(m.get(w.sessionId) ?? []), w]); return m }, [weighings])
  const list = sessions.filter((s) => s.date >= f.start && s.date <= f.end && (!f.mode || s.mode === f.mode) && (() => {
    const recs = recsBySession.get(s.id) ?? []
    if (f.lotId && s.lotId !== f.lotId && !recs.some((r) => r.lotId === f.lotId)) return false
    if (f.animalId && !recs.some((r) => r.animalId === f.animalId)) return false
    if (f.categoryId && s.categoryId !== f.categoryId && !recs.some((r) => r.categoryId === f.categoryId)) return false
    if (f.sex && !recs.some((r) => animals.find((a) => a.id === r.animalId)?.sex === f.sex)) return false
    return true
  })())
  const recs = open ? (recsBySession.get(open.id) ?? []).sort((a, b) => (a.tag ?? '').localeCompare(b.tag ?? '', 'pt-BR', { numeric: true })) : []

  async function applyFix() {
    if (!fix) return
    const kg = Number(fix.kg.replace(',', '.'))
    if (!(kg > 0 && kg < 3000)) return setErr('Peso inválido.')
    if (fix.reason.trim().length < 3) return setErr('Informe o motivo da correção.')
    setBusy(true); setErr('')
    try {
      await correctWeighing(farm!.id, fix.w, kg, fix.reason.trim(), fix.w.prevKg, fix.w.prevDate, fix.w.mode === 'individual' ? gmd(kg, fix.w.date, fix.w.prevKg, fix.w.prevDate) : null)
      toast('success', 'Correção registrada. O valor original foi preservado no histórico.')
      setFix(null); reload()
    } catch (e) { setErr(friendlyError(e)) } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title="Histórico de pesagens" subtitle={`${list.length} sessão(ões)`} />
      <div className="mb-4 flex flex-wrap gap-2">
        <input type="date" className="input w-auto" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} aria-label="Início" />
        <input type="date" className="input w-auto" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} aria-label="Fim" />
        <select className="input w-auto" value={f.lotId} onChange={(e) => setF({ ...f, lotId: e.target.value })}><option value="">Todos os lotes</option>{lots.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        <select className="input w-auto" value={f.animalId} onChange={(e) => setF({ ...f, animalId: e.target.value })}><option value="">Todos os animais</option>{animals.map((a) => <option key={a.id} value={a.id}>{a.tag}</option>)}</select>
        <select className="input w-auto" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}><option value="">Todas as categorias</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="input w-auto" value={f.sex} onChange={(e) => setF({ ...f, sex: e.target.value })}><option value="">Ambos os sexos</option><option value="M">Machos</option><option value="F">Fêmeas</option></select>
        <select className="input w-auto" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="">Individual e coletiva</option><option value="individual">Individual</option><option value="collective">Coletiva</option></select>
      </div>
      <Card>{list.length === 0 ? <Empty title="Nenhuma pesagem no período" /> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[680px]">
          <thead className="border-b border-stone-200 dark:border-stone-800"><tr>{['Data', 'Tipo', 'Lote', 'Qtd. pesada', 'Peso médio', 'Peso total', 'GMD médio', 'Responsável'].map((x) => <th key={x} className="th">{x}</th>)}</tr></thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-800">{list.map((s) => (
            <tr key={s.id} className="cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/40" onClick={() => setOpen(s)}>
              <td className="td tabular">{fmtDate(s.date)}</td><td className="td"><Badge tone={s.mode === 'individual' ? 'green' : 'blue'}>{s.mode === 'individual' ? 'Individual' : 'Coletiva'}</Badge>{s.source === 'importacao' && <span className="ml-1 text-xs text-stone-400">importada</span>}</td>
              <td className="td">{s.lotId ? lotName(s.lotId) : 'Vários'}</td><td className="td tabular">{s.count}</td><td className="td tabular">{number(s.avgKg)} kg</td><td className="td tabular">{number(s.totalKg)} kg</td>
              <td className={cx('td tabular', gainTone(s.gmdAvg))}>{s.gmdAvg == null ? '—' : `${s.gmdAvg.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg/dia`}</td><td className="td">{s.responsible}</td>
            </tr>))}</tbody>
        </table></div>
      )}</Card>

      <Modal open={!!open} onClose={() => setOpen(null)} wide title={open ? `Pesagem ${open.mode === 'individual' ? 'individual' : 'coletiva'} de ${fmtDate(open.date)}` : ''}>
        {open && <div className="space-y-3 text-sm">
          <p className="text-stone-500">{open.lotId ? `Lote ${lotName(open.lotId)} · ` : ''}{open.responsible}{open.location ? ` · ${open.location}` : ''}{open.notes ? ` · ${open.notes}` : ''}</p>
          <div className="overflow-x-auto"><table className="w-full">
            <thead className="border-b border-stone-200 dark:border-stone-800"><tr>{(open.mode === 'individual' ? ['Animal', 'Anterior', 'Atual', 'Ganho', 'GMD', ''] : ['Lote', 'Categoria', 'Qtd.', 'Total', 'Médio', 'Método', '']).map((x) => <th key={x} className="th">{x}</th>)}</tr></thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">{recs.map((w) => (
              <tr key={w.id} className={w.supersededBy ? 'text-stone-400 line-through' : ''}>
                {open.mode === 'individual' ? <>
                  <td className="td">{w.tag}{!w.animalId && <Badge tone="amber">sem cadastro</Badge>}{w.correctsId && <Badge tone="blue">correção</Badge>}</td>
                  <td className="td tabular">{w.prevKg ? `${number(w.prevKg)} kg` : '—'}</td><td className="td tabular">{number(w.avgKg)} kg</td>
                  <td className={cx('td tabular', gainTone(w.gainKg))}>{w.gainKg == null ? '—' : `${number(w.gainKg)} kg`}</td>
                  <td className={cx('td tabular', gainTone(w.gmd))}>{w.gmd == null ? '—' : w.gmd.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</td>
                </> : <>
                  <td className="td">{lotName(w.lotId)}{w.correctsId && <Badge tone="blue">correção</Badge>}</td><td className="td">{w.categoryId ? catName(w.categoryId) : 'Todas'}</td><td className="td tabular">{w.qty}</td>
                  <td className="td tabular">{number(w.totalKg)} kg</td><td className="td tabular">{number(w.avgKg)} kg</td><td className="td">{w.method === 'balanca_coletiva' ? 'Balança coletiva' : 'Média informada'}</td>
                </>}
                <td className="td text-right">{canEdit && !w.supersededBy && <Button size="sm" variant="ghost" onClick={() => { setErr(''); setFix({ w, kg: String(w.avgKg).replace('.', ','), reason: '' }) }} aria-label="Corrigir"><Pencil className="size-4" /></Button>}
                  {w.correctionReason && <span className="block text-xs text-stone-500 no-underline">Motivo: {w.correctionReason}</span>}</td>
              </tr>))}</tbody>
          </table></div>
          <p className="text-xs text-stone-500">Valores riscados foram substituídos por uma correção; permanecem no histórico para rastreabilidade.</p>
        </div>}
      </Modal>
      <Modal open={!!fix} onClose={() => !busy && setFix(null)} title="Corrigir pesagem"
        footer={<><Button variant="secondary" disabled={busy} onClick={() => setFix(null)}>Cancelar</Button><Button loading={busy} onClick={applyFix}>Registrar correção</Button></>}>
        {fix && <div className="space-y-3">
          <p className="text-sm">{fix.w.tag ?? lotName(fix.w.lotId)} em {fmtDate(fix.w.date)}: valor registrado <b>{number(fix.w.avgKg)} kg</b>{fix.w.mode === 'collective' ? ' (médio)' : ''}.</p>
          <Field label={fix.w.mode === 'collective' ? 'Peso médio correto (kg)' : 'Peso correto (kg)'}><input className="input" inputMode="decimal" value={fix.kg} onChange={(e) => setFix({ ...fix, kg: e.target.value })} /></Field>
          <Field label="Motivo da correção *"><input className="input" value={fix.reason} onChange={(e) => setFix({ ...fix, reason: e.target.value })} maxLength={300} placeholder="Ex.: erro de digitação" /></Field>
          {err && <ErrorBox>{err}</ErrorBox>}
        </div>}
      </Modal>
    </>
  )
}
