import { useHerd } from '../../contexts/HerdContext'
import { ARROBA_LABEL, type ArrobaUnit } from '../../lib/herd'
import { Field } from '../ui'

/** Unidade comercial da operação: cada compra/venda grava a sua (nunca convertida automaticamente). */
export function UnitFields({ unit, kgPerUnit, onChange }: { unit: ArrobaUnit; kgPerUnit: string; onChange: (u: ArrobaUnit, kg: string) => void }) {
  const { arroba } = useHerd()
  const def = (u: ArrobaUnit) => String(u === 'vivo' ? arroba.vivo : u === 'carcaca' ? arroba.carcaca : arroba.outra)
  return (
    <>
      <Field label="Unidade de negociação">
        <select className="input" value={unit} onChange={(e) => { const u = e.target.value as ArrobaUnit; onChange(u, def(u)) }}>
          {(Object.keys(ARROBA_LABEL) as ArrobaUnit[]).map((u) => <option key={u} value={u}>{u === 'outra' ? arroba.outraLabel : ARROBA_LABEL[u]}</option>)}
        </select>
      </Field>
      <Field label="Kg por unidade" hint={unit === 'carcaca' ? 'Peso informado deve ser o de carcaça' : 'Fator desta negociação'}>
        <input className="input" inputMode="decimal" value={kgPerUnit} onChange={(e) => onChange(unit, e.target.value)} />
      </Field>
    </>
  )
}
export const unitLabel = (unit: string, outraLabel: string) => (unit === 'outra' ? outraLabel : ARROBA_LABEL[unit as ArrobaUnit] ?? unit)
