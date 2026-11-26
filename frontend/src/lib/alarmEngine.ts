export type AlarmTone = 'chime' | 'pulse' | 'urgent'

class AlarmAudioEngine {
  private ctx: AudioContext | null = null
  private loopTimer: number | null = null
  private autoStopTimer: number | null = null
  private userInteracted = false
  private isPlaying = false

  constructor() {
    if (typeof window !== 'undefined') {
      const unlock = () => {
        this.userInteracted = true
        if (this.ctx && this.ctx.state === 'suspended') {
          void this.ctx.resume().catch(() => {})
        }
      }
      window.addEventListener('pointerdown', unlock, { passive: true })
      window.addEventListener('keydown', unlock, { passive: true })
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return null
    if (!this.ctx) {
      this.ctx = new AudioCtx()
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {})
    }
    return this.ctx
  }

  public playPattern(tone: AlarmTone = 'chime'): boolean {
    this.userInteracted = true
    const ctx = this.ensureContext()
    if (!ctx) return false

    const now = ctx.currentTime
    const notes =
      tone === 'urgent'
        ? [
            { freq: 880, start: 0, dur: 0.14 },
            { freq: 987.77, start: 0.16, dur: 0.14 },
            { freq: 880, start: 0.32, dur: 0.14 },
            { freq: 1174.66, start: 0.48, dur: 0.25 },
          ]
        : tone === 'pulse'
          ? [
              { freq: 587.33, start: 0, dur: 0.18 },
              { freq: 783.99, start: 0.22, dur: 0.24 },
              { freq: 1046.5, start: 0.5, dur: 0.3 },
            ]
          : [
              // Warm melodic travel chime (C5 -> E5 -> G5 -> C6)
              { freq: 523.25, start: 0, dur: 0.18 },
              { freq: 659.25, start: 0.18, dur: 0.18 },
              { freq: 783.99, start: 0.36, dur: 0.22 },
              { freq: 1046.5, start: 0.6, dur: 0.38 },
            ]

    for (const n of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = tone === 'urgent' ? 'triangle' : 'sine'
      osc.frequency.setValueAtTime(n.freq, now + n.start)

      gain.gain.setValueAtTime(0.0001, now + n.start)
      gain.gain.exponentialRampToValueAtTime(0.24, now + n.start + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + n.start)
      osc.stop(now + n.start + n.dur + 0.02)
    }

    return true
  }

  public startLoopingAlarm(tone: AlarmTone = 'chime', durationMs = 25000): boolean {
    if (!this.userInteracted && (!this.ctx || this.ctx.state !== 'running')) {
      return false
    }
    this.stopAlarm()
    this.isPlaying = true
    this.playPattern(tone)
    this.loopTimer = window.setInterval(() => {
      if (!this.isPlaying) return
      this.playPattern(tone)
    }, 2400)
    this.autoStopTimer = window.setTimeout(() => {
      this.stopAlarm()
    }, durationMs)
    return true
  }

  public stopAlarm(): void {
    this.isPlaying = false
    if (this.loopTimer !== null) {
      clearInterval(this.loopTimer)
      this.loopTimer = null
    }
    if (this.autoStopTimer !== null) {
      clearTimeout(this.autoStopTimer)
      this.autoStopTimer = null
    }
  }
}

export const alarmAudio = new AlarmAudioEngine()

let swRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null

export async function registerReminderServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null
  if (!swRegistrationPromise) {
    swRegistrationPromise = navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        void reg.update().catch(() => {})
        return reg
      })
      .catch(() => null)
  }
  return swRegistrationPromise
}

export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  try {
    const result = await Notification.requestPermission()
    return result
  } catch {
    return Notification.permission
  }
}

const LOCAL_NOTIFIED_STORAGE_KEY = 'travelai_delivered_reminder_keys_v1'

export function hasLocalDeliveredKey(key: string): boolean {
  if (!key || typeof window === 'undefined') return false
  try {
    const raw = localStorage.getItem(LOCAL_NOTIFIED_STORAGE_KEY)
    const list: string[] = raw ? JSON.parse(raw) : []
    return list.includes(key)
  } catch {
    return false
  }
}

export function markLocalDeliveredKey(key: string): void {
  if (!key || typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(LOCAL_NOTIFIED_STORAGE_KEY)
    const list: string[] = raw ? JSON.parse(raw) : []
    if (!list.includes(key)) {
      const updated = [key, ...list].slice(0, 200)
      localStorage.setItem(LOCAL_NOTIFIED_STORAGE_KEY, JSON.stringify(updated))
    }
  } catch {
    // ignore storage quota errors
  }
}

export async function showDesktopTravelNotification(params: {
  tripId: string
  destination: string
  reminderId: string
  reminderTitle: string
  reminderType: string
  day: number
  scheduledTimeDisplay: string
  advanceMinutes: number
  notes?: string
  notificationKey: string
  onClickNavigate?: () => void
}): Promise<'service_worker' | 'notification_api' | 'in_app_only'> {
  const {
    tripId,
    destination,
    reminderId,
    reminderTitle,
    reminderType,
    day,
    scheduledTimeDisplay,
    advanceMinutes,
    notes,
    notificationKey,
    onClickNavigate,
  } = params

  const advanceText =
    advanceMinutes === 0
      ? 'Scheduled now'
      : advanceMinutes >= 60 && advanceMinutes % 60 === 0
        ? `${advanceMinutes / 60} hr${advanceMinutes / 60 > 1 ? 's' : ''} advance notice`
        : `${advanceMinutes} min advance notice`

  const title = `✈ ${destination} (Day ${day}): ${reminderTitle}`
  const bodyParts = [
    `${reminderType} · Scheduled ${scheduledTimeDisplay} (${advanceText})`,
    notes ? `Note: ${notes}` : '',
    `Trip: ${destination} — Click to view trip reminders`,
  ].filter(Boolean)
  const body = bodyParts.join('\n')
  const tag = `travelai-${tripId}-${reminderId}-${notificationKey}`
  const url = `/trips/${tripId}`

  if (getBrowserNotificationPermission() !== 'granted') {
    return 'in_app_only'
  }

  try {
    const reg = await registerReminderServiceWorker()
    if (reg && reg.active && 'showNotification' in reg) {
      await reg.showNotification(title, {
        body,
        tag,
        requireInteraction: true,
        data: { url, tripId, reminderId },
      })
      return 'service_worker'
    }
  } catch {
    // Fall back to standard Notification constructor
  }

  try {
    const notif = new Notification(title, {
      body,
      tag,
      requireInteraction: true,
    })
    notif.onclick = () => {
      window.focus()
      notif.close()
      if (onClickNavigate) {
        onClickNavigate()
      } else {
        window.location.href = url
      }
    }
    return 'notification_api'
  } catch {
    return 'in_app_only'
  }
}

export function formatCountdown(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—'
  if (ms <= 0) return 'Due now'
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0 || days > 0) parts.push(`${hours}h`)
  parts.push(`${minutes}m`)
  if (days === 0 && hours === 0) parts.push(`${seconds}s`)
  return parts.join(' ')
}

export function formatAdvanceLabel(advanceMinutes = 0): string {
  const mins = Number(advanceMinutes) || 0
  if (mins <= 0) return 'At scheduled time'
  if (mins === 5) return '5 minutes before'
  if (mins === 15) return '15 minutes before'
  if (mins === 30) return '30 minutes before'
  if (mins === 60) return '1 hour before'
  if (mins === 120) return '2 hours before'
  if (mins % 60 === 0) return `${mins / 60} hours before`
  return `${mins} minutes before`
}
