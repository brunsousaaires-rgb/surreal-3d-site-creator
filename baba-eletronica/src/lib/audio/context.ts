let ctx: AudioContext | null = null

/** AudioContext único do app. Crie/retome dentro de um toque do usuário (iOS). */
export function audioContext(): AudioContext {
  if (!ctx || ctx.state === 'closed') {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new AC({ latencyHint: 'playback' })
  }
  return ctx
}

/** Desbloqueia o áudio (chamar em handlers de toque/clique). */
export async function unlockAudio(): Promise<boolean> {
  const c = audioContext()
  try {
    if (c.state !== 'running') await c.resume()
    // Um buffer silencioso garante o desbloqueio no Safari.
    const src = c.createBufferSource()
    src.buffer = c.createBuffer(1, 1, c.sampleRate)
    src.connect(c.destination)
    src.start()
  } catch {
    /* ignore */
  }
  return c.state === 'running'
}

/** Retoma o contexto quando a aba volta ao primeiro plano. */
export function keepAudioAlive(): () => void {
  const fn = () => {
    if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running' && ctx.state !== 'closed') {
      void ctx.resume().catch(() => {})
    }
  }
  document.addEventListener('visibilitychange', fn)
  window.addEventListener('pointerdown', fn, { passive: true })
  return () => {
    document.removeEventListener('visibilitychange', fn)
    window.removeEventListener('pointerdown', fn)
  }
}
