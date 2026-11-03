import { useEffect, useState } from 'react'
import { deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, writeBatch, type Timestamp } from 'firebase/firestore'
import { ImagePlus, Mail, Moon, Sun, Trash2, UserPlus } from 'lucide-react'
import { auth, db } from '../lib/firebase'
import { addLog, farmCol, farmDoc, friendlyError } from '../lib/db'
import { ROLE_LABEL, type Member, type Role } from '../lib/types'
import { useApp } from '../contexts/AppContext'
import { useTheme } from '../components/Layout'
import { Badge, Button, Card, ErrorBox, Field, PageHeader, Spinner, useToast } from '../components/ui'
import { NamedList } from '../components/NamedList'

/** Logotipo reduzido a 256px e guardado no próprio documento da fazenda (dispensa Firebase Storage). */
async function resizeImage(file: File): Promise<string> {
  const img = await createImageBitmap(file)
  const s = Math.min(1, 256 / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/webp', 0.85)
}

function FarmData() {
  const { farm, canEdit } = useApp()
  const toast = useToast()
  const [f, setF] = useState({ name: '', ownerName: '', ownerPhone: '', ownerDocument: '', logoUrl: '' as string | null })
  const [saving, setSaving] = useState(false)
  useEffect(() => { setF({ name: farm!.name, ownerName: farm!.ownerName ?? '', ownerPhone: farm!.ownerPhone ?? '', ownerDocument: farm!.ownerDocument ?? '', logoUrl: farm!.logoUrl ?? null }) }, [farm])
  async function save() {
    if (!f.name.trim()) return toast('error', 'Informe o nome da fazenda.')
    setSaving(true)
    try {
      const b = writeBatch(db)
      b.update(doc(db, 'farms', farm!.id), { name: f.name.trim(), ownerName: f.ownerName.trim(), ownerPhone: f.ownerPhone.trim(), ownerDocument: f.ownerDocument.trim(), logoUrl: f.logoUrl, updatedAt: serverTimestamp() })
      addLog(b, farm!.id, 'fazenda_atualizada', f.name.trim())
      await b.commit()
      toast('success', 'Dados da fazenda salvos.')
    } catch (e) { toast('error', friendlyError(e))
    } finally { setSaving(false) }
  }
  return (
    <Card title="Fazenda" action={canEdit && <Button size="sm" loading={saving} onClick={save}>Salvar</Button>}>
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <div className="flex items-center gap-4 sm:col-span-2">
          <div className="flex size-16 items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800">
            {f.logoUrl ? <img src={f.logoUrl} alt="Logotipo" className="size-full object-contain" /> : <ImagePlus className="size-6 text-stone-400" />}
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <label className="cursor-pointer rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800">
                Enviar logotipo
                <input type="file" accept="image/*" hidden onChange={async (e) => { const file = e.target.files?.[0]; if (file) setF({ ...f, logoUrl: await resizeImage(file).catch(() => f.logoUrl) }) }} />
              </label>
              {f.logoUrl && <Button size="sm" variant="ghost" onClick={() => setF({ ...f, logoUrl: null })}>Remover</Button>}
            </div>
          )}
        </div>
        <Field label="Nome da fazenda"><input className="input" disabled={!canEdit} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} /></Field>
        <Field label="Proprietário"><input className="input" disabled={!canEdit} value={f.ownerName} onChange={(e) => setF({ ...f, ownerName: e.target.value })} maxLength={120} /></Field>
        <Field label="Telefone"><input className="input" disabled={!canEdit} value={f.ownerPhone} onChange={(e) => setF({ ...f, ownerPhone: e.target.value })} maxLength={30} /></Field>
        <Field label="CPF/CNPJ"><input className="input" disabled={!canEdit} value={f.ownerDocument} onChange={(e) => setF({ ...f, ownerDocument: e.target.value })} maxLength={30} /></Field>
      </div>
    </Card>
  )
}

function AlertSettings() {
  const { farm, canEdit } = useApp()
  const toast = useToast()
  const [text, setText] = useState('')
  useEffect(() => setText((farm!.alertDays ?? [30, 15, 7, 0]).join(', ')), [farm])
  async function save() {
    const days = [...new Set(text.split(/[,;\s]+/).filter(Boolean).map(Number))]
    if (!days.length || days.some((d) => !Number.isInteger(d) || d < 0 || d > 365) || days.length > 8) return toast('error', 'Use até 8 números inteiros entre 0 e 365, separados por vírgula.')
    try {
      const b = writeBatch(db)
      b.update(doc(db, 'farms', farm!.id), { alertDays: days.sort((a, b) => b - a), updatedAt: serverTimestamp() })
      addLog(b, farm!.id, 'avisos_atualizados', days.join(','))
      await b.commit()
      toast('success', 'Prazos de aviso salvos.')
    } catch (e) { toast('error', friendlyError(e)) }
  }
  return (
    <Card title="Notificações e lembretes">
      <div className="space-y-3 p-4">
        <Field label="Avisar com quantos dias de antecedência" hint="Padrão: 30, 15, 7, 0 (0 = no dia). Vencidas pendentes aparecem sempre no Dashboard.">
          <div className="flex gap-2"><input className="input" disabled={!canEdit} value={text} onChange={(e) => setText(e.target.value)} />{canEdit && <Button onClick={save}>Salvar</Button>}</div>
        </Field>
      </div>
    </Card>
  )
}

