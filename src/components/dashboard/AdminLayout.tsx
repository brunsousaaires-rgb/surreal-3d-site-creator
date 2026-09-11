import { Link, NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  CalendarRange,
  ClipboardList,
  Waves,
  Wallet,
  Users,
  Settings,
  LogOut,
  ExternalLink,
  Menu,
} from 'lucide-react'
import { Logo } from '@/components/layout/Logo'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/admin', label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: '/admin/agenda', label: 'Agenda', icon: CalendarRange },
  { to: '/admin/reservas', label: 'Reservas', icon: ClipboardList },
  { to: '/admin/quadras', label: 'Quadras', icon: Waves },
  { to: '/admin/pagamentos', label: 'Pagamentos', icon: Wallet },
  { to: '/admin/clientes', label: 'Clientes', icon: Users },
  { to: '/admin/configuracoes', label: 'Configurações', icon: Settings },
]

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-1">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground',
            )
          }
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

export function AdminLayout() {
  const { profile, signOut } = useAuth()

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-6 text-sidebar-foreground md:flex">
        <Link to="/" className="mb-8 px-1 text-sidebar-foreground">
          <Logo />
        </Link>
        <SidebarNav />
        <div className="mt-auto space-y-2 border-t border-sidebar-border pt-4">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground"
            render={<Link to="/" />}
          >
            <ExternalLink className="mr-2 h-4 w-4" /> Ver site
          </Button>
          <div className="px-2 text-xs text-sidebar-foreground/60">{profile?.full_name}</div>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start border-sidebar-border text-sidebar-foreground"
            onClick={() => signOut()}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>
      </aside>

      <div className="flex min-h-svh flex-1 flex-col">
        {/* Topbar mobile */}
        <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 md:hidden">
          <Logo />
          <Sheet>
            <SheetTrigger render={<Button variant="ghost" size="icon" />}>
              <Menu className="h-5 w-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar text-sidebar-foreground">
              <SheetTitle className="sr-only">Menu do painel</SheetTitle>
              <div className="mt-6 flex h-full flex-col">
                <SidebarNav />
                <div className="mt-auto space-y-2 border-t border-sidebar-border pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start border-sidebar-border text-sidebar-foreground"
                    onClick={() => signOut()}
                  >
                    <LogOut className="mr-2 h-4 w-4" /> Sair
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </header>

        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
