const mongoose = require('mongoose')

const DEFAULT_TIMEZONE = 'Asia/Kolkata'

function isValidTimeZone(tz) {
  if (!tz || typeof tz !== 'string') return false
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz.trim() })
    return true
  } catch {
    return false
  }
}

function normalizeTimeZone(tz, fallback = DEFAULT_TIMEZONE) {
  const candidate = String(tz || '').trim()
  if (isValidTimeZone(candidate)) return candidate
  if (isValidTimeZone(fallback)) return fallback
  return 'UTC'
}

/**
 * Parses either 24-hour ("19:12", "07:05") or 12-hour ("07:12 PM", "7:12 am") time string
 * into { hours24, minutes, normalized24, display12 }.
 */
function parseReminderTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null
  const clean = timeStr.trim().toUpperCase()
  const match = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/)
  if (!match) return null

  let hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const period = match[3] || null

  if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes < 0 || minutes > 59) return null

  if (period) {
    if (hours < 1 || hours > 12) return null
    if (period === 'PM' && hours < 12) hours += 12
    if (period === 'AM' && hours === 12) hours = 0
  } else {
    if (hours < 0 || hours > 23) return null
  }

  const normalized24 = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  const period12 = hours >= 12 ? 'PM' : 'AM'
  const hours12 = hours % 12 === 0 ? 12 : hours % 12
  const display12 = `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period12}`

  return {
    hours24: hours,
    minutes,
    normalized24,
    display12,
  }
}

/**
 * Formats a UTC Date object into YYYY-MM-DD and 12-hour "hh:mm AM/PM" in the given IANA timezone.
 */
function formatInTimeZone(dateObj, timeZone) {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return null
  const tz = normalizeTimeZone(timeZone)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(dateObj)

  const map = {}
  for (const p of parts) {
    map[p.type] = p.value
  }
  const dateStr = `${map.year}-${map.month}-${map.day}`
  const time12 = `${String(map.hour).padStart(2, '0')}:${map.minute} ${(map.dayPeriod || '').toUpperCase()}`.trim()
  return { dateStr, time12, timeZone: tz }
}

/**
 * Given a date string ("YYYY-MM-DD"), 24-hour (hours, minutes), and an IANA timezone,
 * computes the exact UTC Date object corresponding to that wall-clock time in that timezone.
 */
function zonedWallTimeToUtc(dateStr, hours24, minutes, timeZone) {
  if (!dateStr || typeof dateStr !== 'string') return null
  const dateMatch = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!dateMatch) return null

  const year = parseInt(dateMatch[1], 10)
  const month = parseInt(dateMatch[2], 10)
  const day = parseInt(dateMatch[3], 10)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const tz = normalizeTimeZone(timeZone)
  const targetUtcMs = Date.UTC(year, month - 1, day, hours24, minutes, 0, 0)

  const getOffsetMsAt = (utcMs) => {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    const parts = dtf.formatToParts(new Date(utcMs))
    const m = {}
    for (const p of parts) m[p.type] = p.value
    let hr = parseInt(m.hour, 10)
    if (hr === 24) hr = 0
    const asUtc = Date.UTC(
      parseInt(m.year, 10),
      parseInt(m.month, 10) - 1,
      parseInt(m.day, 10),
      hr,
      parseInt(m.minute, 10),
      parseInt(m.second, 10),
      0
    )
    return asUtc - utcMs
  }

  const offset1 = getOffsetMsAt(targetUtcMs)
  const pass1 = targetUtcMs - offset1
  const offset2 = getOffsetMsAt(pass1)
  return new Date(targetUtcMs - offset2)
}

/**
 * Infers a default YYYY-MM-DD date for a reminder from the trip's travelDates.start + (day - 1),
 * or falls back to today's date in the reminder's timezone if travelDates.start is not set.
 */
