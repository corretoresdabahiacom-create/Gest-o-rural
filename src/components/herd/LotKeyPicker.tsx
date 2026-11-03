import { useEffect, useMemo } from 'react'
import { useHerd } from '../../contexts/HerdContext'
import { balanceKey, parseKey, type Sex } from '../../lib/herd'
import { Field, cx } from '../ui'

/** Seleção para saídas/transferências: lote → categoria/sexo com saldo → animais identificados e/ou quantidade. */
export interface ExitSel { lotId: string; key: string; anonQty: string; animalIds: string[] }
export const emptyExit = (): ExitSel => ({ lotId: '', key: '', anonQty: '', animalIds: [] })

export function LotKeyPicker({ value, onChange, label = 'Lote de origem' }: { value: ExitSel; onChange: (v: ExitSel) => void; label?: string }) {
  const { activeLots, keyLabel, identified } = useHerd()
  const lot = activeLots.find((l) => l.id === value.lotId)
  const keys = useMemo(() => Object.entries(lot?.balances ?? {}).filter(([, q]) => q > 0), [lot])
  const idAnimals = value.lotId && value.key ? identified(value.lotId, value.key) : []
  const available = lot?.balances?.[value.key] ?? 0
  const unidentified = Math.max(0, available - idAnimals.length)
  useEffect(() => { if (lot && keys.length === 1 && !value.key) onChange({ ...value, key: keys[0][0] }) }, [lot, keys, value, onChange])

  const toggle = (id: string) => onChange({ ...value, animalIds: value.animalIds.includes(id) ? value.animalIds.filter((x) => x !== id) : [...value.animalIds, id] })
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={label}>
          <select className="input" value={value.lotId} onChange={(e) => onChange({ ...emptyExit(), lotId: e.target.value })}>
            <option value="">Selecione…</option>
            {activeLots.filter((l) => l.count > 0).map((l) => <option key={l.id} value={l.id}>{l.name} ({l.count} cab.)</option>)}
          </select>
        </Field>
        <Field label="Categoria e sexo">
          <select className="input" value={value.key} disabled={!lot} onChange={(e) => onChange({ ...value, key: e.target.value, animalIds: [], anonQty: '' })}>
            <option value="">Selecione…</option>
            {keys.map(([k, q]) => <option key={k} value={k}>{keyLabel(k)} — {q} cab.</option>)}
          </select>
        </Field>
      </div>
      {value.key && (
        <div className="rounded-lg bg-stone-50 p-3 text-sm dark:bg-stone-800/50">
          Saldo disponível: <b>{available}</b> cab.{idAnimals.length > 0 && <> ({idAnimals.length} identificados, {unidentified} sem identificação)</>}
        </div>
      )}
      {idAnimals.length > 0 && (
        <Field label={`Animais identificados (${value.animalIds.length} selecionados)`}>
          <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
            {idAnimals.map((a) => (
              <button type="button" key={a.id} onClick={() => toggle(a.id)}
                className={cx('rounded-full border px-2.5 py-1 text-xs', value.animalIds.includes(a.id) ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-300 dark:border-stone-700')}>
                {a.tag}{a.name ? ` · ${a.name}` : ''}
              </button>
            ))}
          </div>
        </Field>
      )}
      {value.key && (
        <Field label={idAnimals.length ? 'Quantidade adicional sem identificação' : 'Quantidade'} hint={`Máximo ${unidentified}`}>
          <input className="input" inputMode="numeric" value={value.anonQty} onChange={(e) => onChange({ ...value, anonQty: e.target.value.replace(/\D/g, '') })} placeholder="0" />
        </Field>
      )}
    </div>
  )
}

/** Valida a seleção e devolve os dados para a operação. */
export function readExit(v: ExitSel, identifiedInKey: number, available: number) {
  const anon = Number(v.anonQty || 0)
  const qty = anon + v.animalIds.length
  if (!v.lotId || !v.key) return { error: 'Selecione o lote e a categoria.' }
  if (qty < 1) return { error: 'Informe a quantidade ou selecione animais.' }
  if (anon > available - identifiedInKey) return { error: `Quantidade sem identificação acima do disponível (${Math.max(0, available - identifiedInKey)}).` }
  if (qty > available) return { error: `Quantidade (${qty}) maior que o saldo do lote (${available}).` }
  const { categoryId, sex } = parseKey(v.key)
  return { qty, data: { lotId: v.lotId, categoryId, sex: sex as Sex, anonQty: anon, animalIds: v.animalIds } }
}

export function CategorySexFields({ categoryId, sex, onChange, lotSex }: { categoryId: string; sex: Sex | ''; onChange: (c: string, s: Sex | '') => void; lotSex?: 'M' | 'F' | 'X' }) {
  const { categories } = useHerd()
  return (
    <>
      <Field label="Categoria *">
        <select className="input" value={categoryId} onChange={(e) => onChange(e.target.value, sex)}>
          <option value="">Selecione…</option>
          {categories.filter((c) => c.active || c.id === categoryId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Sexo *">
        <select className="input" value={sex} onChange={(e) => onChange(categoryId, e.target.value as Sex)}>
          <option value="">Selecione…</option>
          {(!lotSex || lotSex !== 'F') && <option value="M">Macho</option>}
          {(!lotSex || lotSex !== 'M') && <option value="F">Fêmea</option>}
        </select>
      </Field>
    </>
  )
}
export { balanceKey }
