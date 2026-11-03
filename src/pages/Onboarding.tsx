import { useState, type FormEvent } from 'react'
import { signOut, sendEmailVerification } from 'firebase/auth'
import { Mail, Tractor } from 'lucide-react'
import { auth } from '../lib/firebase'
import { friendlyError } from '../lib/db'
import { useApp } from '../contexts/AppContext'
import { ROLE_LABEL } from '../lib/types'
import { Logo } from '../components/Logo'
import { Button, ErrorBox, Field, useToast } from '../components/ui'

export default function Onboarding() {
  const { user, createFarm, invites, acceptInvite } = useApp()
  const toast = useToast()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true); setError('')
    try { await createFarm(name); toast('success', 'Fazenda criada!') } catch (err) { setError(friendlyError(err)) } finally { setLoading(false) }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex flex-col items-center text-center">
          <Logo className="size-14" />
          <h1 className="mt-4 text-xl font-semibold">Bem-vindo{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}!</h1>
          <p className="mt-1 text-sm text-stone-500">Cadastre sua fazenda para começar.</p>
        </div>

        {invites.length > 0 && (
          <div className="card divide-y divide-stone-200 dark:divide-stone-800">
            {invites.map((i) => (
              <div key={i.farmId} className="flex items-center gap-3 p-4">
                <Mail className="size-5 text-brand-600" />
                <div className="flex-1 text-sm"><b>{i.farmName}</b><div className="text-stone-500">Convite como {ROLE_LABEL[i.role]}</div></div>
                <Button size="sm" onClick={() => acceptInvite(i).catch((e) => toast('error', friendlyError(e)))}>Aceitar</Button>
              </div>
            ))}
          </div>
        )}

        {user && !user.emailVerified && (
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
            Foi convidado para uma fazenda? Confirme seu e-mail pelo link enviado e recarregue a página para ver o convite.{' '}
            <button className="underline" onClick={() => user && sendEmailVerification(user).then(() => toast('info', 'E-mail reenviado.')).catch((e) => toast('error', friendlyError(e)))}>Reenviar</button>
          </p>
        )}

        <form onSubmit={submit} className="card space-y-4 p-6">
          <div className="flex items-center gap-2 font-medium"><Tractor className="size-5 text-brand-600" />Nova fazenda</div>
          <Field label="Nome da fazenda"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Fazenda Boa Esperança" maxLength={100} required autoFocus /></Field>
          <p className="text-xs text-stone-500">Criaremos os tipos de mão de obra e as categorias de despesa iniciais. Você pode alterá-los depois.</p>
          {error && <ErrorBox>{error}</ErrorBox>}
          <Button type="submit" loading={loading} className="w-full">Criar fazenda</Button>
        </form>
        <button onClick={() => signOut(auth)} className="w-full text-center text-sm text-stone-500 hover:underline">Sair</button>
      </div>
    </div>
  )
}