function resolveReminderDate(reminderDate, trip, dayNumber = 1, timeZone = DEFAULT_TIMEZONE) {
  if (reminderDate && /^\d{4}-\d{2}-\d{2}$/.test(String(reminderDate).trim())) {
    return String(reminderDate).trim()
  }
  const tz = normalizeTimeZone(timeZone)
  if (trip?.travelDates?.start) {
    const start = new Date(trip.travelDates.start)
    if (!Number.isNaN(start.getTime())) {
      const offsetDays = Math.max(0, (Number(dayNumber) || 1) - 1)
      const target = new Date(start.getTime() + offsetDays * 24 * 60 * 60 * 1000)
      const formatted = formatInTimeZone(target, tz)
      if (formatted?.dateStr) return formatted.dateStr
    }
  }
  const todayFormatted = formatInTimeZone(new Date(), tz)
  return todayFormatted?.dateStr || new Date().toISOString().slice(0, 10)
}

/**
 * Computes full scheduling metadata for a reminder:
 * - date ("YYYY-MM-DD")
 * - time ("HH:mm")
 * - scheduledTimeDisplay ("07:12 PM")
 * - notifyTimeDisplay ("05:12 PM")
 * - scheduledAt (UTC Date)
 * - notifyAt (UTC Date = scheduledAt - advanceMinutes)
 * - notificationKey (unique schedule fingerprint for deduplication)
 */
function computeReminderSchedule(input = {}, trip = null) {
  const defaultTz =
    trip?.reminderSettings?.tripTimezone ||
    trip?.reminderSettings?.userTimezone ||
    DEFAULT_TIMEZONE
  const timezone = normalizeTimeZone(input.timezone, defaultTz)
  const day = Math.max(1, Number(input.day) || 1)
  const advanceMinutes = Math.max(0, Math.min(10080, Math.round(Number(input.advanceMinutes) || 0)))
  const presetValues = ['0', '5', '15', '30', '60', '120']
  const advanceMode = input.advanceMode === 'custom' || !presetValues.includes(String(advanceMinutes))
    ? 'custom'
    : String(advanceMinutes)

  const parsedTime = parseReminderTime(input.time)
  const date = resolveReminderDate(input.date, trip, day, timezone)

  if (!parsedTime) {
    return {
      day,
      date,
      time: String(input.time || '').trim(),
      timezone,
      advanceMinutes,
      advanceMode,
      scheduledAt: null,
      notifyAt: null,
      scheduledTimeDisplay: String(input.time || '').trim(),
      notifyTimeDisplay: '',
      notificationKey: '',
    }
  }

  const scheduledAt = zonedWallTimeToUtc(date, parsedTime.hours24, parsedTime.minutes, timezone)
  const notifyAt = scheduledAt ? new Date(scheduledAt.getTime() - advanceMinutes * 60 * 1000) : null
  const notifyFormatted = notifyAt ? formatInTimeZone(notifyAt, timezone) : null

  const notificationKey = scheduledAt && notifyAt
    ? `${date}|${parsedTime.normalized24}|${timezone}|${advanceMinutes}`
    : ''

  return {
    day,
    date,
    time: parsedTime.normalized24,
    timezone,
    advanceMinutes,
    advanceMode,
    scheduledAt,
    notifyAt,
    scheduledTimeDisplay: parsedTime.display12,
    notifyTimeDisplay: notifyFormatted
      ? notifyFormatted.dateStr !== date
        ? `${notifyFormatted.dateStr} ${notifyFormatted.time12}`
        : notifyFormatted.time12
      : parsedTime.display12,
    notificationKey,
  }
}

/**
 * Evaluates all reminders on a trip against `now` (defaults to current time)
 * to classify upcoming, dueNow, and overdue reminders, plus the next upcoming reminder countdown.
 */
