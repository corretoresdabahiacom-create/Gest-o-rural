import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore'
import { ArrowLeft, ClipboardCheck, Copy, FileDown, FileSpreadsheet, FileText, Layers, Plus, Printer, Save, Scale, Trash2 } from 'lucide-react'
import { auth, db } from '../../lib/firebase'
import { addLog, clean, farmCol, farmDoc, friendlyError, newId } from '../../lib/db'
import { centsToInput, fmtDate, money, number, parseMoney, today } from '../../lib/format'
import { historyCandidates, rowCalc, sheetTotals, type SheetRow } from '../../lib/worksheet'
import { saveWeighingSession } from '../../lib/weighingDb'
import { exportCsv, exportPdf, exportXlsx } from '../../lib/export'
import type { ReportResult } from '../../lib/reports'
import { ARROBA_LABEL, type ArrobaUnit } from '../../lib/herd'
import { useApp } from '../../contexts/AppContext'
import { HerdProvider, useHerd } from '../../contexts/HerdContext'
import { Badge, Button, Card, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, cx, useToast } from '../../components/ui'

interface Sheet { id: string; name: string; date: string; rows: SheetRow[]; notes?: string; kgPerArroba: number; unit: ArrobaUnit; registeredAt?: unknown; registeredSessionId?: string }
interface EditRow { id: string; lotId: string; label: string; quantity: string; weightKg: string; arrobaPrice: string; loadedAvgKg: number | null }

const rid = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const blankRow = (): EditRow => ({ id: rid(), lotId: '', label: '', quantity: '', weightKg: '', arrobaPrice: '', loadedAvgKg: null })
const dec = (s: string) => { const t = s.trim(); if (!t) return 0; const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); return Number.isFinite(n) && n > 0 ? n : 0 }
const toRow = (r: EditRow): SheetRow => ({ id: r.id, lotId: r.lotId || null, label: r.label.trim(), quantity: Math.floor(dec(r.quantity)), weightKg: dec(r.weightKg), arrobaPrice: parseMoney(r.arrobaPrice) ?? 0, loadedAvgKg: r.loadedAvgKg })
const toEdit = (r: SheetRow): EditRow => ({ id: r.id, lotId: r.lotId ?? '', label: r.label ?? '', quantity: r.quantity ? String(r.quantity) : '', weightKg: r.weightKg ? String(r.weightKg).replace('.', ',') : '', arrobaPrice: r.arrobaPrice ? centsToInput(r.arrobaPrice) : '', loadedAvgKg: r.loadedAvgKg ?? null })
const n2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function useSheets() {
  const { farm } = useApp()
  const [list, setList] = useState<Sheet[] | null>(null)
  useEffect(() => onSnapshot(farmCol(farm!.id, 'weighingSheets'), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Sheet).sort((a, b) => b.date.localeCompare(a.date) || b.name.localeCompare(a.name))), () => setList([])), [farm])
  return list
}

