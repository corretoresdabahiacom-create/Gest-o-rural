import { NavLink } from 'react-router-dom'
import { cx } from '../ui'

export const HERD_TABS = [
  { to: '/rebanho', label: 'Painel', end: true },
  { to: '/rebanho/lotes', label: 'Animais e lotes' },
  { to: '/rebanho/entrada', label: 'Entrada' },
  { to: '/rebanho/saida', label: 'Saída (venda)' },
  { to: '/rebanho/mortes', label: 'Mortes' },
  { to: '/rebanho/transferencias', label: 'Transferências' },
  { to: '/rebanho/vacinacao', label: 'Vacinação' },
  { to: '/rebanho/pesagem', label: 'Pesagem' },
  { to: '/rebanho/inventario', label: 'Inventário' },
  { to: '/rebanho/relatorios', label: 'Relatórios' },
]

export function HerdNav() {
  return (
    <nav className="no-print -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-stone-200 px-4 sm:mx-0 sm:px-0 dark:border-stone-800" aria-label="Rebanho">
      {HERD_TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end}
          className={({ isActive }) => cx('shrink-0 border-b-2 px-3 py-2 text-sm font-medium',
            isActive ? 'border-brand-600 text-brand-700 dark:text-brand-300' : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200')}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}
