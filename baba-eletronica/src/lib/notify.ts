export function notificationsSupported() {
  return typeof Notification !== 'undefined'
}

export async function requestNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

/** Notificação do sistema (útil com o app em segundo plano no Android). */
export async function showNotification(title: string, body: string, tag: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  const options: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = {
    body,
    tag,
    renotify: true,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [300, 150, 300],
  }
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) await reg.showNotification(title, options)
    else new Notification(title, options)
  } catch {
    /* ignore */
  }
}
