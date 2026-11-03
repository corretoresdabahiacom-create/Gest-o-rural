import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarClock } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { useHerd } from '../../contexts/HerdContext'
import { newId } from '../../lib/db'
import { saveVaccination } from '../../lib/herdDb'
import { daysBetween, fmtDate, today } from '../../lib/format'
import { vaccineAlerts, type Vaccination as Vac } from '../../lib/herd'
import { Badge, Button, Card, Empty, ErrorBox, Field, PageHeader, cx, useToast } from '../../components/ui'
import { herdErr } from '../../components/herd/HerdForms'

export default function Vaccination() {
  const { farm, canEdit } = useApp()
  const { activeLots, lots, vaccinations, lotName, catName, categories } = useHerd()
  const toast = useToast()
  const t = today()
  const blank = () => ({ opId: newId(farm!.id, 'vaccinations'), status: 'aplicada' as Vac['status'], date: t, lotId: '', categoryId: '', qty: '', vaccine: '', manufacturer: '', productLot: '', dose: '', responsible: '', boosterDate: '', boosterOfId: '', notes: '' })
  const [f, setF] = useState(blank)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'alertas' | 'historico' | 'nao'>('alertas')
  const [filter, setFilter] = useState({ lotId: '', start: `${t.slice(0, 4)}-01-01`, end: t, vaccine: '' })
  const set = (k: keyof ReturnType<typeof blank>) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const lot = activeLots.find((l) => l.id === f.lotId)
  const pendingForLot = vaccinations.filter((v) => v.lotId === f.lotId && ((v.status === 'programada' && !v.boosterDoneById) || (v.boosterDate && !v.boosterDoneById)))
  const alerts = useMemo(() => vaccineAlerts(vaccinations.filter((v) => !(v.status === 'programada' && v.boosterDoneById)), t, 30, daysBetween), [vaccinations, t])
  const history = useMemo(() => vaccinations.filter((v) => v.status === 'aplicada' && v.date >= filter.start && v.date <= filter.end && (!filter.lotId || v.lotId === filter.lotId))
    .sort((a, b) => b.date.localeCompare(a.date)), [vaccinations, filter])
  const vaccineNames = [...new Set(vaccinations.map((v) => v.vaccine))].sort()
  const notVaccinated = filter.vaccine ? activeLots.filter((l) => l.count > 0 && !history.some((v) => v.lotId === l.id && v.vaccine === filter.vaccine)) : []

  async function save() {
    const qty = Number(f.qty || 0)
    if (!f.lotId || !f.vaccine.trim() || qty < 1) return setErr('Informe lote, vacina e quantidade.')
    if (f.status === 'aplicada' && lot && qty > lot.count) return setErr(`Quantidade maior que o saldo do lote (${lot.count}).`)
    if (f.boosterDate && f.boosterDate <= f.date) return setErr('A data do reforço deve ser posterior à aplicação.')
    setSaving(true); setErr('')
    try {
      await saveVaccination(farm!.id, f.opId, { status: f.status, date: f.date, lotId: f.lotId, categoryId: f.categoryId || null, qty, vaccine: f.vaccine.trim(), manufacturer: f.manufacturer.trim(),
        productLot: f.productLot.trim(), dose: f.dose.trim(), responsible: f.responsible.trim(), boosterDate: f.status === 'aplicada' ? f.boosterDate || null : null,
        boosterOfId: f.status === 'aplicada' ? f.boosterOfId || null : null, notes: f.notes.trim(), stockItemId: null })
      toast('success', f.status === 'aplicada' ? 'Vacinação registrada.' : 'Vacinação programada.')
      setF({ ...blank(), date: f.date, responsible: f.responsible })
    } catch (e) { setErr(herdErr(e)) } finally { setSaving(false) }
  }

  return (
    <>
      <PageHeader title="Vacinação e controle sanitário" subtitle="Calendário definido por você conforme orientação veterinária — o sistema não impõe protocolos" />
      {canEdit && (
        <Card className="mb-5">
          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Registro"><select className="input" value={f.status} onChange={set('status')}><option value="aplicada">Vacinação aplicada</option><option value="programada">Programar vacinação</option></select></Field>
            <Field label={f.status === 'aplicada' ? 'Data da vacinação *' : 'Data programada *'}><input type="date" className="input" value={f.date} onChange={set('date')} /></Field>
            <Field label="Lote *">
              <select className="input" value={f.lotId} onChange={(e) => { const l = activeLots.find((x) => x.id === e.target.value); setF({ ...f, lotId: e.target.value, qty: l ? String(l.count) : '', boosterOfId: '' }) }}>
                <option value="">Selecione…</option>{activeLots.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.count} cab.)</option>)}
              </select>
            </Field>
            <Field label="Quantidade *" hint={lot ? `Sugerido: saldo atual do lote (${lot.count}). Ajuste se necessário.` : undefined}><input className="input" inputMode="numeric" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="Vacina *"><input className="input" list="vac-names" value={f.vaccine} onChange={set('vaccine')} maxLength={100} /><datalist id="vac-names">{vaccineNames.map((n) => <option key={n} value={n} />)}</datalist></Field>
            <Field label="Categoria"><select className="input" value={f.categoryId} onChange={set('categoryId')}><option value="">Todas do lote</option>{categories.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Fabricante"><input className="input" value={f.manufacturer} onChange={set('manufacturer')} maxLength={100} /></Field>
            <Field label="Lote do produto"><input className="input" value={f.productLot} onChange={set('productLot')} maxLength={60} /></Field>
            <Field label="Dose aplicada"><input className="input" value={f.dose} onChange={set('dose')} maxLength={40} placeholder="Ex.: 5 ml" /></Field>
            <Field label="Responsável"><input className="input" value={f.responsible} onChange={set('responsible')} maxLength={120} /></Field>
            {f.status === 'aplicada' && <Field label="Reforço previsto"><input type="date" className="input" value={f.boosterDate} onChange={set('boosterDate')} /></Field>}
            {f.status === 'aplicada' && pendingForLot.length > 0 && (
              <Field label="Esta aplicação cumpre">
                <select className="input" value={f.boosterOfId} onChange={set('boosterOfId')}>
                  <option value="">Nenhum agendamento</option>
                  {pendingForLot.map((v) => <option key={v.id} value={v.id}>{v.vaccine} — {v.status === 'programada' ? `programada ${fmtDate(v.date)}` : `reforço ${fmtDate(v.boosterDate)}`}</option>)}
                </select>
              </Field>
            )}
            <Field label="Observações" className="sm:col-span-2"><input className="input" value={f.notes} onChange={set('notes')} maxLength={500} /></Field>
          </div>
          {err && <div className="px-4 pb-2"><ErrorBox>{err}</ErrorBox></div>}
          <div className="flex justify-end border-t border-stone-200 p-3 dark:border-stone-800"><Button loading={saving} onClick={save}>Salvar</Button></div>
        </Card>
      )}

      <div className="mb-3 flex rounded-lg border border-stone-200 bg-white p-0.5 w-fit dark:border-stone-800 dark:bg-stone-900">
        {([['alertas', `Próximas e atrasadas (${alerts.length})`], ['historico', 'Histórico'], ['nao', 'Lotes não vacinados']] as const).map(([k, l]) =>
          <button key={k} onClick={() => setTab(k)} className={cx('rounded-md px-3 py-1.5 text-sm', tab === k ? 'bg-brand-600 text-white' : 'text-stone-600 dark:text-stone-300')}>{l}</button>)}
      </div>
      {tab !== 'alertas' && (
        <div className="mb-3 flex flex-wrap gap-2">
          <select className="input w-auto" value={filter.lotId} onChange={(e) => setFilter({ ...filter, lotId: e.target.value })}><option value="">Todos os lotes</option>{lots.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          <input type="date" className="input w-auto" value={filter.start} onChange={(e) => setFilter({ ...filter, start: e.target.value })} />
          <input type="date" className="input w-auto" value={filter.end} onChange={(e) => setFilter({ ...filter, end: e.target.value })} />
          {tab === 'nao' && <select className="input w-auto" value={filter.vaccine} onChange={(e) => setFilter({ ...filter, vaccine: e.target.value })}><option value="">Escolha a vacina…</option>{vaccineNames.map((n) => <option key={n}>{n}</option>)}</select>}
        </div>
      )}
      <Card>
        {tab === 'alertas' && (alerts.length === 0 ? <Empty icon={<CalendarClock className="size-5" />} title="Nenhuma vacinação nos próximos 30 dias" /> : (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {alerts.map((a) => (
              <li key={a.v.id + a.kind} className="flex items-center gap-3 px-4 py-3 text-sm">
                {a.daysLeft < 0 ? <AlertTriangle className="size-4 text-red-600" /> : <CalendarClock className="size-4 text-amber-600" />}
                <div className="min-w-0 flex-1"><div className="font-medium">{a.v.vaccine} — {a.kind === 'reforco' ? 'reforço' : 'programada'}</div><div className="text-stone-500">{lotName(a.v.lotId)} · {fmtDate(a.due)} · {a.v.qty} cab.</div></div>
                <Badge tone={a.daysLeft < 0 ? 'red' : a.daysLeft === 0 ? 'amber' : 'stone'}>{a.daysLeft < 0 ? `Atrasada ${-a.daysLeft}d` : a.daysLeft === 0 ? 'Hoje' : `em ${a.daysLeft}d`}</Badge>
              </li>
            ))}
          </ul>
        ))}
        {tab === 'historico' && (history.length === 0 ? <Empty title="Nenhuma aplicação no período" /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
            <thead className="border-b border-stone-200 dark:border-stone-800"><tr>{['Data', 'Lote', 'Categoria', 'Vacina', 'Cab.', 'Dose', 'Responsável', 'Reforço'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">{history.map((v) => (
              <tr key={v.id}><td className="td tabular">{fmtDate(v.date)}</td><td className="td">{lotName(v.lotId)}</td><td className="td">{v.categoryId ? catName(v.categoryId) : 'Todas'}</td><td className="td font-medium">{v.vaccine}</td><td className="td tabular">{v.qty}</td><td className="td">{v.dose || '—'}</td><td className="td">{v.responsible || '—'}</td>
                <td className="td">{v.boosterDate ? <span className="tabular">{fmtDate(v.boosterDate)} {v.boosterDoneById ? <Badge tone="green">feito</Badge> : <Badge tone="amber">pendente</Badge>}</span> : '—'}</td></tr>))}
            </tbody>
          </table><div className="border-t border-stone-200 px-4 py-2 text-sm font-semibold dark:border-stone-800">Total vacinado no período: {history.reduce((s, v) => s + v.qty, 0)} doses-animal</div></div>
        ))}
        {tab === 'nao' && (!filter.vaccine ? <Empty title="Escolha uma vacina para ver os lotes sem aplicação no período" /> : notVaccinated.length === 0 ? <Empty title="Todos os lotes com animais receberam esta vacina no período" /> : (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">{notVaccinated.map((l) => <li key={l.id} className="flex justify-between px-4 py-2.5 text-sm"><span>{l.name}</span><span className="tabular">{l.count} cab.</span></li>)}</ul>
        ))}
      </Card>
    </>
  )
}
