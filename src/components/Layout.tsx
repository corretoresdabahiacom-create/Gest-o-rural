import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { useRegisterSW } from 'virtual:pwa-register/react'
import {
  LayoutDashboard, Users, Receipt, Beef, Wallet, Tags, BellRing, BarChart3, Settings, LogOut, Moon, Sun, MoreHorizontal, RefreshCw, ChevronDown, WifiOff,
} from 'lucide-react'
import { auth } from '../lib/firebase'
import { useApp } from '../contexts/AppContext'
import { Logo } from './Logo'
import { Button, cx } from './ui'
import { useOnline } from '../lib/hooks'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/despesas', label: 'Despesas', icon: Receipt },
  { to: '/colaboradores', label: 'Colaboradores', icon: Users },
  { to: '/rebanho', label: 'Rebanho', icon: Beef },
  { to: '/receitas', label: 'Receitas', icon: Wallet },
  { to: '/obrigacoes', label: 'Obrigações', icon: BellRing },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { to: '/categorias', label: 'Tipos de despesa', icon: Tags },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
]
const MOBILE = NAV.slice(0, 4)

export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const toggle = () => {
    const next = !dark
    document.documentElement.classList.toggle('dark', next)
    try { localStorage.setItem('ag-theme', next ? 'dark' : 'light') } catch { /* sem storage */ }
    setDark(next)
  }
  return { dark, toggle }
}

function FarmSwitcher() {
  const { farms, farm, selectFarm } = useApp()
  if (farms.length <= 1) return <div className="truncate text-xs text-stone-500 dark:text-stone-400">{farm?.name}</div>
  return (
    <div className="relative">
      <select value={farm?.id ?? ''} onChange={(e) => selectFarm(e.target.value)} aria-label="Fazenda"
        className="w-full appearance-none truncate bg-transparent pr-5 text-xs text-stone-500 outline-none dark:text-stone-400">
        {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute top-0.5 right-0 size-3.5 text-stone-400" />
    </div>
  )
}

function UpdatePrompt() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) { if (reg) setInterval(() => reg.update(), 60 * 60 * 1000) },
  })
  if (!needRefresh) return null
  return (
    <div className="no-print fixed inset-x-3 top-3 z-[70] mx-auto flex max-w-md items-center gap-3 rounded-xl border border-brand-200 bg-white p-3 text-sm shadow-lg dark:border-brand-800 dark:bg-stone-900">
      <RefreshCw className="size-5 text-brand-600" />
      <span className="flex-1">Nova versão do AgroGestão disponível.</span>
      <Button size="sm" onClick={() => updateServiceWorker(true)}>Atualizar</Button>
    </div>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const { dark, toggle } = useTheme()
  const { user } = useApp()
  const [more, setMore] = useState(false)
  const online = useOnline()
  const loc = useLocation()
  const link = ({ isActive }: { isActive: boolean }) =>
    cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
      isActive ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200' : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800')

  return (
    <div className="min-h-dvh lg:pl-64">
      <UpdatePrompt />
      {/* Desktop */}
      <aside className="no-print fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-stone-200 bg-white px-3 py-4 dark:border-stone-800 dark:bg-stone-900 lg:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <Logo className="size-9" />
          <div className="min-w-0 flex-1"><div className="font-semibold leading-tight">AgroGestão</div><FarmSwitcher /></div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV.map(({ to, label, icon: I, end }) => <NavLink key={to} to={to} end={end} className={link}><I className="size-4.5" />{label}</NavLink>)}
        </nav>
        <div className="border-t border-stone-200 pt-3 dark:border-stone-800">
          <div className="truncate px-3 pb-2 text-xs text-stone-500">{user?.email}</div>
          <div className="flex gap-1">
            <button onClick={toggle} className="flex-1 rounded-lg p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800" aria-label="Alternar tema">{dark ? <Sun className="mx-auto size-4" /> : <Moon className="mx-auto size-4" />}</button>
            <button onClick={() => signOut(auth)} className="flex flex-[3] items-center justify-center gap-2 rounded-lg p-2 text-sm text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"><LogOut className="size-4" />Sair</button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="no-print sticky top-0 z-30 flex items-center gap-2.5 border-b border-stone-200 bg-white/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-stone-800 dark:bg-stone-900/90 lg:hidden">
        <div className="flex h-14 flex-1 items-center gap-2.5 min-w-0">
          <Logo className="size-8" />
          <div className="min-w-0 flex-1"><div className="text-sm font-semibold leading-tight">AgroGestão</div><FarmSwitcher /></div>
          <button onClick={toggle} className="rounded-lg p-2 text-stone-500" aria-label="Alternar tema">{dark ? <Sun className="size-5" /> : <Moon className="size-5" />}</button>
        </div>
      </header>

      {!online && (
        <div className="no-print flex items-center justify-center gap-2 bg-amber-100 px-4 py-1.5 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
          <WifiOff className="size-3.5" /> Sem conexão — dados exibidos podem estar desatualizados e nada será salvo até reconectar.
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-5 pb-28 sm:px-6 lg:px-8 lg:py-8 lg:pb-8">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-stone-800 dark:bg-stone-900 lg:hidden">
        {MOBILE.map(({ to, label, icon: I, end }) => (
          <NavLink key={to} to={to} end={end} onClick={() => setMore(false)}
            className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-brand-700 dark:text-brand-300' : 'text-stone-500')}>
            <I className="size-5" />{label}
          </NavLink>
        ))}
        <button onClick={() => setMore((m) => !m)}
          className={cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', more || ['/receitas', '/obrigacoes', '/relatorios', '/categorias', '/configuracoes'].includes(loc.pathname) ? 'text-brand-700 dark:text-brand-300' : 'text-stone-500')}>
          <MoreHorizontal className="size-5" />Mais
        </button>
      </nav>
      {more && (
        <div className="fixed inset-0 z-20 bg-black/30 lg:hidden" onClick={() => setMore(false)}>
          <div className="absolute inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] rounded-2xl border border-stone-200 bg-white p-2 shadow-xl dark:border-stone-800 dark:bg-stone-900" onClick={(e) => e.stopPropagation()}>
            {NAV.slice(4).map(({ to, label, icon: I }) => <NavLink key={to} to={to} onClick={() => setMore(false)} className={link}><I className="size-5" />{label}</NavLink>)}
            <button onClick={() => signOut(auth)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-stone-600 dark:text-stone-300"><LogOut className="size-5" />Sair</button>
          </div>
        </div>
      )}
    </div>
  )
}