function Worksheet() {
  const { farm, canEdit } = useApp()
  const { activeLots, lots, lotName, arroba, ready } = useHerd()
  const toast = useToast()
  const sheets = useSheets()
  const [openId, setOpenId] = useState<string | null>(null)
  const [s, setS] = useState({ name: '', date: today(), notes: '', unit: 'vivo' as ArrobaUnit, kg: String(arroba.vivo) })
  const [rows, setRows] = useState<EditRow[]>([])
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [loadLots, setLoadLots] = useState(false)
  const [register, setRegister] = useState(false)
  const [regBusy, setRegBusy] = useState(false)
  const [regResp, setRegResp] = useState('')
  const [err, setErr] = useState('')
  const loadedRef = useRef<string | null>(null)
  const current = sheets?.find((x) => x.id === openId)
  const registered = !!current?.registeredAt

  useEffect(() => {
    if (!openId || !current || loadedRef.current === openId) return
    loadedRef.current = openId
    setS({ name: current.name, date: current.date, notes: current.notes ?? '', unit: current.unit ?? 'vivo', kg: String(current.kgPerArroba).replace('.', ',') })
    setRows(current.rows?.length ? current.rows.map(toEdit) : [blankRow()])
    setDirty(false); setErr('')
  }, [openId, current])

  const kgPerArroba = dec(s.kg) || arroba.vivo
  const sheetRows = useMemo(() => rows.map(toRow), [rows])
  const totals = sheetTotals(sheetRows, kgPerArroba)
  const unitName = s.unit === 'outra' ? arroba.outraLabel : ARROBA_LABEL[s.unit]

  function newSheet() {
    const id = newId(farm!.id, 'weighingSheets')
    loadedRef.current = id
    setS({ name: `Pesagem de bovinos — ${fmtDate(today())}`, date: today(), notes: '', unit: 'vivo', kg: String(arroba.vivo) })
    setRows([blankRow()]); setDirty(true); setErr(''); setOpenId(id)
  }
  const upd = (id: string, p: Partial<EditRow>) => { setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r))); setDirty(true) }

  async function save(): Promise<boolean> {
    if (!s.name.trim()) { setErr('Dê um nome à planilha.'); return false }
    if (!(kgPerArroba > 0)) { setErr('Kg por arroba inválido.'); return false }
    if (rows.length > 200) { setErr('Máximo de 200 linhas por planilha.'); return false }
    setSaving(true); setErr('')
    try {
      const b = writeBatch(db)
      b.set(farmDoc(farm!.id, 'weighingSheets', openId!), clean({
        name: s.name.trim(), date: s.date, notes: s.notes.trim(), unit: s.unit, kgPerArroba,
        rows: sheetRows.filter((r) => r.quantity || r.weightKg || r.arrobaPrice || r.lotId || r.label).map((r) => clean({ ...r, label: r.label || undefined })),
        ...(current ? { updatedAt: serverTimestamp() } : { createdBy: auth.currentUser!.uid, createdAt: serverTimestamp() }),
      }), { merge: true })
      addLog(b, farm!.id, current ? 'planilha_pesagem_salva' : 'planilha_pesagem_criada', s.name.trim())
      await b.commit()
      setDirty(false); toast('success', 'Planilha salva.')
      return true
    } catch (e) { setErr(friendlyError(e)); return false } finally { setSaving(false) }
  }

  async function remove(sh: Sheet) {
    if (!confirm(`Excluir a planilha “${sh.name}”?`)) return
    try {
      const b = writeBatch(db); b.delete(farmDoc(farm!.id, 'weighingSheets', sh.id)); addLog(b, farm!.id, 'planilha_pesagem_excluida', sh.name); await b.commit()
      if (openId === sh.id) setOpenId(null)
      toast('success', 'Planilha excluída.')
    } catch (e) { toast('error', friendlyError(e)) }
  }

  function fromLots(ids: string[]) {
    const add = ids.map((id) => { const l = lots.find((x) => x.id === id)!
      return { id: rid(), lotId: l.id, label: '', quantity: String(l.count), weightKg: l.avgWeightKg ? String(Math.round(l.avgWeightKg * l.count * 10) / 10).replace('.', ',') : '', arrobaPrice: '', loadedAvgKg: l.avgWeightKg ?? null } })
    setRows((rs) => [...rs.filter((r) => r.lotId || r.quantity || r.weightKg || r.arrobaPrice || r.label), ...add]); setDirty(true); setLoadLots(false)
    const noWeight = ids.filter((id) => !lots.find((x) => x.id === id)?.avgWeightKg).length
    if (noWeight) toast('info', `${noWeight} lote(s) sem peso cadastrado: preencha o peso da balança.`)
  }

  // Enter avança para o próximo campo numérico; no último, cria nova linha.
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const all = Array.from(document.querySelectorAll<HTMLInputElement>('[data-ws]'))
    const i = all.indexOf(e.currentTarget)
    if (i < all.length - 1) { all[i + 1].focus(); all[i + 1].select() }
    else { setRows((rs) => [...rs, blankRow()]); setDirty(true); setTimeout(() => { const f = Array.from(document.querySelectorAll<HTMLInputElement>('[data-ws]')); f[all.length]?.focus() }, 0) }
  }

  function report(): ReportResult {
    return {
      title: s.name, subtitle: `${fmtDate(s.date)} · ${unitName} = ${number(kgPerArroba)} kg`,
      columns: [{ key: 'lote', label: 'Lote / descrição' }, { key: 'q', label: 'Quantidade', type: 'number' }, { key: 'kg', label: 'Peso total', type: 'kg' }, { key: 'kgcab', label: 'Peso/animal', type: 'kg' },
        { key: 'arr', label: 'Arrobas', type: 'decimal' }, { key: 'arrcab', label: 'Média @/animal', type: 'decimal' }, { key: 'preco', label: 'Valor da arroba', type: 'money' },
        { key: 'cab', label: 'Valor parcial/animal', type: 'money' }, { key: 'tot', label: 'Total geral', type: 'money' }],
      rows: sheetRows.filter((r) => r.quantity || r.weightKg).map((r) => { const c = rowCalc(r, kgPerArroba)
        return { lote: r.lotId ? lotName(r.lotId) : r.label || '—', q: r.quantity, kg: r.weightKg, kgcab: c.avgKg, arr: c.arrobas, arrcab: c.arrobasPerHead, preco: r.arrobaPrice, cab: Math.round(c.valuePerHead), tot: Math.round(c.total) } }),
      totals: { lote: 'TOTAL', q: totals.qty, kg: totals.weightKg, kgcab: totals.avgKg, arr: totals.arrobas, arrcab: totals.arrobasPerHead, preco: Math.round(totals.avgArrobaPrice), cab: Math.round(totals.valuePerHead), tot: Math.round(totals.total) },
    }
  }

  const cand = historyCandidates(sheetRows, lots)
  async function registerHistory() {
    if (!regResp.trim()) return
    setRegBusy(true); setErr('')
    try {
      const sessionId = `sheet-${openId}`
      await saveWeighingSession(farm!.id, sessionId, { date: s.date, mode: 'collective', lotId: cand.ok.length === 1 ? cand.ok[0].lotId! : '', categoryId: null, responsible: regResp.trim(), notes: `Planilha: ${s.name}`.slice(0, 500), source: 'manual' },
        cand.ok.map((r) => ({ lotId: r.lotId!, categoryId: null, animalId: null, tag: null, qty: r.quantity, totalKg: Math.round(r.weightKg * 10) / 10, avgKg: Math.round((r.weightKg / r.quantity) * 10) / 10, method: 'balanca_coletiva', lotCountAtWeighing: lots.find((l) => l.id === r.lotId)?.count ?? null })),
        { animals: [], lots })
      const b = writeBatch(db)
      b.update(farmDoc(farm!.id, 'weighingSheets', openId!), { registeredAt: serverTimestamp(), registeredSessionId: sessionId, updatedAt: serverTimestamp() })
      await b.commit()
      toast('success', `Pesagem registrada no histórico de ${cand.ok.length} lote(s).`)
      setRegister(false)
    } catch (e) { setErr(friendlyError(e)) } finally { setRegBusy(false) }
  }

  if (!ready || !sheets) return <Spinner />

  /* ---------- Lista de planilhas ---------- */
  if (!openId) return (
    <>
      <PageHeader title="Planilha de pesagem" subtitle="Peso, arrobas e valor por lote — como na planilha de papel"
        actions={canEdit && <Button onClick={newSheet}><Plus className="size-4" />Nova planilha</Button>} />
      <Card>{sheets.length === 0 ? <Empty icon={<Scale className="size-5" />} title="Nenhuma planilha ainda" text="Crie uma planilha, carregue os lotes e informe peso e valor da arroba."
        action={canEdit && <Button onClick={newSheet}><Plus className="size-4" />Criar a primeira</Button>} /> : (
        <ul className="divide-y divide-stone-100 dark:divide-stone-800">{sheets.map((sh) => { const t = sheetTotals(sh.rows ?? [], sh.kgPerArroba)
          return (
            <li key={sh.id} className="flex items-center gap-3 px-4 py-3">
              <button className="min-w-0 flex-1 text-left" onClick={() => { loadedRef.current = null; setOpenId(sh.id) }}>
                <div className="flex items-center gap-2"><span className="truncate font-medium hover:underline">{sh.name}</span>{sh.registeredAt ? <Badge tone="green">No histórico</Badge> : null}</div>
                <div className="text-xs text-stone-500">{fmtDate(sh.date)} · {t.qty} cab. · {number(Math.round(t.weightKg))} kg · {n2(t.arrobas)} @</div>
              </button>
              <b className="tabular">{money(Math.round(t.total))}</b>
              {canEdit && !sh.registeredAt && <Button size="sm" variant="ghost" onClick={() => remove(sh)} aria-label="Excluir"><Trash2 className="size-4 text-stone-500" /></Button>}
            </li>) })}</ul>
      )}</Card>
    </>
  )

  /* ---------- Editor ---------- */
  const ro = !canEdit
  return (
    <div className="pb-6">
      <button onClick={() => { if (!dirty || confirm('Sair sem salvar as alterações?')) setOpenId(null) }} className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 hover:underline"><ArrowLeft className="size-4" />Planilhas</button>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Nome da planilha" className="min-w-60 flex-1"><input className="input text-base font-semibold" value={s.name} disabled={ro} maxLength={120} onChange={(e) => { setS({ ...s, name: e.target.value }); setDirty(true) }} /></Field>
        <Field label="Data"><input type="date" className="input" value={s.date} max={today()} disabled={ro || registered} onChange={(e) => { setS({ ...s, date: e.target.value }); setDirty(true) }} /></Field>
        <Field label="Unidade">
          <select className="input" value={s.unit} disabled={ro || registered} onChange={(e) => { const u = e.target.value as ArrobaUnit; setS({ ...s, unit: u, kg: String(u === 'vivo' ? arroba.vivo : u === 'carcaca' ? arroba.carcaca : arroba.outra) }); setDirty(true) }}>
            <option value="vivo">@ peso vivo</option><option value="carcaca">@ carcaça</option><option value="outra">{arroba.outraLabel}</option>
          </select>
        </Field>
        <Field label="Kg por arroba"><input className="input w-24" inputMode="decimal" value={s.kg} disabled={ro || registered} onChange={(e) => { setS({ ...s, kg: e.target.value }); setDirty(true) }} /></Field>
      </div>
      {registered && <p className="mb-3 rounded-lg bg-brand-50 p-3 text-sm text-brand-800 dark:bg-brand-900/40 dark:text-brand-200">Esta planilha já foi registrada no histórico de pesagem dos lotes; os valores ficaram travados.</p>}

      <Card className="mb-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead className="border-b border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-800/50">
              <tr>{['Lote / descrição', 'Quantidade (cab.)', 'Peso total (kg)', 'Peso/animal', `Arrobas (÷${number(kgPerArroba)})`, 'Média @/animal', 'Valor da arroba', 'Valor parcial/animal', 'Total geral', ''].map((h, i) =>
                <th key={i} className={cx('th whitespace-nowrap', i > 0 && i < 9 && 'text-right')}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">{rows.map((r, i) => { const c = rowCalc(sheetRows[i], kgPerArroba)
              const lot = lots.find((l) => l.id === r.lotId)
              return (
                <tr key={r.id}>
                  <td className="td min-w-48">{r.lotId ? <span className="font-medium">{lotName(r.lotId)}<span className="block text-xs text-stone-500">{lot ? `${lot.count} cab. no lote` : 'lote removido'}</span></span>
                    : <input className="cell" placeholder="Descrição (opcional)" value={r.label} disabled={ro || registered} maxLength={60} onChange={(e) => upd(r.id, { label: e.target.value })} />}</td>
                  <td className="td w-28"><input data-ws className="cell tabular text-right" inputMode="numeric" value={r.quantity} disabled={ro || registered} onKeyDown={onKey} onChange={(e) => upd(r.id, { quantity: e.target.value.replace(/\D/g, '') })} placeholder="0" /></td>
                  <td className="td w-32"><input data-ws className="cell tabular text-right" inputMode="decimal" value={r.weightKg} disabled={ro || registered} onKeyDown={onKey} onChange={(e) => upd(r.id, { weightKg: e.target.value })} placeholder="0" /></td>
                  <td className="td tabular text-right text-stone-600 dark:text-stone-300">{c.avgKg ? `${number(Math.round(c.avgKg * 10) / 10)} kg` : '—'}</td>
                  <td className="td tabular text-right">{c.arrobas ? n2(c.arrobas) : '—'}</td>
                  <td className="td tabular text-right">{c.arrobasPerHead ? n2(c.arrobasPerHead) : '—'}</td>
                  <td className="td w-32"><input data-ws className="cell tabular text-right" inputMode="decimal" value={r.arrobaPrice} disabled={ro || registered} onKeyDown={onKey} onChange={(e) => upd(r.id, { arrobaPrice: e.target.value })} placeholder="R$ 0,00" /></td>
                  <td className="td tabular text-right">{c.valuePerHead ? money(Math.round(c.valuePerHead)) : '—'}</td>
                  <td className="td tabular text-right font-semibold">{c.total ? money(Math.round(c.total)) : '—'}</td>
                  <td className="td whitespace-nowrap text-right">{!ro && !registered && <>
                    <button className="rounded-md p-1.5 text-stone-400 hover:text-stone-700" title="Duplicar linha" onClick={() => { setRows((rs) => { const c2 = [...rs]; c2.splice(i + 1, 0, { ...r, id: rid(), lotId: '', loadedAvgKg: null }); return c2 }); setDirty(true) }}><Copy className="size-4" /></button>
                    <button className="rounded-md p-1.5 text-stone-400 hover:text-red-600" title="Excluir linha" onClick={() => { setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.id !== r.id) : [blankRow()])); setDirty(true) }}><Trash2 className="size-4" /></button>
                  </>}</td>
                </tr>) })}</tbody>
            <tfoot className="border-t-2 border-stone-300 bg-stone-50 font-semibold dark:border-stone-700 dark:bg-stone-800/50">
              <tr>
                <td className="td">TOTAL</td><td className="td tabular text-right">{totals.qty} cab.</td><td className="td tabular text-right">{number(Math.round(totals.weightKg * 10) / 10)} kg</td>
                <td className="td tabular text-right">{totals.avgKg ? `${number(Math.round(totals.avgKg * 10) / 10)} kg` : '—'}</td><td className="td tabular text-right">{n2(totals.arrobas)}</td>
                <td className="td tabular text-right">{n2(totals.arrobasPerHead)}</td><td className="td tabular text-right" title="Média ponderada pelas arrobas">{totals.avgArrobaPrice ? money(Math.round(totals.avgArrobaPrice)) : '—'}</td>
                <td className="td tabular text-right">{totals.valuePerHead ? money(Math.round(totals.valuePerHead)) : '—'}</td><td className="td tabular text-right text-base text-brand-700 dark:text-brand-300">{money(Math.round(totals.total))}</td><td />
              </tr>
            </tfoot>
          </table>
        </div>
        {!ro && !registered && <div className="flex flex-wrap gap-2 border-t border-stone-200 p-3 dark:border-stone-800">
          <Button size="sm" variant="secondary" onClick={() => { setRows((rs) => [...rs, blankRow()]); setDirty(true) }}><Plus className="size-4" />Adicionar linha</Button>
          <Button size="sm" variant="secondary" onClick={() => setLoadLots(true)} disabled={!activeLots.length}><Layers className="size-4" />Carregar dos lotes</Button>
          <span className="self-center text-xs text-stone-500">Enter avança para o próximo campo; no último, cria uma linha.</span>
        </div>}
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Quantidade total', `${totals.qty} cab.`], ['Peso total', `${number(Math.round(totals.weightKg))} kg`], [`Total de arrobas (${unitName})`, `${n2(totals.arrobas)} @`], ['Total geral', money(Math.round(totals.total))]].map(([l, v]) =>
          <div key={l} className="card p-3"><div className="text-xs text-stone-500">{l}</div><div className="tabular mt-0.5 text-lg font-semibold">{v}</div></div>)}
      </div>

      <Field label="Observações" className="mb-4"><textarea className="input" rows={2} value={s.notes} disabled={ro} maxLength={2000} placeholder="Ex.: condições do dia, destino do lote, balança usada…" onChange={(e) => { setS({ ...s, notes: e.target.value }); setDirty(true) }} /></Field>
      {err && <div className="mb-3"><ErrorBox>{err}</ErrorBox></div>}

      <div className="no-print flex flex-wrap gap-2">
        {!ro && <Button loading={saving} onClick={save}><Save className="size-4" />{dirty ? 'Salvar planilha' : 'Salva'}</Button>}
        <Button variant="secondary" onClick={() => exportXlsx(report(), farm!.name).catch((e) => toast('error', friendlyError(e)))}><FileSpreadsheet className="size-4" />Excel</Button>
        <Button variant="secondary" onClick={() => exportPdf(report(), farm!.name).catch((e) => toast('error', friendlyError(e)))}><FileText className="size-4" />PDF</Button>
        <Button variant="secondary" onClick={() => exportCsv(report(), farm!.name)}><FileDown className="size-4" />CSV</Button>
        <Button variant="secondary" onClick={() => window.print()}><Printer className="size-4" />Imprimir</Button>
        {!ro && !registered && <Button variant="secondary" disabled={!sheetRows.some((r) => r.lotId)} onClick={async () => { if (dirty && !(await save())) return; setRegResp(''); setErr(''); setRegister(true) }}><ClipboardCheck className="size-4" />Registrar no histórico dos lotes</Button>}
      </div>
      <p className="mt-3 text-xs text-stone-500">Arrobas = peso ÷ {number(kgPerArroba)} kg · Média @/animal = arrobas ÷ quantidade · Valor parcial/animal = média @ × valor da arroba · Total geral = valor parcial × quantidade. A planilha não altera a quantidade de animais nem o financeiro.</p>

      <Modal open={loadLots} onClose={() => setLoadLots(false)} title="Carregar dos lotes"
        footer={<Button variant="secondary" onClick={() => setLoadLots(false)}>Fechar</Button>}>
        <ul className="divide-y divide-stone-100 dark:divide-stone-800">{activeLots.filter((l) => l.count > 0).map((l) => { const inSheet = rows.some((r) => r.lotId === l.id)
          return <li key={l.id} className="flex items-center justify-between gap-2 py-2 text-sm"><span>{l.name} <span className="text-stone-500">· {l.count} cab.{l.avgWeightKg ? ` · ${number(l.avgWeightKg)} kg médio` : ''}</span></span>
            <Button size="sm" variant="secondary" disabled={inSheet} onClick={() => fromLots([l.id])}>{inSheet ? 'Na planilha' : 'Adicionar'}</Button></li> })}</ul>
        <Button className="mt-3 w-full" onClick={() => fromLots(activeLots.filter((l) => l.count > 0 && !rows.some((r) => r.lotId === l.id)).map((l) => l.id))}>Adicionar todos</Button>
      </Modal>

      <Modal open={register} onClose={() => !regBusy && setRegister(false)} title="Registrar no histórico dos lotes"
        footer={<><Button variant="secondary" disabled={regBusy} onClick={() => setRegister(false)}>Cancelar</Button><Button loading={regBusy} disabled={!cand.ok.length || !regResp.trim()} onClick={registerHistory}>Registrar {cand.ok.length} lote(s)</Button></>}>
        <div className="space-y-3 text-sm">
          <p>Cria uma <b>pesagem coletiva</b> de {fmtDate(s.date)} para cada lote abaixo. A planilha fica travada depois do registro.</p>
          {cand.ok.length > 0 && <ul className="rounded-lg border border-stone-200 dark:border-stone-800">{cand.ok.map((r) => <li key={r.id} className="flex justify-between px-3 py-1.5"><span>{lotName(r.lotId!)}</span><span className="tabular">{r.quantity} cab. · {number(Math.round((r.weightKg / r.quantity) * 10) / 10)} kg/animal</span></li>)}</ul>}
          {cand.skipped.length > 0 && <div className="text-xs text-stone-500">Ficam de fora: {cand.skipped.map((x) => `${x.row.lotId ? lotName(x.row.lotId) : 'linha'} (${x.reason})`).join('; ')}.</div>}
          {!cand.ok.length && <p className="text-amber-700 dark:text-amber-400">Nenhum lote apto. Carregue os lotes e informe o peso da balança.</p>}
          <Field label="Responsável pela pesagem *"><input className="input" value={regResp} onChange={(e) => setRegResp(e.target.value)} maxLength={120} /></Field>
          {err && <ErrorBox>{err}</ErrorBox>}
        </div>
      </Modal>
    </div>
  )
}

export default function WorksheetPage() {
  return <HerdProvider><Worksheet /></HerdProvider>
}
