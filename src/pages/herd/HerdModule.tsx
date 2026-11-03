import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { HerdProvider } from '../../contexts/HerdContext'
import { HerdNav } from '../../components/herd/HerdNav'
import { Spinner } from '../../components/ui'

const HerdDashboard = lazy(() => import('./HerdDashboard'))
const LotsAnimals = lazy(() => import('./LotsAnimals'))
const LotDetail = lazy(() => import('./LotDetail'))
const AnimalDetail = lazy(() => import('./AnimalDetail'))
const Entry = lazy(() => import('./Entry'))
const Exit = lazy(() => import('./Exit'))
const Deaths = lazy(() => import('./Deaths'))
const Transfers = lazy(() => import('./Transfers'))
const Vaccination = lazy(() => import('./Vaccination'))
const Inventory = lazy(() => import('./Inventory'))
const HerdReports = lazy(() => import('./HerdReports'))
const WeighingModule = lazy(() => import('../weighing/WeighingModule'))

export default function HerdModule() {
  return (
    <HerdProvider>
      <HerdNav />
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route index element={<HerdDashboard />} />
          <Route path="lotes" element={<LotsAnimals />} />
          <Route path="lotes/:id" element={<LotDetail />} />
          <Route path="animais/:id" element={<AnimalDetail />} />
          <Route path="entrada" element={<Entry />} />
          <Route path="saida" element={<Exit />} />
          <Route path="mortes" element={<Deaths />} />
          <Route path="transferencias" element={<Transfers />} />
          <Route path="vacinacao" element={<Vaccination />} />
          <Route path="pesagem/*" element={<WeighingModule />} />
          <Route path="inventario" element={<Inventory />} />
          <Route path="relatorios" element={<HerdReports />} />
          <Route path="*" element={<Navigate to="/rebanho" replace />} />
        </Routes>
      </Suspense>
    </HerdProvider>
  )
}