function ArrobaSettings() {
  const { farm, canEdit } = useApp()
  const toast = useToast()
  const cur = farm!.arroba ?? { vivo: 30, carcaca: 15, outra: 30, outraLabel: 'Outra unidade' }
  const [f, setF] = useState({ vivo: String(cur.vivo), carcaca: String(cur.carcaca), outra: String(cur.outra), outraLabel: cur.outraLabel })
  useEffect(() => { const c = farm!.arroba; if (c) setF({ vivo: String(c.vivo), carcaca: String(c.carcaca), outra: String(c.outra), outraLabel: c.outraLabel }) }, [farm])
  async function save() {
    const n = (s: string) => Number(s.replace(',', '.'))
    const v = { vivo: n(f.vivo), carcaca: n(f.carcaca), outra: n(f.outra), outraLabel: f.outraLabel.trim() || 'Outra unidade' }
    if (![v.vivo, v.carcaca, v.outra].every((x) => x > 0 && x < 1000)) return toast('error', 'Informe fatores em kg maiores que zero.')
    try {
      const b = writeBatch(db)
      b.update(doc(db, 'farms', farm!.id), { arroba: v, updatedAt: serverTimestamp() })
      addLog(b, farm!.id, 'arroba_atualizada', JSON.stringify(v))
      await b.commit()
      toast('success', 'Unidades salvas. Operações já registradas mantêm o fator usado na época.')
    } catch (e) { toast('error', friendlyError(e)) }
  }
  return (
    <Card title="Unidades de pesagem e negociação" action={canEdit && <Button size="sm" onClick={save}>Salvar</Button>}>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <Field label="Arroba de peso vivo (kg)"><input className="input" inputMode="decimal" disabled={!canEdit} value={f.vivo} onChange={(e) => setF({ ...f, vivo: e.target.value })} /></Field>
        <Field label="Arroba de carcaça (kg)"><input className="input" inputMode="decimal" disabled={!canEdit} value={f.carcaca} onChange={(e) => setF({ ...f, carcaca: e.target.value })} /></Field>
        <Field label="Outra unidade — nome"><input className="input" disabled={!canEdit} value={f.outraLabel} maxLength={30} onChange={(e) => setF({ ...f, outraLabel: e.target.value })} /></Field>
        <Field label="Outra unidade (kg)"><input className="input" inputMode="decimal" disabled={!canEdit} value={f.outra} onChange={(e) => setF({ ...f, outra: e.target.value })} /></Field>
        <p className="text-xs text-stone-500 sm:col-span-2">Valores padrão sugeridos em cada compra, venda e pesagem. Cada operação grava a unidade e o fator usados; peso vivo e carcaça nunca são convertidos entre si automaticamente.</p>
      </div>
    </Card>
  )
}

