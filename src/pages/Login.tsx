import { useState, type FormEvent } from 'react'
import { createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db, firebaseConfigured, emulatorMode } from '../lib/firebase'
import { friendlyError } from '../lib/db'
import { Logo } from '../components/Logo'
import { Button, ErrorBox, Field } from '../components/ui'

type Mode = 'login' | 'signup' | 'reset'

export default function Login() {
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setInfo(''); setLoading(true)
    const mail = email.trim().toLowerCase()
    try {
      if (mode === 'login') await signInWithEmailAndPassword(auth, mail, password)
      else if (mode === 'signup') {
        if (name.trim().length < 2) throw new Error('Informe seu nome.')
        const { user } = await createUserWithEmailAndPassword(auth, mail, password)
        await updateProfile(user, { displayName: name.trim() })
        await setDoc(doc(db, 'users', user.uid), { name: name.trim(), email: mail, updatedAt: serverTimestamp() })
        await sendEmailVerification(user).catch(() => {})
      } else {
        await sendPasswordResetEmail(auth, mail)
        setInfo('Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.')
      }
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-brand-50 via-stone-50 to-amber-50/40 p-4 dark:from-brand-950 dark:via-stone-950 dark:to-stone-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="size-16" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Gestão Rural</h1>
          <p className="mt-1 text-sm text-stone-500">Gestão financeira da sua fazenda, sem planilhas.</p>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6 shadow-sm">
          {!firebaseConfigured && !emulatorMode && (
            <ErrorBox>Firebase não configurado. Defina as variáveis VITE_FIREBASE_* (veja o README).</ErrorBox>
          )}
          {mode === 'signup' && (
            <Field label="Seu nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></Field>
          )}
          <Field label="E-mail"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></Field>
          {mode !== 'reset' && (
            <Field label="Senha"><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required /></Field>
          )}
          {error && <ErrorBox>{error}</ErrorBox>}
          {info && <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand-800 dark:bg-brand-900/40 dark:text-brand-200">{info}</p>}
          <Button type="submit" loading={loading} className="w-full">
            {mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link'}
          </Button>
          <div className="flex justify-between text-sm">
            {mode === 'login' ? (
              <>
                <button type="button" className="text-brand-700 hover:underline dark:text-brand-300" onClick={() => setMode('signup')}>Criar conta</button>
                <button type="button" className="text-stone-500 hover:underline" onClick={() => setMode('reset')}>Esqueci a senha</button>
              </>
            ) : (
              <button type="button" className="text-brand-700 hover:underline dark:text-brand-300" onClick={() => setMode('login')}>Voltar ao login</button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
