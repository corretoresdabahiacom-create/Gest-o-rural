import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useApp } from './contexts/AppContext'
import { Layout } from './components/Layout'
import { Button, Spinner } from './components/ui'
import { signOut } from 'firebase/auth'
import { auth } from './lib/firebase'
import { Logo } from './components/Logo'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'

const Collaborators = lazy(() => import('./pages/Collaborators'))
const CollaboratorDetail = lazy(() => import('./pages/CollaboratorDetail'))
const Expenses = lazy(() => import('./pages/Expenses'))
const ExpenseSheet = lazy(() => import('./pages/ExpenseSheet'))
const Categories = lazy(() => import('./pages/Categories'))
const Obligations = lazy(() => import('./pages/Obligations'))
const Reports = lazy(() => import('./pages/Reports'))
const Settings = lazy(() => import('./pages/Settings'))
const HerdModule = lazy(() => import('./pages/herd/HerdModule'))
const Revenues = lazy(() => import('./pages/Revenues'))
const Worksheet = lazy(() => import('./pages/weighing/Worksheet'))

function Splash() {
  return <div className="flex min-h-dvh flex-col items-center justify-center gap-4"><Logo className="size-16" /><Spinner className="py-0" /></div>
}

export default function App() {
  const { user, authReady, farmsReady, farmsError, farms, farm, refreshFarms } = useApp()
  if (!authReady) return <Splash />
  if (!user) return <Login />
  if (!farmsReady) return <Splash />
  if (farmsError && farms.length === 0) return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <Logo className="size-14" />
      <p className="max-w-sm text-sm">Não foi possível carregar suas fazendas agora. Verifique a conexão e as regras do Firestore publicadas e tente novamente.</p>
      <div className="flex gap-2"><Button onClick={refreshFarms}>Tentar novamente</Button><Button variant="ghost" onClick={() => signOut(auth)}>Sair</Button></div>
    </div>
  )
  if (farms.length === 0) return <Onboarding />
  if (!farm) return <Splash />
  return (
    <Layout>
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/colaboradores" element={<Collaborators />} />
          <Route path="/colaboradores/:id" element={<CollaboratorDetail />} />
          <Route path="/despesas" element={<Expenses />} />
          <Route path="/despesas/novo" element={<ExpenseSheet />} />
          <Route path="/categorias" element={<Categories />} />
          <Route path="/obrigacoes" element={<Obligations />} />
          <Route path="/relatorios" element={<Reports />} />
          <Route path="/configuracoes" element={<Settings />} />
          <Route path="/rebanho/*" element={<HerdModule />} />
          <Route path="/receitas" element={<Revenues />} />
          <Route path="/planilha-pesagem" element={<Worksheet />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}
