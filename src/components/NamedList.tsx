import { useState, type ReactNode } from 'react'
import { serverTimestamp, writeBatch } from 'firebase/firestore'
import { Check, Pencil, Plus, X } from 'lucide-react'
import { db } from '../lib/firebase'
import { addLog, farmDoc, friendlyError, newId } from '../lib/db'
import type { Named } from '../lib/types'
import { useApp } from '../contexts/AppContext'
import { Badge, Button, Empty, useToast } from './ui'

/** Cadastro simples de nomes (tipos de mão de obra, categorias): criar, renomear, inativar/reativar. */
export function NamedList({ collection, items, noun, extra }: { collection: 'laborTypes' | 'expenseCategories'; items: Named[]; noun: string; extra?: (n: Named) => ReactNode }) {
  const { farm, canEdit } = useApp()
  const toast = useToast()
  const [name, setName] = useState('')
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const exists = (n: string, except?: string) => items.some((i) => i.id !== except && i.name.trim().toLowerCase() === n.trim().toLowerCase())

  async function write(id: string, data: Record<string, unknown>, action: string, detail: string) {
    setBusy(true)
    try {
      const b = writeBatch(db)
      b.set(farmDoc(farm!.id, collection, id), data, { merge: true })
      addLog(b, farm!.id, action, detail)
      await b.commit()
      return true
    } catch (e) { toast('error', friendlyError(e)); return false } finally { setBusy(false) }
  }

  async function add() {
    const n = name.trim()
    if (!n) return
    if (exists(n)) return toast('error', `Já existe ${noun} com esse nome.`)
    if (await write(newId(farm!.id, collection), { name: n, active: true, createdAt: serverTimestamp() }, `${collection}_criado`, n)) { setName(''); toast('success', 'Adicionado.') }
  }
  async function rename() {
    if (!edit) return
    const n = edit.name.trim()
    const cur = items.find((i) => i.id === edit.id)!
    if (!n || exists(n, edit.id)) return toast('error', 'Nome vazio ou duplicado.')
    if (await write(edit.id, { name: n, active: cur.active }, `${collection}_renomeado`, `${cur.name} → ${n}`)) setEdit(null)
  }

  return (
    <div>
      {canEdit && (
        <form className="flex gap-2 border-b border-stone-200 p-3 dark:border-stone-800" onSubmit={(e) => { e.preventDefault(); add() }}>
          <input className="input" placeholder={`Nov${noun.endsWith('a') ? 'a' : 'o'} ${noun}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <Button type="submit" loading={busy} disabled={!name.trim()}><Plus className="size-4" />Adicionar</Button>
        </form>
      )}
      {items.length === 0 ? <Empty title={`Nenhum(a) ${noun}`} /> : (
        <ul className="divide-y divide-stone-100 dark:divide-stone-800">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-2 px-4 py-2.5">
              {edit?.id === i.id ? (
                <form className="flex flex-1 gap-1" onSubmit={(e) => { e.preventDefault(); rename() }}>
                  <input className="input py-1" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus maxLength={60} />
                  <Button size="sm" type="submit" aria-label="Salvar"><Check className="size-4" /></Button>
                  <Button size="sm" variant="ghost" type="button" onClick={() => setEdit(null)} aria-label="Cancelar"><X className="size-4" /></Button>
                </form>
              ) : (
                <>
                  <span className={i.active ? 'flex-1 text-sm' : 'flex-1 text-sm text-stone-400 line-through'}>{i.name}</span>
                  {!i.active && <Badge>Inativo</Badge>}
                  {extra?.(i)}
                  {canEdit && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setEdit({ id: i.id, name: i.name })} aria-label="Renomear"><Pencil className="size-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => write(i.id, { name: i.name, active: !i.active }, `${collection}_${i.active ? 'inativado' : 'reativado'}`, i.name)}>
                        {i.active ? 'Inativar' : 'Reativar'}
                      </Button>
                    </>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
