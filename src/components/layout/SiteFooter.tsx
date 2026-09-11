import { Link } from 'react-router-dom'
import { Phone, MapPin, Clock } from 'lucide-react'
import { Logo } from './Logo'
import { ARENA } from '@/lib/domain'

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-card/40">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 md:grid-cols-4">
        <div className="space-y-3 sm:col-span-2 md:col-span-1">
          <Logo />
          <p className="text-sm text-muted-foreground">
            Arena de vôlei de praia, futevôlei e beach tennis. Agende sua quadra online com poucos cliques.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">Navegação</h3>
          <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
            <Link to="/quadras" className="hover:text-primary">Quadras</Link>
            <Link to="/agendar" className="hover:text-primary">Agendar horário</Link>
            <Link to="/entrar" className="hover:text-primary">Entrar</Link>
          </nav>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">Contato</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" /> {ARENA.phone}
            </li>
            <li className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" /> {ARENA.city}
            </li>
          </ul>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">Funcionamento</h3>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4 text-primary" /> Todos os dias, 08:00 às 22:00
          </p>
        </div>
      </div>

      <div className="border-t border-white/10 py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {ARENA.name}. Todos os direitos reservados.
      </div>
    </footer>
  )
}
