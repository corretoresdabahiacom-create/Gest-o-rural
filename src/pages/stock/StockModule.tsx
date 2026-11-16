import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { StockProvider } from '../../contexts/StockContext'
import { StockNav } from '../../components/stock/StockNav'
import { Spinner } from '../../components/ui'

const StockDashboard = lazy(() => import('./StockDashboard'))
const StockItems = lazy(() => import('./StockItems'))
const StockItemDetail = lazy(() => import('./StockItemDetail'))
const StockMovements = lazy(() => import('./StockMovements'))
const StockReports = lazy(() => import('./StockReports'))

export default function StockModule() {
  return (
    <StockProvider>
      <StockNav />
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route index element={<StockDashboard />} />
          <Route path="c/:cat" element={<StockItems />} />
          <Route path="item/:id" element={<StockItemDetail />} />
          <Route path="movimentacoes" element={<StockMovements />} />
          <Route path="relatorios" element={<StockReports />} />
          <Route path="*" element={<Navigate to="/estoque" replace />} />
        </Routes>
      </Suspense>
    </StockProvider>
  )
}
