import { useEffect, useMemo, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Copy, ListPlus, Plus, Save, Trash2 } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { useHerd } from '../../contexts/HerdContext'
import { friendlyError, newId } from '../../lib/db'
import { fmtDate, number, today } from '../../lib/format'
import {
  collectiveCalc, collectiveComparison, diffKg, gmd, parseKg, parsePasted, previousWeighing, sessionStats, toArrobas,
  type Weighing, type WeighMode,
} from '../../lib/weighing'
import { MAX_WEIGH_ROWS, saveWeighingSession, type NewRecord } from '../../lib/weighingDb'
import { Badge, Button, Card, ErrorBox, Field, Modal, PageHeader, cx, useToast } from '../../components/ui'
import { useWeigh } from './WeighContext'

interface IndRow { key: string; animalId: string; tag: string; kg: string }
interface ColRow { key: string; lotId: string; categoryId: string; date: string; qty: string; totalKg: string; avgKg: string }
let seq = 0
const rk = () => `w${Date.now().toString(36)}${(seq++).toString(36)}`
const fmtGmd = (g: number | null) => (g == null ? '—' : `${g.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg/dia`)
export const gainTone = (g: number | null | undefined) => (g == null ? '' : g > 0.05 ? 'text-brand-700 dark:text-brand-300' : g < -0.05 ? 'text-red-600' : 'text-stone-500')

