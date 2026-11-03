import { useMemo, useState } from 'react'
import { FileUp } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { useHerd } from '../../contexts/HerdContext'
import { friendlyError, newId } from '../../lib/db'
import { fmtDate, number, today } from '../../lib/format'
import { diffKg, gmd, guessMapping, IMPORT_FIELD_LABEL, parseCsv, previousWeighing, validateImport, type ImportField, type ImportRow, type Weighing } from '../../lib/weighing'
import { MAX_WEIGH_ROWS, saveWeighingSession, type NewRecord } from '../../lib/weighingDb'
import { Badge, Button, Card, ErrorBox, Field, PageHeader, cx, useToast } from '../../components/ui'
import { useWeigh } from './WeighContext'

async function readFile(file: File): Promise<unknown[][]> {
  if (/\.csv$|\.txt$/i.test(file.name)) return parseCsv(await file.text())
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('A planilha não tem abas.')
  const rows: unknown[][] = []
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = (row.values as unknown[]).slice(1).map((v) => (v && typeof v === 'object' && !(v instanceof Date) ? ((v as { result?: unknown; text?: unknown }).result ?? (v as { text?: unknown }).text ?? '') : v))
    rows.push(vals)
  })
  return rows
}

export default function WeighImport() {
  const { farm, canEdit, user } = useApp()
  const { lots, animals, lotName } = useHerd()
  const { active, weighings, reload } = useWeigh()
  const toast = useToast()
  const [importId, setImportId] = useState(() => newId(farm!.id, 'weighingSessions'))
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [fileName, setFileName] = useState('')
  const [raw, setRaw] = useState<unknown[][]>([])
  const [hasHeader, setHasHeader] = useState(true)
  const [map, setMap] = useState<Partial<Record<ImportField, number>>>({})
  const [defaults, setDefaults] = useState({ lotId: '', date: today(), responsible: user?.displayName ?? '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const header = hasHeader ? (raw[0] ?? []).map(String) : (raw[0] ?? []).map((_, i) => `Coluna ${i + 1}`)
  const body = hasHeader ? raw.slice(1) : raw
  const rows: ImportRow[] = useMemo(() => step < 3 ? [] : validateImport(body, map, { lots, animals, existing: weighings, defaultLotId: defaults.lotId, defaultDate: defaults.date, today: today() }),
    [step, body, map, lots, animals, weighings, defaults])
  const ok = rows.filter((r) => r.status === 'ok')

  async function onFile(file?: File) {
    if (!file) return
    setErr(''); setBusy(true)
    try {
      const data = await readFile(file)
      if (data.length < 1) throw new Error('Arquivo vazio.')
      setRaw(data); setFileName(file.name); setMap(guessMapping(data[0].map(String))); setStep(2)
    } catch (e) { setErr(friendlyError(e)) } finally { setBusy(false) }
  }

  async function confirm() {
    if (!defaults.responsible.trim()) return setErr('Informe o responsável pela pesagem importada.')
    setBusy(true); setErr('')
    try {
      // Agrupa por data + lote; ordena por data para o peso anterior considerar o próprio arquivo.
      const groups = new Map<string, ImportRow[]>()
      for (const r of [...ok].sort((a, b) => a.date!.localeCompare(b.date!))) { const k = `${r.date}|${r.lotId}`; groups.set(k, [...(groups.get(k) ?? []), r]) }
      const hist: Weighing[] = [...active]
      let n = 0, created = 0
      for (const [k, list] of groups) {
        const [date, lotId] = k.split('|')
        for (let i = 0; i < list.length; i += MAX_WEIGH_ROWS) {
          const chunk = list.slice(i, i + MAX_WEIGH_ROWS)
          const records: NewRecord[] = chunk.map((r) => {
            const prev = previousWeighing(hist, r.animalId!, date)
            const a = animals.find((x) => x.id === r.animalId)!
            return { lotId, categoryId: a.categoryId, animalId: a.id, tag: a.tag, qty: 1, totalKg: r.kg!, avgKg: r.kg!, prevKg: prev?.avgKg ?? null, prevDate: prev?.date ?? null, gainKg: diffKg(r.kg!, prev?.avgKg), gmd: gmd(r.kg!, date, prev?.avgKg, prev?.date), method: 'individual' }
          })
          // Id determinístico por grupo: repetir a confirmação não duplica sessões já gravadas.
          const res = await saveWeighingSession(farm!.id, `${importId}-${n++}`, { date, mode: 'individual', lotId, categoryId: null, responsible: defaults.responsible.trim(), notes: `Importado de ${fileName}`.slice(0, 500), source: 'importacao' }, records, { animals, lots })
          if (res === 'saved') created++
          records.forEach((r, j) => hist.push({ ...(r as Weighing), id: `tmp${n}-${j}`, sessionId: 'tmp', date, mode: 'individual' }))
        }
      }
      toast('success', `${ok.length} pesagem(ns) importada(s) em ${created} sessão(ões).`)
      reload(); setStep(1); setRaw([]); setImportId(newId(farm!.id, 'weighingSessions'))
    } catch (e) { setErr(friendlyError(e)) } finally { setBusy(false) }
  }

  if (!canEdit) return <ErrorBox>Seu perfil é somente leitura.</ErrorBox>
  return (
    <>
      <PageHeader title="Importar planilha de pesagem" subtitle="Excel (.xlsx) ou CSV com data, lote, identificação do animal e peso em kg" />
      <div className="mb-4 flex gap-2 text-sm">{['Arquivo', 'Mapear colunas', 'Validar e confirmar'].map((s, i) => <span key={s} className={cx('rounded-full px-3 py-1', step === i + 1 ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-500 dark:bg-stone-800')}>{i + 1}. {s}</span>)}</div>
      {err && <div className="mb-4"><ErrorBox>{err}</ErrorBox></div>}

      {step === 1 && (
        <Card><label className="flex cursor-pointer flex-col items-center gap-3 px-6 py-12 text-center">
          <FileUp className="size-8 text-brand-600" />
          <span className="font-medium">{busy ? 'Lendo arquivo…' : 'Selecionar arquivo .xlsx ou .csv'}</span>
          <span className="max-w-md text-sm text-stone-500">Cada linha deve ser a pesagem de um animal identificado. Animais precisam estar cadastrados e no lote informado. Registros inválidos não são importados.</span>
          <input type="file" accept=".xlsx,.csv,.txt" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </label></Card>
      )}

      {step === 2 && (
        <Card title={`${fileName} · ${body.length} linha(s)`}>
          <div className="space-y-4 p-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-600" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />A primeira linha é o cabeçalho</label>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(Object.keys(IMPORT_FIELD_LABEL) as ImportField[]).map((fld) => (
                <Field key={fld} label={`${IMPORT_FIELD_LABEL[fld]}${fld === 'tag' || fld === 'kg' ? ' *' : ''}`}>
                  <select className="input" value={map[fld] ?? ''} onChange={(e) => setMap({ ...map, [fld]: e.target.value === '' ? undefined : Number(e.target.value) })}>
                    <option value="">{fld === 'date' ? 'Usar data padrão' : fld === 'lot' ? 'Usar lote padrão' : 'Não mapeado'}</option>
                    {header.map((hd, i) => <option key={i} value={i}>{hd || `Coluna ${i + 1}`}</option>)}
                  </select>
                </Field>
              ))}
              {map.date == null && <Field label="Data padrão"><input type="date" className="input" value={defaults.date} max={today()} onChange={(e) => setDefaults({ ...defaults, date: e.target.value })} /></Field>}
              {map.lot == null && <Field label="Lote padrão"><select className="input" value={defaults.lotId} onChange={(e) => setDefaults({ ...defaults, lotId: e.target.value })}><option value="">Selecione…</option>{lots.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>}
              <Field label="Responsável pela pesagem *"><input className="input" value={defaults.responsible} onChange={(e) => setDefaults({ ...defaults, responsible: e.target.value })} /></Field>
            </div>
            <div className="overflow-x-auto rounded-lg border border-stone-200 dark:border-stone-800"><table className="w-full text-xs">
              <thead className="bg-stone-50 dark:bg-stone-800/60"><tr>{header.map((hd, i) => <th key={i} className="th">{hd}</th>)}</tr></thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">{body.slice(0, 5).map((r, i) => <tr key={i}>{header.map((_, j) => <td key={j} className="td">{String(r[j] instanceof Date ? (r[j] as Date).toISOString().slice(0, 10) : r[j] ?? '')}</td>)}</tr>)}</tbody>
            </table></div>
          </div>
          <div className="flex justify-between border-t border-stone-200 p-3 dark:border-stone-800">
            <Button variant="ghost" onClick={() => setStep(1)}>Voltar</Button>
            <Button disabled={map.tag == null || map.kg == null} onClick={() => setStep(3)}>Validar registros</Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card title={<span>{ok.length} válida(s) · {rows.filter((r) => r.status === 'duplicado').length} duplicada(s) · {rows.filter((r) => r.status === 'erro').length} com erro</span>}>
          <div className="max-h-[50vh] overflow-auto"><table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900"><tr>{['Linha', 'Situação', 'Data', 'Lote', 'Animal', 'Peso', 'Observação'].map((x) => <th key={x} className="th">{x}</th>)}</tr></thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">{rows.map((r) => (
              <tr key={r.line} className={r.status === 'ok' ? '' : 'bg-red-50/40 dark:bg-red-950/20'}>
                <td className="td tabular">{r.line + (hasHeader ? 1 : 0)}</td>
                <td className="td"><Badge tone={r.status === 'ok' ? 'green' : r.status === 'duplicado' ? 'amber' : 'red'}>{r.status === 'ok' ? 'Válida' : r.status === 'duplicado' ? 'Duplicada' : 'Erro'}</Badge></td>
                <td className="td tabular">{r.date ? fmtDate(r.date) : '—'}</td><td className="td">{r.lotId ? lotName(r.lotId) : '—'}</td><td className="td">{r.tag || '—'}</td>
                <td className="td tabular">{r.kg != null ? `${number(r.kg)} kg` : '—'}</td><td className="td text-stone-500">{r.message}</td>
              </tr>))}</tbody>
          </table></div>
          <div className="flex items-center justify-between border-t border-stone-200 p-3 dark:border-stone-800">
            <Button variant="ghost" onClick={() => setStep(2)}>Voltar ao mapeamento</Button>
            <span className="hidden text-xs text-stone-500 sm:block">Somente as linhas válidas serão importadas.</span>
            <Button loading={busy} disabled={!ok.length} onClick={confirm}>Importar {ok.length} pesagem(ns)</Button>
          </div>
        </Card>
      )}
    </>
  )
}
