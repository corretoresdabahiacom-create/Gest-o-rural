import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useApp } from './contexts/AppContext'
import { Layout } from './components/Layout'
import { Spinner } from './components/ui'
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

function Splash() {
  return <div className="flex min-h-dvh flex-col items-center justify-center gap-4"><Logo className="size-16" /><Spinner className="py-0" /></div>
}

export default function App() {
  const { user, authReady, farmsReady, farms, farm } = useApp()
  if (!authReady) return <Splash />
  if (!user) return <Login />
  if (!farmsReady) return <Splash />
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}