export default function NewWeighing() {
  const { farm, canEdit, user } = useApp()
  const { activeLots, lots, animals, catName, lotName, categories, arroba, identified } = useHerd()
  const { active: history, movs, reload } = useWeigh()
  const toast = useToast()
  const [params] = useSearchParams()
  const [step, setStep] = useState<'header' | 'sheet'>('header')
  const [h, setH] = useState({ sessionId: newId(farm!.id, 'weighingSessions'), date: today(), lotId: params.get('lote') ?? '', categoryId: '', mode: (params.get('modo') === 'coletiva' ? 'collective' : 'individual') as WeighMode,
    responsible: user?.displayName ?? '', location: '', notes: '' })
  const [ind, setInd] = useState<IndRow[]>([])
  const [col, setCol] = useState<ColRow[]>([])
  const [picker, setPicker] = useState<string[] | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [review, setReview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')
  const lot = activeLots.find((l) => l.id === h.lotId)

  // Rascunho local: nada se perde se a gravação falhar ou o app fechar.
  const draftKey = `ag-weigh-${farm!.id}`
  useEffect(() => { try { const d = JSON.parse(localStorage.getItem(draftKey) || 'null'); if (d?.h?.sessionId) { setH(d.h); setInd(d.ind ?? []); setCol(d.col ?? []); setStep('sheet'); toast('info', 'Pesagem não salva recuperada.') } } catch { /* ignora */ } }, [draftKey, toast])
  useEffect(() => { if (step !== 'sheet') return; try { if (ind.some((r) => r.kg || r.animalId) || col.some((r) => r.qty || r.totalKg || r.avgKg)) localStorage.setItem(draftKey, JSON.stringify({ h, ind, col })) } catch { /* cheio */ } }, [h, ind, col, step, draftKey])

  /* ---------- Cálculos individuais ---------- */
  const prevOf = (r: IndRow): { kg: number; date: string; source: string } | null => {
    const p = r.animalId ? previousWeighing(history, r.animalId, h.date) : history.filter((w) => !w.animalId && w.tag && w.tag.toLowerCase() === r.tag.toLowerCase() && w.lotId === h.lotId && w.date < h.date).sort((a, b) => b.date.localeCompare(a.date))[0]
    if (p) return { kg: p.avgKg, date: p.date, source: 'pesagem' }
    const a = animals.find((x) => x.id === r.animalId)
    return a?.weightKg && a.entryDate < h.date ? { kg: a.weightKg, date: a.entryDate, source: 'peso de entrada' } : null
  }
  const indCalc = useMemo(() => ind.map((r) => {
    const kg = parseKg(r.kg); const prev = prevOf(r)
    return { r, kg, prev, gain: kg != null ? diffKg(kg, prev?.kg) : null, gmd: kg != null ? gmd(kg, h.date, prev?.kg, prev?.date) : null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [ind, history, h.date, animals])
  const colCalc = useMemo(() => col.map((r) => ({ r, c: collectiveCalc(Number(r.qty || 0), parseKg(r.totalKg), parseKg(r.avgKg)) })), [col])
  const stats = h.mode === 'individual'
    ? sessionStats(indCalc.filter((x) => x.kg != null).map((x) => ({ qty: 1, totalKg: x.kg!, avgKg: x.kg!, gainKg: x.gain, gmd: x.gmd })))
    : sessionStats(colCalc.filter((x) => x.c).map((x) => ({ qty: Number(x.r.qty), totalKg: x.c!.totalKg, avgKg: x.c!.avgKg })))

  /* ---------- Planilha individual ---------- */
  function addAnimals(ids: string[]) {
    const present = new Set(ind.map((r) => r.animalId).filter(Boolean))
    const dup = ids.filter((id) => present.has(id))
    if (dup.length) toast('error', `${dup.length} animal(is) já estava(m) na planilha e não foram repetidos.`)
    const add = ids.filter((id) => !present.has(id)).map((id) => ({ key: rk(), animalId: id, tag: animals.find((a) => a.id === id)!.tag, kg: '' }))
    setInd((rows) => [...rows.filter((r) => r.animalId || r.tag || r.kg), ...add])
  }
  function setTag(key: string, tag: string) {
    const t = tag.trim().toLowerCase()
    const a = t ? animals.find((x) => x.status === 'ativo' && x.tag.toLowerCase() === t) : undefined
    if (a && ind.some((r) => r.key !== key && r.animalId === a.id)) { toast('error', `O animal ${a.tag} já está nesta pesagem.`); return setInd((rows) => rows.map((r) => (r.key === key ? { ...r, tag, animalId: '' } : r))) }
    setInd((rows) => rows.map((r) => (r.key === key ? { ...r, tag, animalId: a?.id ?? '' } : r)))
  }
  const focus = (key: string, f: string) => setTimeout(() => document.querySelector<HTMLElement>(`[data-w="${key}:${f}"]`)?.focus(), 0)
  function onKey(e: KeyboardEvent, i: number, f: string) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (i < ind.length - 1) focus(ind[i + 1].key, f)
    else { const k = rk(); setInd((rows) => [...rows, { key: k, animalId: '', tag: '', kg: '' }]); focus(k, 'tag') }
  }
  // Colar de outra planilha: 1 coluna = pesos a partir da linha atual; 2 colunas = identificação + peso.
  function onPaste(e: ClipboardEvent, i: number) {
    const data = parsePasted(e.clipboardData.getData('text'))
    if (data.length < 2 && (data[0]?.length ?? 0) < 2) return
    e.preventDefault()
    setInd((rows) => {
      const out = [...rows]
      const used = new Set(out.map((r) => r.animalId).filter(Boolean))
      let skipped = 0
      data.forEach((cells, j) => {
        if (cells.length >= 2) {
          const tag = cells[0], a = animals.find((x) => x.status === 'ativo' && x.tag.toLowerCase() === tag.toLowerCase())
          if (a && used.has(a.id)) { skipped++; return }
          if (a) used.add(a.id)
          const existing = out.findIndex((r) => r.tag.toLowerCase() === tag.toLowerCase())
          if (existing >= 0) out[existing] = { ...out[existing], kg: cells[1] }
          else out.push({ key: rk(), tag, animalId: a?.id ?? '', kg: cells[1] })
        } else {
          const idx = i + j
          if (idx < out.length) out[idx] = { ...out[idx], kg: cells[0] }
          else out.push({ key: rk(), tag: '', animalId: '', kg: cells[0] })
        }
      })
      if (skipped) setTimeout(() => toast('error', `${skipped} linha(s) repetida(s) ignorada(s).`), 0)
      return out
    })
  }

  /* ---------- Fluxo ---------- */
  function openSheet() {
    if (!h.date || h.date > today()) return setErrors({ date: 'Data inválida ou no futuro.' })
    if (!h.responsible.trim()) return setErrors({ responsible: 'Informe o responsável.' })
    if (h.mode === 'individual' && !h.lotId) return setErrors({ lotId: 'Selecione o lote.' })
    setErrors({})
    if (h.mode === 'individual' && !ind.length) {
      const ids = identified(h.lotId).filter((a) => !h.categoryId || a.categoryId === h.categoryId).map((a) => a.id)
      setPicker(ids)
    }
    if (h.mode === 'collective' && !col.length) setCol([{ key: rk(), lotId: h.lotId, categoryId: h.categoryId, date: h.date, qty: lot ? String(h.categoryId ? Object.entries(lot.balances).filter(([k]) => k.startsWith(h.categoryId + '|')).reduce((s, [, q]) => s + q, 0) : lot.count) : '', totalKg: '', avgKg: '' }])
    setStep('sheet')
  }

  function validate(): string {
    const e: Record<string, string> = {}
    if (h.mode === 'individual') {
      const filled = indCalc.filter((x) => x.r.tag || x.r.kg)
      if (!filled.length) return 'Informe ao menos um peso.'
      const seen = new Set<string>()
      for (const x of filled) {
        const a = animals.find((y) => y.id === x.r.animalId)
        if (!x.r.tag.trim()) e[x.r.key] = 'Identificação vazia'
        else if (x.kg == null) e[x.r.key] = 'Peso inválido (use kg, ex.: 330,5)'
        else if (a && a.lotId !== h.lotId) e[x.r.key] = `Animal pertence ao lote ${lotName(a.lotId)}`
        else if (a && a.status !== 'ativo') e[x.r.key] = 'Animal não está ativo'
        const k = x.r.animalId || x.r.tag.toLowerCase()
        if (seen.has(k)) e[x.r.key] = 'Animal repetido nesta pesagem'
        seen.add(k)
      }
      if (filled.length > MAX_WEIGH_ROWS) return `Máximo de ${MAX_WEIGH_ROWS} animais por pesagem.`
    } else {
      const filled = colCalc.filter((x) => x.r.qty || x.r.totalKg || x.r.avgKg)
      if (!filled.length) return 'Preencha ao menos uma linha.'
      for (const x of filled) {
        const l = lots.find((y) => y.id === x.r.lotId)
        if (!l) e[x.r.key] = 'Selecione o lote'
        else if (!x.c) e[x.r.key] = 'Informe quantidade e peso total ou médio'
        else if (Number(x.r.qty) > l.count) e[x.r.key] = `Quantidade maior que o saldo do lote (${l.count})`
        else if (!x.r.date || x.r.date > today()) e[x.r.key] = 'Data inválida'
      }
    }
    setErrors(e)
    const n = Object.keys(e).length
    return n ? `Corrija ${n} linha(s) destacada(s).` : ''
  }

  function buildRecords(): NewRecord[] {
    if (h.mode === 'individual') return indCalc.filter((x) => x.kg != null && x.r.tag.trim()).map((x) => {
      const a = animals.find((y) => y.id === x.r.animalId)
      return { lotId: h.lotId, categoryId: a?.categoryId ?? (h.categoryId || null), animalId: a?.id ?? null, tag: x.r.tag.trim(), qty: 1, totalKg: x.kg!, avgKg: x.kg!,
        prevKg: x.prev?.kg ?? null, prevDate: x.prev?.date ?? null, gainKg: x.gain, gmd: x.gmd, method: 'individual' }
    })
    return colCalc.filter((x) => x.c).map((x) => ({ lotId: x.r.lotId, categoryId: x.r.categoryId || null, date: x.r.date, animalId: null, tag: null, qty: Number(x.r.qty),
      totalKg: x.c!.totalKg, avgKg: x.c!.avgKg, method: x.c!.method, lotCountAtWeighing: lots.find((l) => l.id === x.r.lotId)?.count ?? null }))
  }

  async function save() {
    setSaving(true); setSaveErr('')
    try {
      const res = await saveWeighingSession(farm!.id, h.sessionId, { date: h.date, mode: h.mode, lotId: h.lotId, categoryId: h.categoryId || null, responsible: h.responsible.trim(), location: h.location.trim(), notes: h.notes.trim(), source: 'manual' },
        buildRecords(), { animals, lots })
      localStorage.removeItem(draftKey)
      toast(res === 'already-saved' ? 'info' : 'success', res === 'already-saved' ? 'Esta pesagem já havia sido salva — nada duplicado.' : `Pesagem salva: ${stats.count} cab., média ${number(stats.avgKg)} kg.`)
      setReview(false); setInd([]); setCol([]); setStep('header')
      setH({ ...h, sessionId: newId(farm!.id, 'weighingSessions') })
      reload()
    } catch (e) { setSaveErr(friendlyError(e)) } finally { setSaving(false) }
  }

  if (!canEdit) return <ErrorBox>Seu perfil é somente leitura.</ErrorBox>

  /* ---------- Cabeçalho ---------- */
  if (step === 'header') return (
    <>
      <PageHeader title="Nova pesagem" subtitle={farm!.name} />
      <Card>
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Data da pesagem *" error={errors.date}><input type="date" className="input" value={h.date} max={today()} onChange={(e) => setH({ ...h, date: e.target.value })} /></Field>
          <Field label="Tipo de pesagem">
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-stone-300 p-0.5 dark:border-stone-700">
              {(['individual', 'collective'] as const).map((m) => <button key={m} type="button" onClick={() => setH({ ...h, mode: m })} className={cx('rounded-md py-1.5 text-sm', h.mode === m ? 'bg-brand-600 text-white' : '')}>{m === 'individual' ? 'Individual' : 'Coletiva'}</button>)}
            </div>
          </Field>
          <Field label={`Lote${h.mode === 'individual' ? ' *' : ''}`} error={errors.lotId} hint={lot ? `${lot.count} animais no lote · ${identified(lot.id).length} identificados` : undefined}>
            <select className="input" value={h.lotId} onChange={(e) => setH({ ...h, lotId: e.target.value })}><option value="">Selecione…</option>{activeLots.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.count})</option>)}</select>
          </Field>
          <Field label="Categoria"><select className="input" value={h.categoryId} onChange={(e) => setH({ ...h, categoryId: e.target.value })}><option value="">Todas</option>{categories.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Responsável pela pesagem *" error={errors.responsible}><input className="input" value={h.responsible} onChange={(e) => setH({ ...h, responsible: e.target.value })} maxLength={120} /></Field>
          <Field label="Local da pesagem"><input className="input" value={h.location} onChange={(e) => setH({ ...h, location: e.target.value })} maxLength={120} placeholder="Ex.: curral da sede" /></Field>
          <Field label="Observações gerais" className="sm:col-span-2 lg:col-span-3"><input className="input" value={h.notes} onChange={(e) => setH({ ...h, notes: e.target.value })} maxLength={500} /></Field>
        </div>
        <p className="px-4 pb-3 text-xs text-stone-500">{h.mode === 'individual' ? 'Individual: cada animal identificado recebe seu peso e histórico próprio.' : 'Coletiva: registra quantidade, peso total e médio do lote, sem criar registros individuais.'}</p>
        <div className="flex justify-end border-t border-stone-200 p-3 dark:border-stone-800"><Button onClick={openSheet}>Abrir planilha</Button></div>
      </Card>
    </>
  )

  /* ---------- Planilha ---------- */
  const lotAnimals = h.lotId ? identified(h.lotId) : []
  return (
    <div className="pb-36 lg:pb-24">
      <PageHeader title={`Pesagem ${h.mode === 'individual' ? 'individual' : 'coletiva'}`}
        subtitle={`${fmtDate(h.date)}${h.lotId ? ` · ${lotName(h.lotId)}` : ''}${h.categoryId ? ` · ${catName(h.categoryId)}` : ''} · ${h.responsible}`}
        actions={<><Button variant="ghost" onClick={() => setStep('header')}>Alterar cabeçalho</Button><Button variant="ghost" onClick={() => { if (confirm('Descartar esta pesagem?')) { localStorage.removeItem(draftKey); setInd([]); setCol([]); setStep('header') } }}>Descartar</Button></>} />

      {h.mode === 'individual' ? (
        <Card title={`Animais (${ind.length})`} action={<Button size="sm" variant="secondary" onClick={() => setPicker(lotAnimals.filter((a) => !h.categoryId || a.categoryId === h.categoryId).map((a) => a.id))}><ListPlus className="size-4" />Selecionar do lote</Button>}>
          <div className="hidden grid-cols-[36px_1.2fr_1.3fr_110px_120px_100px_120px_64px] gap-2 border-b border-stone-200 px-3 py-2 md:grid dark:border-stone-800">
            {['Nº', 'Identificação', 'Animal', 'Peso anterior', 'Peso atual', 'Diferença', 'GMD', ''].map((x) => <div key={x} className="th px-1 py-0">{x}</div>)}
          </div>
          <div className="divide-y divide-stone-100 dark:divide-stone-800">
            {indCalc.map(({ r, kg, prev, gain, gmd: g }, i) => {
              const a = animals.find((x) => x.id === r.animalId)
              return (
                <div key={r.key} className="grid grid-cols-[36px_1fr_110px_40px] items-center gap-x-2 gap-y-1 px-3 py-2 md:grid-cols-[36px_1.2fr_1.3fr_110px_120px_100px_120px_64px] md:py-1.5">
                  <span className="text-xs text-stone-400">{i + 1}</span>
                  <input className={cx('cell', errors[r.key] && 'border-red-500')} placeholder="Brinco" value={r.tag} list="ag-tags" data-w={`${r.key}:tag`}
                    onChange={(e) => setTag(r.key, e.target.value)} onKeyDown={(e) => onKey(e, i, 'tag')} onPaste={(e) => onPaste(e, i)} aria-label="Identificação" />
                  <input className={cx('cell tabular text-right md:order-none', errors[r.key] && 'border-red-500')} inputMode="decimal" placeholder="kg" value={r.kg} data-w={`${r.key}:kg`}
                    onChange={(e) => setInd((rows) => rows.map((x) => (x.key === r.key ? { ...x, kg: e.target.value } : x)))} onKeyDown={(e) => onKey(e, i, 'kg')} onPaste={(e) => onPaste(e, i)} aria-label="Peso atual (kg)" />
                  <div className="flex justify-end gap-0.5 md:order-last">
                    <button className="hidden rounded-md p-1.5 text-stone-400 hover:text-stone-700 md:block" title="Duplicar linha (sem o animal)" onClick={() => setInd((rows) => { const j = rows.findIndex((x) => x.key === r.key); const c = [...rows]; c.splice(j + 1, 0, { key: rk(), animalId: '', tag: '', kg: r.kg }); return c })}><Copy className="size-4" /></button>
                    <button className="rounded-md p-1.5 text-stone-400 hover:text-red-600" title="Excluir linha" onClick={() => setInd((rows) => rows.filter((x) => x.key !== r.key))}><Trash2 className="size-4" /></button>
                  </div>
                  <div className="col-span-3 col-start-2 truncate text-xs text-stone-500 md:col-span-1 md:col-start-auto md:order-none md:text-sm">
                    {a ? `${a.name ? a.name + ' · ' : ''}${catName(a.categoryId)}` : r.tag ? <Badge tone="amber">sem cadastro</Badge> : ''}
                  </div>
                  <div className="col-span-3 col-start-2 flex gap-3 text-xs md:contents md:text-sm">
                    <span className="tabular text-stone-500 md:text-right" title={prev ? `${prev.source} em ${fmtDate(prev.date)}` : undefined}>{prev ? `${number(prev.kg)} kg` : 'sem anterior'}</span>
                    <span className="hidden md:block" />
                    <span className={cx('tabular md:text-right', gainTone(gain))}>{gain == null ? '—' : `${gain > 0 ? '+' : ''}${number(gain)} kg`}</span>
                    <span className={cx('tabular md:text-right', gainTone(g))}>{kg == null ? '' : fmtGmd(g)}</span>
                  </div>
                  {errors[r.key] && <div className="col-span-full pl-10 text-xs text-red-600">{errors[r.key]}</div>}
                </div>
              )
            })}
          </div>
          <datalist id="ag-tags">{lotAnimals.map((a) => <option key={a.id} value={a.tag} />)}</datalist>
          <div className="flex flex-wrap items-center gap-2 border-t border-stone-200 p-3 text-xs text-stone-500 dark:border-stone-800">
            <Button size="sm" variant="secondary" onClick={() => { const k = rk(); setInd((rows) => [...rows, { key: k, animalId: '', tag: '', kg: '' }]); focus(k, 'tag') }}><Plus className="size-4" />Adicionar linha</Button>
            Enter desce para a próxima linha · cole colunas “brinco + peso” ou só pesos direto do Excel.
          </div>
        </Card>
      ) : (
        <Card title="Pesagem coletiva — dado agregado do lote">
          <div className="hidden grid-cols-[1.3fr_1fr_140px_100px_120px_120px_40px] gap-2 border-b border-stone-200 px-3 py-2 md:grid dark:border-stone-800">
            {['Lote', 'Categoria', 'Data', 'Quantidade', 'Peso total (kg)', 'Peso médio (kg)', ''].map((x) => <div key={x} className="th px-1 py-0">{x}</div>)}
          </div>
          <div className="divide-y divide-stone-100 dark:divide-stone-800">
            {colCalc.map(({ r, c }) => {
              const upd = (p: Partial<ColRow>) => setCol((rows) => rows.map((x) => (x.key === r.key ? { ...x, ...p } : x)))
              const prevCol = history.filter((w) => w.mode === 'collective' && w.lotId === r.lotId && w.date < r.date).sort((a, b) => b.date.localeCompare(a.date))[0]
              const cmp = prevCol && c ? collectiveComparison(prevCol, { ...prevCol, date: r.date, qty: Number(r.qty), avgKg: c.avgKg } as Weighing, movs) : null
              return (
                <div key={r.key} className="grid grid-cols-2 gap-1.5 px-3 py-2 md:grid-cols-[1.3fr_1fr_140px_100px_120px_120px_40px] md:gap-2 md:py-1.5">
                  <select className={cx('cell', errors[r.key] && 'border-red-500')} value={r.lotId} onChange={(e) => upd({ lotId: e.target.value })} aria-label="Lote"><option value="">Lote…</option>{activeLots.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.count})</option>)}</select>
                  <select className="cell" value={r.categoryId} onChange={(e) => upd({ categoryId: e.target.value })} aria-label="Categoria"><option value="">Todas</option>{categories.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                  <input type="date" className="cell" value={r.date} max={today()} onChange={(e) => upd({ date: e.target.value })} aria-label="Data" />
                  <input className="cell tabular text-right" inputMode="numeric" placeholder="Qtd." value={r.qty} onChange={(e) => upd({ qty: e.target.value.replace(/\D/g, '') })} aria-label="Quantidade pesada" />
                  <input className="cell tabular text-right" inputMode="decimal" placeholder={c?.method === 'media_informada' ? number(c.totalKg) : 'Total'} value={r.totalKg} onChange={(e) => upd({ totalKg: e.target.value, avgKg: e.target.value ? '' : r.avgKg })} aria-label="Peso total (kg)" />
                  <input className="cell tabular text-right" inputMode="decimal" placeholder={c?.method === 'balanca_coletiva' ? number(c.avgKg) : 'Médio'} value={r.avgKg} onChange={(e) => upd({ avgKg: e.target.value, totalKg: e.target.value ? '' : r.totalKg })} aria-label="Peso médio (kg)" />
                  <button className="justify-self-end rounded-md p-1.5 text-stone-400 hover:text-red-600" onClick={() => setCol((rows) => rows.filter((x) => x.key !== r.key))} aria-label="Excluir linha"><Trash2 className="size-4" /></button>
                  {(c || prevCol) && <div className="col-span-full text-xs text-stone-500">
                    {c && <>Total {number(c.totalKg)} kg · média {number(c.avgKg)} kg ({number(toArrobas(c.avgKg, arroba.vivo))} @ vivo/cab.) · {c.method === 'balanca_coletiva' ? 'balança coletiva' : 'média informada'}. </>}
                    {prevCol && cmp && <>Anterior ({fmtDate(prevCol.date)}): {number(prevCol.avgKg)} kg → <span className={gainTone(cmp.diffAvg)}>{cmp.diffAvg > 0 ? '+' : ''}{number(cmp.diffAvg)} kg</span>{cmp.comparable ? <> · GMD {fmtGmd(cmp.gmd)}</> : <span className="text-amber-700 dark:text-amber-400"> · não comparável: {cmp.reasons.join('; ')}</span>}</>}
                  </div>}
                  {errors[r.key] && <div className="col-span-full text-xs text-red-600">{errors[r.key]}</div>}
                </div>
              )
            })}
          </div>
          <div className="border-t border-stone-200 p-3 dark:border-stone-800">
            <Button size="sm" variant="secondary" onClick={() => setCol((rows) => [...rows, { key: rk(), lotId: '', categoryId: '', date: h.date, qty: '', totalKg: '', avgKg: '' }])}><Plus className="size-4" />Adicionar lote</Button>
          </div>
        </Card>
      )}

      {/* Indicadores em tempo real */}
      <div className="no-print fixed inset-x-0 bottom-[calc(3.6rem+env(safe-area-inset-bottom))] z-20 border-t border-stone-200 bg-white/95 px-4 py-2.5 backdrop-blur dark:border-stone-800 dark:bg-stone-900/95 lg:bottom-0 lg:left-64">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <span><span className="text-stone-500">Pesados</span> <b className="tabular">{stats.count}</b></span>
          <span><span className="text-stone-500">Total</span> <b className="tabular">{number(stats.totalKg)} kg</b></span>
          <span><span className="text-stone-500">Médio</span> <b className="tabular">{number(stats.avgKg)} kg</b> <span className="text-xs text-stone-500">({number(toArrobas(stats.avgKg, arroba.vivo))} @ vivo)</span></span>
          {stats.maxKg != null && <span className="hidden sm:inline"><span className="text-stone-500">Maior/menor</span> <b className="tabular">{number(stats.maxKg)} / {number(stats.minKg!)} kg</b></span>}
          {h.mode === 'individual' && <span><span className="text-stone-500">Ganho médio</span> <b className={cx('tabular', gainTone(stats.gainAvg))}>{stats.gainAvg == null ? '—' : `${number(stats.gainAvg)} kg`}</b></span>}
          {h.mode === 'individual' && <span><span className="text-stone-500">GMD médio</span> <b className={cx('tabular', gainTone(stats.gmdAvg))}>{fmtGmd(stats.gmdAvg)}</b>{stats.gmdAvg != null && <span className="text-xs text-stone-500"> ({stats.gmdCount})</span>}</span>}
          <Button className="ml-auto" onClick={() => { const e = validate(); if (e) toast('error', e); else { setSaveErr(''); setReview(true) } }}><Save className="size-4" />Salvar pesagem</Button>
        </div>
      </div>

      <Modal open={!!picker} onClose={() => setPicker(null)} title={`Animais identificados em ${lotName(h.lotId)}`} wide
        footer={<><Button variant="secondary" onClick={() => setPicker(null)}>Cancelar</Button><Button onClick={() => { addAnimals(picker ?? []); setPicker(null) }}>Adicionar {picker?.length ?? 0}</Button></>}>
        {lotAnimals.length === 0 ? <p className="text-sm text-stone-500">Nenhum animal identificado neste lote. Digite as identificações na planilha ou use a pesagem coletiva.</p> : (
          <div className="space-y-2">
            <div className="flex gap-2 text-sm"><button className="text-brand-700 underline dark:text-brand-300" onClick={() => setPicker(lotAnimals.map((a) => a.id))}>Todos</button><button className="text-stone-500 underline" onClick={() => setPicker([])}>Nenhum</button></div>
            <div className="flex flex-wrap gap-1.5">
              {lotAnimals.map((a) => { const on = picker?.includes(a.id); const inSheet = ind.some((r) => r.animalId === a.id)
                return <button key={a.id} disabled={inSheet} onClick={() => setPicker((p) => (on ? (p ?? []).filter((x) => x !== a.id) : [...(p ?? []), a.id]))}
                  className={cx('rounded-full border px-2.5 py-1 text-xs disabled:opacity-40', on ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-300 dark:border-stone-700')}>{a.tag} · {catName(a.categoryId)}{inSheet ? ' ✓' : ''}</button> })}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={review} onClose={() => !saving && setReview(false)} title="Conferir pesagem"
        footer={<><Button variant="secondary" disabled={saving} onClick={() => setReview(false)}>Voltar</Button><Button loading={saving} onClick={save}>Confirmar e salvar</Button></>}>
        <div className="space-y-2 text-sm">
          <p><b>{h.mode === 'individual' ? 'Individual' : 'Coletiva'}</b> em {fmtDate(h.date)}{h.lotId && <> · lote <b>{lotName(h.lotId)}</b></>} · responsável {h.responsible}</p>
          <p>{stats.count} animal(is) · total {number(stats.totalKg)} kg · média {number(stats.avgKg)} kg{stats.maxKg != null && <> · maior {number(stats.maxKg)} / menor {number(stats.minKg!)} kg</>}</p>
          {h.mode === 'individual' && <p>Ganho médio: {stats.gainAvg == null ? 'indisponível' : `${number(stats.gainAvg)} kg`} · GMD médio: {stats.gmdAvg == null ? 'indisponível (sem pesagem anterior válida)' : `${fmtGmd(stats.gmdAvg)} (${stats.gmdCount} animais)`}</p>}
          <p className="text-stone-500">A pesagem não altera a quantidade de animais, vendas ou registros financeiros. Pesagens anteriores são preservadas.</p>
          {saveErr && <ErrorBox>{saveErr}</ErrorBox>}
        </div>
      </Modal>
    </div>
  )
}
