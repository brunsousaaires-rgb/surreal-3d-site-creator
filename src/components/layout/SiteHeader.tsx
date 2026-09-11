import { Link, NavLink } from 'react-router-dom'
import { Menu, LogOut, LayoutDashboard, CalendarCheck } from 'lucide-react'
import { Logo } from './Logo'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { useAuth } from '@/hooks/use-auth'

const NAV_LINKS = [
  { to: '/', label: 'Início' },
  { to: '/quadras', label: 'Quadras' },
  { to: '/agendar', label: 'Agendar' },
  { to: '/contato', label: 'Contato' },
]

function NavItem({ to, label, onClick }: { to: string; label: string; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onClick}
      className={({ isActive }) =>
        `text-sm font-medium transition-colors hover:text-primary ${
          isActive ? 'text-primary' : 'text-foreground/80'
        }`
      }
    >
      {label}
    </NavLink>
  )
}

export function SiteHeader() {
  const { user, profile, isAdmin, signOut } = useAuth()

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="text-foreground">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((l) => (
            <NavItem key={l.to} {...l} />
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <>
              {isAdmin && (
                <Button variant="ghost" size="sm" render={<Link to="/admin" />}>
                  <LayoutDashboard className="mr-1 h-4 w-4" /> Dashboard
                </Button>
              )}
              <Button variant="ghost" size="sm" render={<Link to="/minha-conta" />}>
                <CalendarCheck className="mr-1 h-4 w-4" /> {profile?.full_name?.split(' ')[0] || 'Minha conta'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => signOut()}>
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" render={<Link to="/entrar" />}>
                Entrar
              </Button>
              <Button size="sm" render={<Link to="/agendar" />}>
                Agendar horário
              </Button>
            </>
          )}
        </div>

        <Sheet>
          <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" />}>
            <Menu className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <div className="mt-8 flex flex-col gap-6 px-2">
              <Logo />
              <nav className="flex flex-col gap-4">
                {NAV_LINKS.map((l) => (
                  <NavItem key={l.to} {...l} />
                ))}
                {isAdmin && <NavItem to="/admin" label="Dashboard" />}
                {user ? (
                  <NavItem to="/minha-conta" label="Minha conta" />
                ) : (
                  <NavItem to="/entrar" label="Entrar" />
                )}
              </nav>
              {user ? (
                <Button variant="outline" onClick={() => signOut()}>
                  <LogOut className="mr-2 h-4 w-4" /> Sair
                </Button>
              ) : (
                <Button render={<Link to="/agendar" />}>Agendar horário</Button>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
