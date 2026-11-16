import { NavLink } from 'react-router-dom'
import { cx } from '../ui'
import { STOCK_CATEGORIES } from '../../lib/stock'

export const STOCK_TABS = [
  { to: '/estoque', label: 'Controle', end: true },
  ...STOCK_CATEGORIES.map((c) => ({ to: `/estoque/c/${c.id}`, label: c.plural, end: false })),
  { to: '/estoque/movimentacoes', label: 'Entradas e saídas', end: false },
  { to: '/estoque/relatorios', label: 'Relatórios', end: false },
]

export function StockNav() {
  return (
    <nav className="no-print -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-stone-200 px-4 sm:mx-0 sm:px-0 dark:border-stone-800" aria-label="Estoque">
      {STOCK_TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end}
          className={({ isActive }) => cx('shrink-0 border-b-2 px-3 py-2 text-sm font-medium',
            isActive ? 'border-brand-600 text-brand-700 dark:text-brand-300' : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200')}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}
