import { createStore } from './store'

export type Route = 'home' | 'camera' | 'monitor' | 'pair' | 'settings' | 'events' | 'help'

export const nav = createStore<{ stack: Route[] }>({ stack: ['home'] })

export function currentRoute(): Route {
  const s = nav.get().stack
  return s[s.length - 1]
}

/** Navega mantendo o botão "voltar" do sistema funcionando. */
export function go(route: Route) {
  if (currentRoute() === route) return
  nav.set({ stack: [...nav.get().stack, route] })
  history.pushState({ ninar: nav.get().stack.length }, '')
}

export function back() {
  if (nav.get().stack.length > 1) history.back()
}

export function resetNav() {
  nav.set({ stack: ['home'] })
}

window.addEventListener('popstate', () => {
  const s = nav.get().stack
  if (s.length > 1) nav.set({ stack: s.slice(0, -1) })
})
