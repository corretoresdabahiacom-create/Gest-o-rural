import { lazy, Suspense } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { cx, ErrorBox, Spinner } from '../../components/ui'
import { WeighProvider, useWeigh } from './WeighContext'

const WeighDashboard = lazy(() => import('./WeighDashboard'))
const NewWeighing = lazy(() => import('./NewWeighing'))
const WeighHistory = lazy(() => import('./WeighHistory'))
const AnimalEvolution = lazy(() => import('./AnimalEvolution'))
const LotEvolution = lazy(() => import('./LotEvolution'))
const WeighReports = lazy(() => import('./WeighReports'))
const WeighImport = lazy(() => import('./WeighImport'))

const TABS = [
  { to: '/rebanho/pesagem', label: 'Painel', end: true }, { to: '/rebanho/pesagem/nova', label: 'Nova pesagem' },
  { to: '/rebanho/pesagem/historico', label: 'Histórico' }, { to: '/rebanho/pesagem/animal', label: 'Evolução individual' },
  { to: '/rebanho/pesagem/lotes', label: 'Evolução por lote' }, { to: '/rebanho/pesagem/relatorios', label: 'Relatórios' },
  { to: '/rebanho/pesagem/importar', label: 'Importar planilha' },
]

function Inner() {
  const { ready, error } = useWeigh()
  if (!ready) return <Spinner />
  return (
    <>
      {error && <div className="mb-4"><ErrorBox>{error}</ErrorBox></div>}
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route index element={<WeighDashboard />} />
          <Route path="nova" element={<NewWeighing />} />
          <Route path="historico" element={<WeighHistory />} />
          <Route path="animal" element={<AnimalEvolution />} />
          <Route path="animal/:id" element={<AnimalEvolution />} />
          <Route path="lotes" element={<LotEvolution />} />
          <Route path="relatorios" element={<WeighReports />} />
          <Route path="importar" element={<WeighImport />} />
          <Route path="*" element={<Navigate to="/rebanho/pesagem" replace />} />
        </Routes>
      </Suspense>
    </>
  )
}

export default function WeighingModule() {
  return (
    <WeighProvider>
      <nav className="no-print mb-5 flex gap-1 overflow-x-auto" aria-label="Pesagem">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cx('shrink-0 rounded-full border px-3 py-1 text-sm',
            isActive ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200' : 'border-stone-300 text-stone-600 dark:border-stone-700 dark:text-stone-300')}>{t.label}</NavLink>
        ))}
      </nav>
      <Inner />
    </WeighProvider>
  )
}
