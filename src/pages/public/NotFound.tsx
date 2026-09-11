import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="dark flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-6xl font-extrabold text-primary">404</h1>
      <p className="text-lg text-muted-foreground">Página não encontrada.</p>
      <Button render={<Link to="/" />}>Voltar ao início</Button>
    </div>
  )
}
