import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Copy, Plus, Save, Trash2, Eraser } from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import { MAX_SHEET_ROWS, friendlyError, newId, saveSheet } from '../lib/db'
import { fmtDate, money, parseMoney, today } from '../lib/format'
import {
  emptyLabor, emptyOther, isBlankLabor, isBlankOther, laborTotals, otherTotal, rowKey, validateSheet,
  type LaborRow, type OtherRow, type RowErrors, type ValidatedSheet,
} from '../lib/sheet'
import { Button, Card, ErrorBox, Field, Modal, PageHeader, cx, useToast } from '../components/ui'

interface Draft { batchId: string; defaultDate: string; labor: LaborRow[]; other: OtherRow[] }


function loadDraft(key: string): Draft | null {
  try { const d = JSON.parse(localStorage.getItem(key) || 'null'); return d?.batchId ? d : null } catch { return null }
}

export default function ExpenseSheet() {
  const { farm, laborTypes, categories, collaborators, canEdit } = useApp()
  const toast = useToast()
  const draftKey = `ag-draft-${farm!.id}`
  const fresh = (date = today()): Draft => ({ batchId: newId(farm!.id, 'expenseBatches'), defaultDate: date, labor: [emptyLabor(date)], other: [emptyOther(date)] })
  const [draft, setDraft] = useState<Draft>(() => loadDraft(draftKey) ?? fresh())
  const [errors, setErrors] = useState<RowErrors>({})
  const [review, setReview] = useState<ValidatedSheet | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const savingRef = useRef(false)
  const restored = useRef(loadDraft(draftKey) != null)

  // Rascunho persistido localmente: nada se perde se a gravação falhar ou o app fechar.
  useEffect(() => {
    const hasContent = draft.labor.some((r) => !isBlankLabor(r)) || draft.other.some((r) => !isBlankOther(r))
    try { if (hasContent) localStorage.setItem(draftKey, JSON.stringify(draft)); else localStorage.removeItem(draftKey) } catch { /* armazenamento cheio */ }
  }, [draft, draftKey])

  useEffect(() => { if (restored.current) toast('info', 'Rascunho não salvo recuperado.') }, [toast])

  const activeTypes = laborTypes.filter((t) => t.active)
  const activeCats = categories.filter((c) => c.active)
  const activeCols = collaborators.filter((c) => c.active)
  const lt = useMemo(() => laborTotals(draft.labor, collaborators), [draft.labor, collaborators])
  const ot = useMemo(() => otherTotal(draft.other), [draft.other])
  const rowCount = draft.labor.length + draft.other.length

  const setDefaultDate = (date: string) => setDraft((d) => ({
    ...d, defaultDate: date,
    labor: d.labor.map((r) => (r.date === d.defaultDate ? { ...r, date } : r)),
    other: d.other.map((r) => (r.date === d.defaultDate ? { ...r, date } : r)),
  }))
  const applyDateToAll = () => setDraft((d) => ({ ...d, labor: d.labor.map((r) => ({ ...r, date: d.defaultDate })), other: d.other.map((r) => ({ ...r, date: d.defaultDate })) }))

  function updLabor(key: string, patch: Partial<LaborRow>) {
    setDraft((d) => ({ ...d, labor: d.labor.map((r) => (r.key === key ? { ...r, ...patch } : r)) }))
    clearErr(key, Object.keys(patch))
  }
  function updOther(key: string, patch: Partial<OtherRow>) {
    setDraft((d) => ({ ...d, other: d.other.map((r) => (r.key === key ? { ...r, ...patch } : r)) }))
    clearErr(key, Object.keys(patch))
  }
  function clearErr(key: string, fields: string[]) {
    setErrors((e) => {
      if (!e[key]) return e
      const n = { ...e[key] }
      fields.forEach((f) => delete n[f])
      return { ...e, [key]: n }
    })
  }

  function addRow(section: 'labor' | 'other', after?: string, copy?: LaborRow | OtherRow) {
    if (rowCount >= MAX_SHEET_ROWS) return toast('error', `Limite de ${MAX_SHEET_ROWS} linhas por lançamento. Salve e inicie outro.`)
    const row = copy ? { ...copy, key: rowKey() } : section === 'labor' ? emptyLabor(draft.defaultDate) : emptyOther(draft.defaultDate)
    setDraft((d) => {
      const list = [...(d[section] as (LaborRow | OtherRow)[])]
      const idx = after ? list.findIndex((r) => r.key === after) + 1 : list.length
      list.splice(idx, 0, row)
      return { ...d, [section]: list }
    })
    setTimeout(() => focusCell(section, row.key, section === 'labor' ? 'laborTypeId' : 'categoryId'), 0)
  }
  function removeRow(section: 'labor' | 'other', key: string) {
    setDraft((d) => {
      const list = (d[section] as (LaborRow | OtherRow)[]).filter((r) => r.key !== key)
      return { ...d, [section]: list.length ? list : [section === 'labor' ? emptyLabor(d.defaultDate) : emptyOther(d.defaultDate)] }
    })
  }

  function focusCell(section: string, key: string, col: string) {
    document.querySelector<HTMLElement>(`[data-cell="${section}:${key}:${col}"]`)?.focus()
  }
  // Enter: desce para a mesma coluna da próxima linha (cria nova linha se for a última).
  function onCellKey(e: KeyboardEvent, section: 'labor' | 'other', key: string, col: string) {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    e.preventDefault()
    const list = draft[section] as { key: string }[]
    const i = list.findIndex((r) => r.key === key)
    if (i < list.length - 1) focusCell(section, list[i + 1].key, col)
    else addRow(section)
  }

  function startSave() {
    setSaveError('')
    const v = validateSheet(draft.labor, draft.other, laborTypes, categories, collaborators)
    setErrors(v.errors)
    const nErr = Object.values(v.errors).filter((e) => Object.keys(e).length).length
    if (nErr) return toast('error', `Corrija ${nErr} linha(s) destacada(s) antes de salvar.`)
    if (!v.labor.length && !v.other.length) return toast('error', 'Preencha pelo menos uma linha.')
    setReview(v)
  }

  async function confirmSave() {
    if (!review || savingRef.current) return // trava contra clique duplo
    savingRef.current = true
    setSaving(true); setSaveError('')
    try {
      const r = await saveSheet(farm!.id, draft.batchId, review)
      localStorage.removeItem(draftKey)
      toast('success', r === 'already-saved' ? 'Este lançamento já havia sido salvo — nenhuma duplicidade criada.' : `${review.labor.length + review.other.length} lançamento(s) salvos.`)
      setReview(null)
      setErrors({})
      setDraft(fresh(draft.defaultDate))
    } catch (e) {
      setSaveError(friendlyError(e))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  function discard() {
    if (!confirm('Descartar todas as linhas desta planilha?')) return
    localStorage.removeItem(draftKey)
    setErrors({})
    setDraft(fresh(draft.defaultDate))
  }

  if (!canEdit) return <ErrorBox>Seu perfil é somente leitura.</ErrorBox>

  const cellCls = (key: string, f: string) => cx('cell', errors[key]?.[f] && 'input-error border-red-500 bg-red-50/50 dark:bg-red-950/30')
  const errText = (key: string) => {
    const e = errors[key]
    return e && Object.values(e).filter(Boolean).length ? <div className="col-span-full px-2 text-xs text-red-600">{Object.values(e).filter(Boolean).join(' · ')}</div> : null
  }

  return (
    <div className="pb-40 lg:pb-28">
      <Link to="/despesas" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 hover:underline"><ArrowLeft className="size-4" />Despesas</Link>
      <PageHeader title="Novo lançamento" subtitle="Registre vários pagamentos e despesas de uma vez"
        actions={<Button variant="ghost" onClick={discard}><Eraser className="size-4" />Limpar</Button>} />

      <div className="card mb-5 flex flex-wrap items-end gap-3 p-4">
        <Field label="Data do pagamento"><input type="date" className="input w-auto" value={draft.defaultDate} onChange={(e) => e.target.value && setDefaultDate(e.target.value)} /></Field>
        <Button variant="secondary" onClick={applyDateToAll}>Aplicar a todas as linhas</Button>
        <p className="text-xs text-stone-500 sm:ml-auto sm:max-w-xs">A data pode ser alterada em cada linha. Use Tab para avançar e Enter para descer à próxima linha.</p>
      </div>

      {/* Mão de obra */}
      <Card title="Mão de obra" className="mb-5" action={<span className="text-xs text-stone-500">{draft.labor.length} linha(s)</span>}>
        <div className="hidden grid-cols-[150px_1fr_1fr_130px_1fr_72px] gap-2 border-b border-stone-200 px-3 py-2 md:grid dark:border-stone-800">
          {['Data', 'Tipo de mão de obra', 'Colaborador', 'Valor', 'Observação', ''].map((h) => <div key={h} className="th px-2 py-0">{h}</div>)}
        </div>
        <div className="divide-y divide-stone-100 dark:divide-stone-800">
          {draft.labor.map((r, i) => {
            const options = activeCols.filter((c) => c.laborTypeId === r.laborTypeId)
            return (
              <div key={r.key} className="grid grid-cols-2 gap-1.5 px-3 py-2 md:grid-cols-[150px_1fr_1fr_130px_1fr_72px] md:gap-2 md:py-1.5">
                <div className="col-span-2 flex items-center justify-between text-xs font-medium text-stone-400 md:hidden">Linha {i + 1}</div>
                <input type="date" aria-label="Data" data-cell={`labor:${r.key}:date`} className={cellCls(r.key, 'date')} value={r.date}
                  onChange={(e) => updLabor(r.key, { date: e.target.value })} onKeyDown={(e) => onCellKey(e, 'labor', r.key, 'date')} />
                <select aria-label="Tipo de mão de obra" data-cell={`labor:${r.key}:laborTypeId`} className={cellCls(r.key, 'laborTypeId')} value={r.laborTypeId}
                  onChange={(e) => updLabor(r.key, { laborTypeId: e.target.value, collaboratorId: '' })} onKeyDown={(e) => onCellKey(e, 'labor', r.key, 'laborTypeId')}>
                  <option value="">Tipo…</option>
                  {activeTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select aria-label="Colaborador" data-cell={`labor:${r.key}:collaboratorId`} className={cx(cellCls(r.key, 'collaboratorId'), 'col-span-2 md:col-span-1')} value={r.collaboratorId}
                  disabled={!r.laborTypeId} onChange={(e) => updLabor(r.key, { collaboratorId: e.target.value })} onKeyDown={(e) => onCellKey(e, 'labor', r.key, 'collaboratorId')}>
                  <option value="">{!r.laborTypeId ? 'Escolha o tipo primeiro' : options.length ? 'Colaborador…' : 'Nenhum colaborador ativo deste tipo'}</option>
                  {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input inputMode="decimal" aria-label="Valor" placeholder="R$ 0,00" data-cell={`labor:${r.key}:amount`} className={cx(cellCls(r.key, 'amount'), 'tabular text-right')} value={r.amount}
                  onChange={(e) => updLabor(r.key, { amount: e.target.value })} onKeyDown={(e) => onCellKey(e, 'labor', r.key, 'amount')}
                  onBlur={() => { const c = parseMoney(r.amount); if (c != null) updLabor(r.key, { amount: (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }) }} />
                <input aria-label="Observação" placeholder="Observação" maxLength={300} data-cell={`labor:${r.key}:note`} className={cellCls(r.key, 'note')} value={r.note}
                  onChange={(e) => updLabor(r.key, { note: e.target.value })} onKeyDown={(e) => onCellKey(e, 'labor', r.key, 'note')} />
                <div className="col-span-2 flex justify-end gap-0.5 md:col-span-1">
                  <button type="button" className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800" onClick={() => addRow('labor', r.key, r)} aria-label="Duplicar linha" title="Duplicar"><Copy className="size-4" /></button>
                  <button type="button" className="rounded-md p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" onClick={() => removeRow('labor', r.key)} aria-label="Excluir linha" title="Excluir"><Trash2 className="size-4" /></button>
                </div>
                {errText(r.key)}
              </div>
            )
          })}
        </div>
        <div className="border-t border-stone-200 p-3 dark:border-stone-800">
          <Button variant="secondary" size="sm" onClick={() => addRow('labor')}><Plus className="size-4" />Adicionar linha</Button>
        </div>
        {lt.perCollaborator.length > 0 && (
          <div className="border-t border-stone-200 bg-stone-50/60 px-4 py-3 dark:border-stone-800 dark:bg-stone-900/60">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">Total por colaborador</div>
            <ul className="text-sm">
              {lt.perCollaborator.map((p) => <li key={p.id} className="flex justify-between py-0.5"><span>{p.name}</span><span className="tabular">{money(p.total)}</span></li>)}
            </ul>
            <div className="mt-1 flex justify-between border-t border-stone-200 pt-2 font-semibold dark:border-stone-700"><span>TOTAL MÃO DE OBRA</span><span className="tabular">{money(lt.total)}</span></div>
          </div>
        )}
      </Card>

      {/* Outras despesas */}
      <Card title="Outras despesas" action={<span className="text-xs text-stone-500">{draft.other.length} linha(s)</span>}>
        <div className="hidden grid-cols-[150px_1fr_1.4fr_130px_72px] gap-2 border-b border-stone-200 px-3 py-2 md:grid dark:border-stone-800">
          {['Data', 'Categoria', 'Descrição', 'Valor', ''].map((h) => <div key={h} className="th px-2 py-0">{h}</div>)}
        </div>
        <div className="divide-y divide-stone-100 dark:divide-stone-800">
          {draft.other.map((r, i) => (
            <div key={r.key} className="grid grid-cols-2 gap-1.5 px-3 py-2 md:grid-cols-[150px_1fr_1.4fr_130px_72px] md:gap-2 md:py-1.5">
              <div className="col-span-2 text-xs font-medium text-stone-400 md:hidden">Linha {i + 1}</div>
              <input type="date" aria-label="Data" data-cell={`other:${r.key}:date`} className={cellCls(r.key, 'date')} value={r.date}
                onChange={(e) => updOther(r.key, { date: e.target.value })} onKeyDown={(e) => onCellKey(e, 'other', r.key, 'date')} />
              <select aria-label="Categoria" data-cell={`other:${r.key}:categoryId`} className={cellCls(r.key, 'categoryId')} value={r.categoryId}
                onChange={(e) => updOther(r.key, { categoryId: e.target.value })} onKeyDown={(e) => onCellKey(e, 'other', r.key, 'categoryId')}>
                <option value="">Categoria…</option>
                {activeCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input aria-label="Descrição" placeholder="Descrição" maxLength={300} data-cell={`other:${r.key}:description`} className={cx(cellCls(r.key, 'description'), 'col-span-2 md:col-span-1')} value={r.description}
                onChange={(e) => updOther(r.key, { description: e.target.value })} onKeyDown={(e) => onCellKey(e, 'other', r.key, 'description')} />
              <input inputMode="decimal" aria-label="Valor" placeholder="R$ 0,00" data-cell={`other:${r.key}:amount`} className={cx(cellCls(r.key, 'amount'), 'tabular text-right')} value={r.amount}
                onChange={(e) => updOther(r.key, { amount: e.target.value })} onKeyDown={(e) => onCellKey(e, 'other', r.key, 'amount')}
                onBlur={() => { const c = parseMoney(r.amount); if (c != null) updOther(r.key, { amount: (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }) }} />
              <div className="flex justify-end gap-0.5">
                <button type="button" className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800" onClick={() => addRow('other', r.key, r)} aria-label="Duplicar linha" title="Duplicar"><Copy className="size-4" /></button>
                <button type="button" className="rounded-md p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" onClick={() => removeRow('other', r.key)} aria-label="Excluir linha" title="Excluir"><Trash2 className="size-4" /></button>
              </div>
              {errText(r.key)}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-stone-200 p-3 dark:border-stone-800">
          <Button variant="secondary" size="sm" onClick={() => addRow('other')}><Plus className="size-4" />Adicionar linha</Button>
          <span className="text-sm font-semibold">Total: <span className="tabular">{money(ot)}</span></span>
        </div>
      </Card>

      {/* Rodapé fixo com resumo */}
      <div className="no-print fixed inset-x-0 bottom-[calc(3.6rem+env(safe-area-inset-bottom))] z-20 border-t border-stone-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-stone-800 dark:bg-stone-900/95 lg:bottom-0 lg:left-64">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2">
          <div className="text-sm"><span className="text-stone-500">Mão de obra</span> <b className="tabular">{money(lt.total)}</b></div>
          <div className="text-sm"><span className="text-stone-500">Outras</span> <b className="tabular">{money(ot)}</b></div>
          <div className="text-base"><span className="text-stone-500">Total geral</span> <b className="tabular text-brand-700 dark:text-brand-300">{money(lt.total + ot)}</b></div>
          <Button className="ml-auto" onClick={startSave}><Save className="size-4" />Salvar lançamentos</Button>
        </div>
      </div>

      <Modal open={!!review} onClose={() => !saving && setReview(null)} title="Conferir antes de salvar" wide
        footer={<><Button variant="secondary" disabled={saving} onClick={() => setReview(null)}>Voltar e editar</Button><Button loading={saving} onClick={confirmSave}>Confirmar e salvar</Button></>}>
        {review && (
          <div className="space-y-4 text-sm">
            {review.labor.length > 0 && (
              <div>
                <div className="mb-1 font-medium">Mão de obra ({review.labor.length})</div>
                <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
                  {review.labor.map((r, i) => <li key={i} className="flex justify-between gap-2 px-3 py-1.5"><span className="truncate">{fmtDate(r.date)} · {r.laborTypeName} · {r.collaboratorName}</span><span className="tabular">{money(r.amount)}</span></li>)}
                </ul>
              </div>
            )}
            {review.other.length > 0 && (
              <div>
                <div className="mb-1 font-medium">Outras despesas ({review.other.length})</div>
                <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
                  {review.other.map((r, i) => <li key={i} className="flex justify-between gap-2 px-3 py-1.5"><span className="truncate">{fmtDate(r.date)} · {r.categoryName}{r.description ? ` · ${r.description}` : ''}</span><span className="tabular">{money(r.amount)}</span></li>)}
                </ul>
              </div>
            )}
            <div className="rounded-lg bg-stone-50 p-3 dark:bg-stone-800/60">
              <div className="flex justify-between"><span>Mão de obra</span><span className="tabular">{money(review.labor.reduce((s, r) => s + r.amount, 0))}</span></div>
              <div className="flex justify-between"><span>Outras despesas</span><span className="tabular">{money(review.other.reduce((s, r) => s + r.amount, 0))}</span></div>
              <div className="mt-1 flex justify-between border-t border-stone-200 pt-1 font-semibold dark:border-stone-700"><span>TOTAL GERAL</span><span className="tabular">{money([...review.labor, ...review.other].reduce((s, r) => s + r.amount, 0))}</span></div>
            </div>
            {saveError && <ErrorBox>{saveError}</ErrorBox>}
          </div>
        )}
      </Modal>
    </div>
  )
}