function evaluateTripReminders(trip, nowDate = new Date()) {
  const nowMs = nowDate.getTime()
  const reminders = Array.isArray(trip?.reminders) ? trip.reminders : []

  const enriched = reminders.map((r) => {
    const obj = r.toObject ? r.toObject() : { ...r }
    const schedule = computeReminderSchedule(obj, trip)
    const scheduledMs = schedule.scheduledAt ? schedule.scheduledAt.getTime() : null
    let notifyMs = schedule.notifyAt ? schedule.notifyAt.getTime() : null
    const updatedAtMs = obj.scheduleUpdatedAt ? new Date(obj.scheduleUpdatedAt).getTime() : 0

    // If the reminder event (scheduledMs) was in the future when scheduled,
    // but the advance window (notifyMs) had already passed before the user created/edited it,
    // clamp the effective notification time to scheduledMs so it triggers at the event time instead of firing prematurely on creation.
    if (updatedAtMs > 0 && scheduledMs !== null && notifyMs !== null && notifyMs <= updatedAtMs && scheduledMs > updatedAtMs) {
      notifyMs = scheduledMs
      schedule.notifyAt = schedule.scheduledAt
      schedule.notifyTimeDisplay = schedule.scheduledTimeDisplay
    }

    const enabled = obj.enabled !== false
    const completed = Boolean(obj.completed)
    const alreadyNotifiedForCurrentSchedule =
      Boolean(obj.notifiedAt) &&
      Boolean(schedule.notificationKey) &&
      obj.lastNotifiedKey === schedule.notificationKey

    // A reminder that was already in the past at the moment it was created/updated is overdue, not due_now
    const wasCreatedInPast = updatedAtMs > 0 && notifyMs !== null && notifyMs <= updatedAtMs

    let status = 'unscheduled'
    if (completed) {
      status = 'completed'
    } else if (!enabled) {
      status = 'disabled'
    } else if (scheduledMs !== null && notifyMs !== null) {
      if (nowMs > scheduledMs) {
        status = 'overdue'
      } else if (nowMs >= notifyMs && !alreadyNotifiedForCurrentSchedule && !wasCreatedInPast) {
        status = 'due_now'
      } else if (nowMs >= notifyMs && alreadyNotifiedForCurrentSchedule) {
        status = 'notified_waiting_event'
      } else {
        status = 'upcoming'
      }
    }

    const msUntilNotify = notifyMs !== null ? notifyMs - nowMs : null
    const msUntilEvent = scheduledMs !== null ? scheduledMs - nowMs : null

    return {
      ...obj,
      ...schedule,
      enabled,
      completed,
      alreadyNotified: alreadyNotifiedForCurrentSchedule,
      wasCreatedInPast,
      status,
      msUntilNotify,
      msUntilEvent,
    }
  })

  // Sort chronologically by notifyAt / scheduledAt / day
  enriched.sort((a, b) => {
    const aTime = a.notifyAt ? new Date(a.notifyAt).getTime() : Number.MAX_SAFE_INTEGER
    const bTime = b.notifyAt ? new Date(b.notifyAt).getTime() : Number.MAX_SAFE_INTEGER
    if (aTime !== bTime) return aTime - bTime
    return (a.day || 1) - (b.day || 1)
  })

  const dueReminders = enriched.filter(
    (r) =>
      r.enabled &&
      !r.completed &&
      !r.alreadyNotified &&
      !r.wasCreatedInPast &&
      r.notifyAt &&
      new Date(r.notifyAt).getTime() <= nowMs &&
      // Trigger for reminders whose notifyAt is reached and aren't more than 24 hours past scheduledAt
      (!r.scheduledAt || nowMs - new Date(r.scheduledAt).getTime() <= 24 * 60 * 60 * 1000)
  )

  const upcomingReminders = enriched.filter(
    (r) =>
      r.enabled &&
      !r.completed &&
      ((r.notifyAt && new Date(r.notifyAt).getTime() > nowMs) ||
        (r.scheduledAt && new Date(r.scheduledAt).getTime() > nowMs))
  )

  const overdueReminders = enriched.filter(
    (r) => r.enabled && !r.completed && r.scheduledAt && new Date(r.scheduledAt).getTime() < nowMs
  )

  const nextUpcoming =
    upcomingReminders.sort((a, b) => {
      const aNext = !a.alreadyNotified && a.notifyAt ? new Date(a.notifyAt).getTime() : new Date(a.scheduledAt).getTime()
      const bNext = !b.alreadyNotified && b.notifyAt ? new Date(b.notifyAt).getTime() : new Date(b.scheduledAt).getTime()
      return aNext - bNext
    })[0] || null

  return {
    reminders: enriched,
    dueReminders,
    upcomingReminders,
    overdueReminders,
    nextUpcoming,
  }
}

module.exports = {
  DEFAULT_TIMEZONE,
  isValidTimeZone,
  normalizeTimeZone,
  parseReminderTime,
  formatInTimeZone,
  zonedWallTimeToUtc,
  resolveReminderDate,
  computeReminderSchedule,
  evaluateTripReminders,
}