function Members() {
  const { farm, role, canEdit, user } = useApp()
  const toast = useToast()
  const [members, setMembers] = useState<Member[] | null>(null)
  const [invites, setInvites] = useState<{ email: string; role: Role }[]>([])
  const [email, setEmail] = useState('')
  const [newRole, setNewRole] = useState<Role>('viewer')
  useEffect(() => onSnapshot(farmCol(farm!.id, 'members'), (s) => setMembers(s.docs.map((d) => d.data() as Member)), () => setMembers([])), [farm])
  useEffect(() => { if (canEdit) return onSnapshot(farmCol(farm!.id, 'invites'), (s) => setInvites(s.docs.map((d) => d.data() as { email: string; role: Role })), () => {}) }, [farm, canEdit])

  async function invite() {
    const mail = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(mail)) return toast('error', 'E-mail inválido.')
    if (members?.some((m) => m.email === mail)) return toast('error', 'Este usuário já tem acesso.')
    try {
      const b = writeBatch(db)
      b.set(farmDoc(farm!.id, 'invites', mail), { email: mail, role: newRole, farmName: farm!.name, invitedBy: auth.currentUser!.uid, createdAt: serverTimestamp() })
      addLog(b, farm!.id, 'convite_criado', `${mail} como ${newRole}`)
      await b.commit()
      setEmail('')
      toast('success', 'Convite criado. A pessoa deve criar conta com este e-mail, confirmá-lo e aceitar o convite.')
    } catch (e) { toast('error', friendlyError(e)) }
  }
  async function changeRole(m: Member, r: Role) {
    try { const b = writeBatch(db); b.update(farmDoc(farm!.id, 'members', m.uid), { role: r }); addLog(b, farm!.id, 'papel_alterado', `${m.email}: ${r}`); await b.commit() }
    catch (e) { toast('error', friendlyError(e)) }
  }
  async function removeMember(m: Member) {
    if (!confirm(`Remover o acesso de ${m.email}?`)) return
    try { const b = writeBatch(db); b.delete(farmDoc(farm!.id, 'members', m.uid)); addLog(b, farm!.id, 'membro_removido', m.email); await b.commit() }
    catch (e) { toast('error', friendlyError(e)) }
  }

  return (
    <Card title="Usuários autorizados">
      {!members ? <Spinner /> : (
        <ul className="divide-y divide-stone-100 dark:divide-stone-800">
          {members.map((m) => (
            <li key={m.uid} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
              <div className="min-w-0 flex-1"><div className="truncate font-medium">{m.name || m.email}{m.uid === user?.uid && ' (você)'}</div><div className="truncate text-xs text-stone-500">{m.email}</div></div>
              {role === 'owner' && m.role !== 'owner' ? (
                <>
                  <select className="input w-auto py-1" value={m.role} onChange={(e) => changeRole(m, e.target.value as Role)}>
                    <option value="admin">{ROLE_LABEL.admin}</option><option value="viewer">{ROLE_LABEL.viewer}</option>
                  </select>
                  <Button size="sm" variant="ghost" onClick={() => removeMember(m)} aria-label="Remover"><Trash2 className="size-4" /></Button>
                </>
              ) : <Badge tone={m.role === 'owner' ? 'green' : 'stone'}>{ROLE_LABEL[m.role]}</Badge>}
            </li>
          ))}
          {invites.map((i) => (
            <li key={i.email} className="flex items-center gap-2 px-4 py-2.5 text-sm">
              <Mail className="size-4 text-stone-400" />
              <span className="flex-1 truncate text-stone-500">{i.email}</span>
              <Badge tone="amber">Convite · {ROLE_LABEL[i.role]}</Badge>
              <Button size="sm" variant="ghost" onClick={() => deleteDoc(farmDoc(farm!.id, 'invites', i.email)).catch((e) => toast('error', friendlyError(e)))} aria-label="Cancelar convite"><Trash2 className="size-4" /></Button>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form className="flex flex-wrap gap-2 border-t border-stone-200 p-3 dark:border-stone-800" onSubmit={(e) => { e.preventDefault(); invite() }}>
          <input className="input min-w-48 flex-1" type="email" placeholder="email@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select className="input w-auto" value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
            <option value="viewer">{ROLE_LABEL.viewer}</option><option value="admin">{ROLE_LABEL.admin}</option>
          </select>
          <Button type="submit"><UserPlus className="size-4" />Convidar</Button>
        </form>
      )}
    </Card>
  )
}

function Logs() {
  const { farm } = useApp()
  const [logs, setLogs] = useState<{ id: string; action: string; detail: string; at?: Timestamp }[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    getDocs(query(farmCol(farm!.id, 'logs'), orderBy('at', 'desc'), limit(50)))
      .then((s) => setLogs(s.docs.map((d) => ({ id: d.id, ...(d.data() as { action: string; detail: string; at?: Timestamp }) }))))
      .catch((e) => setErr(friendlyError(e)))
  }, [farm])
  return (
    <Card title="Registro de operações (últimas 50)">
      {err ? <div className="p-4"><ErrorBox>{err}</ErrorBox></div> : !logs ? <Spinner /> : (
        <ul className="max-h-80 divide-y divide-stone-100 overflow-y-auto text-xs dark:divide-stone-800">
          {logs.map((l) => (
            <li key={l.id} className="flex gap-3 px-4 py-2">
              <span className="tabular shrink-0 text-stone-500">{l.at?.toDate().toLocaleString('pt-BR', { timeZone: 'America/Bahia', dateStyle: 'short', timeStyle: 'short' })}</span>
              <span className="font-medium">{l.action.replace(/_/g, ' ')}</span>
              <span className="truncate text-stone-500">{l.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export default function Settings() {
  const { laborTypes, canEdit, dataReady } = useApp()
  const { dark, toggle } = useTheme()
  return (
    <>
      <PageHeader title="Configurações" />
      <div className="grid gap-5 lg:grid-cols-2">
        <FarmData />
        <div className="space-y-5">
          <AlertSettings />
          <ArrobaSettings />
          <Card title="Preferências de exibição">
            <div className="flex items-center justify-between p-4 text-sm">
              <span>Tema {dark ? 'escuro' : 'claro'} <span className="block text-xs text-stone-500">Salvo neste dispositivo</span></span>
              <Button variant="secondary" onClick={toggle}>{dark ? <Sun className="size-4" /> : <Moon className="size-4" />}Usar tema {dark ? 'claro' : 'escuro'}</Button>
            </div>
          </Card>
        </div>
        <Members />
        <Card title="Tipos de mão de obra">{dataReady ? <NamedList collection="laborTypes" items={laborTypes} noun="tipo" /> : <Spinner />}</Card>
        {canEdit && <div className="lg:col-span-2"><Logs /></div>}
      </div>
    </>
  )
}
