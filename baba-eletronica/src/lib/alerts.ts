// Central de alertas do monitor: decide o que vira alarme sonoro, aviso ou só registro.
import { Alarm } from './audio/alarm'
import { vibrate } from './device'
import { EVENT_LABEL, formatDuration, logEvent } from './events-log'
import { showNotification } from './notify'
import type { CameraEvent, CameraStatus } from './rtc/protocol'
import { settings } from './settings'
import { soundLabel } from './audio/soundscapes'
import { createStore } from './store'
import type { AlertLevel, EventKind, SoundId } from './types'

export interface ActiveAlert {
  id: string
  kind: EventKind
  title: string
  body: string
  at: number
  level: AlertLevel
}

export class AlertCenter {
  readonly state = createStore<{ active: ActiveAlert | null; snoozeUntil: number }>({ active: null, snoozeUntil: 0 })
  private alarm = new Alarm()
  private dismissTimer: ReturnType<typeof setTimeout> | undefined
  private lowBatteryNotified = false

  get snoozed() {
    return Date.now() < this.state.get().snoozeUntil
  }

  handleCameraEvent(ev: CameraEvent, camera: string) {
    logEvent({ id: ev.id, kind: ev.kind, at: ev.at, camera, score: ev.score, duration: ev.duration, detail: ev.detail })
    const alerts = settings.get().alerts
    switch (ev.kind) {
      case 'cry':
        this.raise('cry', alerts.cry, 'Bebê chorando', `${camera} detectou choro`, ev.id)
        break
      case 'cry-end':
        if (this.state.get().active?.kind === 'cry') this.clear()
        break
      case 'motion':
        this.raise('motion', alerts.motion, 'Movimento detectado', `Movimento em ${camera}`, ev.id)
        break
      case 'noise':
        this.raise('noise', alerts.noise, 'Barulho alto', `Som alto em ${camera}`, ev.id)
        break
      case 'soothe':
        if (ev.detail) logEvent({ kind: 'soothe', at: ev.at, camera, detail: soundLabel(ev.detail as SoundId) })
        break
    }
  }

  handleLink(kind: 'lost' | 'restored', camera: string) {
    logEvent({ kind, at: Date.now(), camera })
    if (kind === 'lost') {
      this.raise('lost', settings.get().alerts.lost, 'Conexão perdida', `Sem sinal de ${camera}. Verifique o aparelho da câmera.`)
    } else if (this.state.get().active?.kind === 'lost') {
      this.clear()
    }
  }

  handleStatus(s: CameraStatus) {
    if (s.battery === null) return
    const low = s.battery <= 0.15 && !s.charging
    if (low && !this.lowBatteryNotified) {
      this.lowBatteryNotified = true
      logEvent({ kind: 'battery', at: Date.now(), camera: s.name, score: s.battery })
      this.raise('battery', settings.get().alerts.battery, 'Bateria baixa', `${s.name} está com ${Math.round(s.battery * 100)}% — conecte o carregador.`)
    }
    if (!low && s.battery > 0.25) this.lowBatteryNotified = false
  }

  private raise(kind: EventKind, level: AlertLevel, title: string, body: string, id = `${kind}-${Date.now()}`) {
    if (level === 'log') return
    const s = settings.get()
    const active: ActiveAlert = { id, kind, title, body, at: Date.now(), level }
    // Um alarme ativo não é substituído por um aviso menos importante.
    const cur = this.state.get().active
    if (cur && cur.level === 'alarm' && level !== 'alarm') return
    clearTimeout(this.dismissTimer)
    this.state.patch({ active })
    const volume = () => settings.get().alarmVolume
    if (!this.snoozed) {
      if (level === 'alarm') {
        const tone = kind === 'lost' ? 'lost' : 'cry'
        this.alarm.start(tone, s.alarmTone, volume, kind === 'lost' ? 5000 : 4000)
        if (s.vibrate) vibrate([400, 200, 400, 200, 400])
      } else {
        this.alarm.play('notify', s.alarmTone, volume() * 0.7)
        if (s.vibrate) vibrate(200)
      }
    }
    if (document.visibilityState === 'hidden' || level === 'alarm') void showNotification(title, body, kind)
    if (level === 'notify') this.dismissTimer = setTimeout(() => this.clear(), 7000)
  }

  /** O usuário viu o alerta. */
  acknowledge() {
    this.clear()
  }

  snooze(minutes: number) {
    this.alarm.stop()
    this.state.patch({ snoozeUntil: Date.now() + minutes * 60_000 })
  }

  unsnooze() {
    this.state.patch({ snoozeUntil: 0 })
  }

  clear() {
    clearTimeout(this.dismissTimer)
    this.alarm.stop()
    this.state.patch({ active: null })
  }

  dispose() {
    this.clear()
  }
}

export function describeEvent(kind: EventKind, duration?: number) {
  const base = EVENT_LABEL[kind]
  return duration ? `${base} · ${formatDuration(duration)}` : base
}
