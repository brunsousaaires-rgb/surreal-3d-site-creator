import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'
import { keepAudioAlive } from './lib/audio/context'
import { initSignaling } from './lib/signaling'
import { bootVault } from './lib/vault'

// Sem StrictMode: as sessões de câmera/monitor controlam recursos de hardware
// e não devem ser montadas/desmontadas duas vezes em desenvolvimento.
createRoot(document.getElementById('root')!).render(<App />)

void bootVault().then(initSignaling)
keepAudioAlive()

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
