import { FormEvent, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bell,
  BellOff,
  BellRing,
  BookOpen,
  CheckCircle2,
  Clock,
  CloudRain,
  Compass,
  Edit3,
  Globe,
  History,
  MapPin,
  Moon,
  MoveRight,
  PackageCheck,
  Plus,
  RotateCcw,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
  Volume2,
  VolumeX,
  Wand2,
  X,
} from 'lucide-react'
import './styles.css'
import { aiApi, authApi, expensesApi, tripsApi, usersApi } from './lib/api'
import {
  AlarmTone,
  alarmAudio,
  formatAdvanceLabel,
  formatCountdown,
  getBrowserNotificationPermission,
  hasLocalDeliveredKey,
  markLocalDeliveredKey,
  registerReminderServiceWorker,
  requestBrowserNotificationPermission,
  showDesktopTravelNotification,
} from './lib/alarmEngine'

type User = { id: string; name: string; email: string }

type Activity = {
  id: string
  time: string
  title: string
  description: string
  estimatedCost: number
  category?: string
  location?: string
  notes?: string
  durationMinutes?: number
  isOutdoor?: boolean
  whySuitable?: string
}

type ItineraryDay = {
  day: number
  title: string
  activities: Activity[]
  estimatedDayCost: number
}

type PackingItem = {
  id: string
  item: string
  category: string
  packed: boolean
  isCustom?: boolean
}

type ReminderItem = {
  id: string
  day: number
  date: string
  time: string
  timezone: string
  advanceMinutes: number
  advanceMode: string
  scheduledAt?: string | null
  notifyAt?: string | null
  scheduledTimeDisplay?: string
  notifyTimeDisplay?: string
  title: string
  type: string
  notes: string
  enabled: boolean
  completed: boolean
  alarmSound?: boolean
  notifiedAt?: string | null
  notificationKey?: string
  lastNotifiedKey?: string
  acknowledgedAt?: string | null
  deliveryChannel?: string
  scheduleUpdatedAt?: string | null
  wasCreatedInPast?: boolean
  alreadyNotified?: boolean
  status?: 'upcoming' | 'due_now' | 'notified_waiting_event' | 'overdue' | 'completed' | 'disabled' | 'unscheduled'
  msUntilNotify?: number | null
  msUntilEvent?: number | null
}

type ReminderSettings = {
  alarmSoundEnabled: boolean
  alarmTone: AlarmTone
  defaultAdvanceMinutes: number
  userTimezone: string
  tripTimezone: string
}

type NotificationHistoryItem = {
  id: string
  reminderId: string
  title: string
  type: string
  day: number
  date?: string
  scheduledTimeDisplay?: string
  notifyTimeDisplay?: string
  advanceMinutes: number
  timezone?: string
  deliveredAt: string
  channel: string
  dismissedAt?: string | null
}

type TripNoteItem = {
  id: string
  day: number
  tag: string
  title: string
  content: string
  updatedAt?: string
}

type LocalTipItem = {
  category: string
  title: string
  advice: string
}

type Trip = {
  _id: string
  destination: string
  startLocation: string
  days: number
  travelers: number
  budget: number
  preference: string
  travelDates?: { start?: string; end?: string }
  user?: { _id?: string; name: string; email: string } | string
  membershipRole?: 'OWNER' | 'PARTNER' | 'EDITOR' | 'VIEWER'
  partners?: { user: string; name: string; email: string }[]
  itinerary?: { summary?: string; days?: ItineraryDay[]; tips?: string[] }
  itineraryPreferences?: {
    excludedActivities?: string[]
    excludedCategories?: string[]
    pace?: 'Relaxed' | 'Balanced' | 'Packed'
    customNotes?: string
  }
  budgetBreakdown?: Record<string, number>
  budgetStatus?: {
    estimatedTotal: number
    availableBudget: number
    remainingPlannedBudget: number
    isExceeded: boolean
    exceededBy: number
  }
  weather?: any
  transport?: any
  packingChecklist?: PackingItem[]
  reminders?: ReminderItem[]
  reminderSettings?: ReminderSettings
  notificationHistory?: NotificationHistoryItem[]
  reminderEvaluation?: {
    dueReminders: ReminderItem[]
    upcomingReminders: ReminderItem[]
    overdueReminders: ReminderItem[]
    nextUpcoming: ReminderItem | null
  }
  tripNotes?: TripNoteItem[]
  localTips?: LocalTipItem[]
  undoHistory?: { label: string; createdAt: string }[]
  feasibility?: {
    warnings: {
      id: string
      day: number
      activityId?: string
      type: string
      severity: 'warning' | 'info'
      sourceType: string
      title: string
      message: string
    }[]
    weatherAdvisories: {
      id: string
      day: number
      activityId?: string
      activityTitle: string
      conditionLabel: string
      precipitationProbability?: number | null
      forecastDate?: string | null
      forecastScope: string
      warningMessage: string
      indoorAlternatives: string[]
    }[]
    forecastDisclaimer?: string
  }
  readiness?: {
    itinerary: { plannedDays: number; totalDays: number; totalActivities: number; percent: number; label: string }
    packing: { packedCount: number; totalCount: number; percent: number; label: string }
    budget: {
      budget: number
      estimatedTotal: number
      actualSpent: number
      remainingPlanned: number
      remainingActual: number
      estimatedUtilizationPercent: number
      actualUtilizationPercent: number
      isOverBudget: boolean
      exceededBy: number
      label: string
    }
    weather: { available: boolean; label: string }
    route: { available: boolean; label: string }
    reminders: { totalCount: number; completedCount: number; pendingCount: number; label: string }
  }
}

type Expense = { _id: string; user: string; category: string; title: string; amount: number }

const ACTIVITY_CATEGORIES = [
  'Activities',
  'Sightseeing',
  'Food',
  'Transportation',
  'Accommodation',
  'Local Transport',
  'Shopping',
  'Relaxation',
  'Miscellaneous',
]

const QUICK_ACTIVITY_PRESETS = [
  { title: 'Visit a local museum', category: 'Activities', time: '10:30 AM', estimatedCost: 800, description: 'Explore regional history, art exhibitions, and cultural heritage indoors.' },
  { title: 'Explore a hidden beach', category: 'Relaxation', time: '04:00 PM', estimatedCost: 500, description: 'Relax by the scenic coastline and enjoy sunset views.' },
  { title: 'Try local street food', category: 'Food', time: '06:30 PM', estimatedCost: 1200, description: 'Sample authentic regional snacks and popular street delicacies.' },
  { title: 'Visit a shopping market', category: 'Shopping', time: '03:00 PM', estimatedCost: 2500, description: 'Browse local handicrafts, souvenirs, and traditional bazaar stalls.' },
  { title: 'Go for a photography walk', category: 'Sightseeing', time: '07:30 AM', estimatedCost: 0, description: 'Morning golden-hour walking tour through historic streets and viewpoints.' },
]

const COMMON_EXCLUSIONS = [
  'Helicopter tours',
  'Adventure sports',
  'Nightclubs',
  'Expensive restaurants',
  'Luxury cruises',
  'Theme parks',
]

const REMINDER_TYPES = [
  'Flight departure',
  'Hotel check-in',
  'Airport arrival',
  'Activity timing',
  'Document verification',
  'Local transport',
  'General',
]

const ADVANCE_OPTIONS = [
  { mode: '0', minutes: 0, label: 'At scheduled time' },
  { mode: '5', minutes: 5, label: '5 minutes before' },
  { mode: '15', minutes: 15, label: '15 minutes before' },
  { mode: '30', minutes: 30, label: '30 minutes before' },
  { mode: '60', minutes: 60, label: '1 hour before' },
  { mode: '120', minutes: 120, label: '2 hours before' },
  { mode: 'custom', minutes: 45, label: 'Custom advance time…' },
]

const COMMON_TIMEZONES = [
  'Asia/Kolkata',
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
]

const NOTE_TAGS = ['Personal note', 'Important info', 'Place to revisit', 'Travel memory']

const message = (error: any) =>
  error?.response?.data?.error?.details ||
  error?.response?.data?.message ||
  (error?.request ? 'Network error. Check that the API is running.' : 'Something went wrong.')

const money = (n = 0) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`

function getTodayInTz(tz = 'Asia/Kolkata'): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date())
    const m: Record<string, string> = {}
    for (const p of parts) m[p.type] = p.value
    return `${m.year}-${m.month}-${m.day}`
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

function getFutureTimeInTz(tz = 'Asia/Kolkata', offsetMinutes = 5): { date: string; time: string } {
  const target = new Date(Date.now() + offsetMinutes * 60 * 1000)
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(target)
    const m: Record<string, string> = {}
    for (const p of parts) m[p.type] = p.value
    const hr = m.hour === '24' ? '00' : m.hour
    return {
      date: `${m.year}-${m.month}-${m.day}`,
      time: `${hr}:${m.minute}`,
    }
  } catch {
    return {
      date: target.toISOString().slice(0, 10),
      time: '09:00',
    }
  }
}

function computePreviewNotifyTime(timeStr: string, advanceMinutes: number): { scheduled12: string; notify12: string } | null {
  const clean = String(timeStr || '').trim().toUpperCase()
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
  } else if (hours < 0 || hours > 23) {
    return null
  }
  const to12 = (totalMins: number) => {
    const wrapped = ((totalMins % 1440) + 1440) % 1440
    const h24 = Math.floor(wrapped / 60)
    const m = wrapped % 60
    const p = h24 >= 12 ? 'PM' : 'AM'
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12
    const dayShift = Math.floor(totalMins / 1440)
    const suffix = dayShift < 0 ? ' (prev day)' : dayShift > 0 ? ' (next day)' : ''
    return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${p}${suffix}`
  }
  const schedTotal = hours * 60 + minutes
  const notifyTotal = schedTotal - (Number(advanceMinutes) || 0)
  return {
    scheduled12: to12(schedTotal),
    notify12: to12(notifyTotal),
  }
}

function Layout({
  user,
  onLogout,
  darkMode,
  onToggleDark,
  children,
}: {
  user: User
  onLogout: () => void
  darkMode: boolean
  onToggleDark: () => void
  children: React.ReactNode
}) {
  return (
    <main>
      <nav>
        <Link className="brand" to="/dashboard">
          <span>✦</span> travelai
        </Link>
        <div className="navright">
          <span>Welcome, {user.name}</span>
          <button
            type="button"
            className="icon theme-toggle"
            onClick={onToggleDark}
            aria-label="Toggle dark mode"
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button className="login" onClick={onLogout}>
            Log out
          </button>
          <Link className="darkbtn" to="/trips/new">
            Plan a trip <ArrowRight size={16} />
          </Link>
        </div>
      </nav>
      {children}
    </main>
  )
}

function Auth({ register, onAuth }: { register?: boolean; onAuth: (u: User, t: string) => void }) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const f = new FormData(e.currentTarget)
    try {
      const { data } = register
        ? await authApi.register({
            name: String(f.get('name')),
            email: String(f.get('email')),
            password: String(f.get('password')),
          })
        : await authApi.login({
            email: String(f.get('email')),
            password: String(f.get('password')),
          })
      onAuth(data.user, data.token)
      navigate('/dashboard')
    } catch (err) {
      setError(message(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="authpage">
      <form className="formcard" onSubmit={submit}>
        <Link className="brand" to="/">
          <span>✦</span> travelai
        </Link>
        <h1>{register ? 'Create your account' : 'Welcome back'}</h1>
        {error && <p className="error">{error}</p>}
        {register && (
          <label>
            Name
            <input name="name" required minLength={2} />
          </label>
        )}
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" required minLength={8} />
        </label>
        <button className="darkbtn" disabled={loading}>
          {loading ? 'Please wait…' : register ? 'Create account' : 'Log in'}
        </button>
        <p>
          {register ? 'Already have an account?' : 'New to TravelAI?'}{' '}
          <Link to={register ? '/login' : '/register'}>{register ? 'Log in' : 'Create one'}</Link>
        </p>
      </form>
    </section>
  )
}

function Dashboard() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    tripsApi
      .list()
      .then((r) => setTrips(r.data.trips))
      .catch((e) => setError(message(e)))
      .finally(() => setLoading(false))
  }, [])

  return (
    <section className="content">
      <div className="pagehead">
        <div>
          <p className="eyebrow">MY TRIPS</p>
          <h1>Your journeys, thoughtfully planned.</h1>
        </div>
        <Link className="darkbtn" to="/trips/new">
          <Plus size={16} /> Create trip
        </Link>
      </div>
      {loading ? (
        <p>Loading trips…</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : trips.length === 0 ? (
        <div className="empty">
          <h2>No trips yet.</h2>
          <p>Plan your first trip and let AI help shape the itinerary.</p>
          <Link className="darkbtn" to="/trips/new">
            Plan your first trip
          </Link>
        </div>
      ) : (
        <div className="tripgrid">
          {trips.map((t) => {
            const estTotal = t.budgetBreakdown?.estimatedTotal
            const hasItinerary = Boolean(t.itinerary?.days?.length)
            return (
              <Link className="tripcard" key={t._id} to={`/trips/${t._id}`}>
                <p className="eyebrow">
                  {t.preference} · {t.days} days · {t.travelers} traveller{t.travelers > 1 ? 's' : ''}
                </p>
                <h2>{t.destination}</h2>
                <p>From {t.startLocation}</p>
                {t.membershipRole !== 'OWNER' && (
                  <small className="role-chip">
                    Shared Trip · {t.membershipRole === 'VIEWER' || t.membershipRole === 'EDITOR' ? 'PARTNER' : t.membershipRole || 'PARTNER'}
                  </small>
                )}
                <div className="tripcard-foot">
                  <b>{money(t.budget)} budget</b>
                  {hasItinerary && typeof estTotal === 'number' && (
                    <small className={estTotal > t.budget ? 'text-danger' : 'text-muted'}>
                      Est. {money(estTotal)}
                    </small>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}

function TripForm({ user }: { user: User }) {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [partnerEmail, setPartnerEmail] = useState('')
  const [partners, setPartners] = useState<{ id: string; name: string; email: string }[]>([])
  const preferences = ['Adventure', 'Relaxation', 'Family', 'Couple', 'Luxury', 'Budget', 'Nature', 'Culture', 'Food', 'Mixed']

  const invite = async () => {
    const email = partnerEmail.trim().toLowerCase()
    setError('')
    if (!email) return
    if (email === user.email.toLowerCase()) return setError('You cannot invite yourself.')
    if (partners.some((partner) => partner.email === email)) return setError('This partner has already been invited.')
    try {
      const { data } = await usersApi.lookup(email)
      setPartners((current) => [...current, data.user])
      setPartnerEmail('')
    } catch (err) {
      setError(message(err))
    }
  }

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const f = new FormData(e.currentTarget)
    try {
      const startDate = f.get('startDate') ? String(f.get('startDate')) : undefined
      const { data } = await tripsApi.create({
        destination: f.get('destination'),
        startLocation: f.get('startLocation'),
        days: f.get('days'),
        travelers: f.get('travelers'),
        budget: f.get('budget'),
        preference: f.get('preference'),
        travelDates: startDate ? { start: startDate } : undefined,
        partnerEmails: partners.map((partner) => partner.email),
      })
      navigate(`/trips/${data.trip._id}`)
    } catch (err) {
      setError(message(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="content narrow">
      <p className="eyebrow">NEW TRIP</p>
      <h1>Tell us about your journey.</h1>
      <form className="formcard" onSubmit={submit}>
        {error && <p className="error">{error}</p>}
        <label>
          Destination
          <input name="destination" required placeholder="e.g., Las Vegas, Kyoto, Goa" />
        </label>
        <label>
          Starting location
          <input name="startLocation" required placeholder="Where will you depart from?" />
        </label>
        <div className="formrow">
          <label>
            Days
            <input name="days" type="number" min="1" max="30" defaultValue={5} required />
          </label>
          <label>
            Travellers
            <input name="travelers" type="number" min="1" max="20" defaultValue={2} required />
          </label>
        </div>
        <div className="formrow">
          <label>
            Total budget (INR)
            <input name="budget" type="number" min="0" placeholder="e.g., 150000" required />
          </label>
          <label>
            Start date <small style={{ fontWeight: 400 }}>(optional)</small>
            <input name="startDate" type="date" />
          </label>
        </div>
        <label>
          Travel preference
          <select name="preference">
            {preferences.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <section className="partner-invites">
          <b>
            Invite Partners <small>(optional)</small>
          </b>
          <div>
            <input
              value={partnerEmail}
              onChange={(event) => setPartnerEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void invite()
                }
              }}
              type="email"
              placeholder="partner@email.com"
            />
            <button type="button" onClick={() => void invite()}>
              Invite
            </button>
          </div>
          {partners.length > 0 && (
            <div className="partner-chips">
              {partners.map((partner) => (
                <span key={partner.id}>
                  {partner.name}
                  <small>{partner.email}</small>
                  <button
                    type="button"
                    aria-label={`Remove ${partner.name}`}
                    onClick={() => setPartners((current) => current.filter((item) => item.id !== partner.id))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>
        <button className="darkbtn" disabled={loading}>
          {loading ? 'Creating trip…' : 'Create trip'}
        </button>
      </form>
    </section>
  )
}

function TripDetail({ user }: { user: User }) {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const detectedBrowserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'

  const [trip, setTrip] = useState<Trip | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState<{ text: string; canUndo?: boolean } | null>(null)
  const [activeTab, setActiveTab] = useState<'itinerary' | 'packing' | 'reminders' | 'tips' | 'notes'>('itinerary')

  // Live wall-clock tick for countdowns & due reminder checks
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    getBrowserNotificationPermission()
  )
  const [swActive, setSwActive] = useState<boolean>(false)
  const [activeAlarms, setActiveAlarms] = useState<ReminderItem[]>([])
  const inFlightTriggersRef = useRef<Set<string>>(new Set())

  // Activity Edit / Add Modal State
  const [activityModal, setActivityModal] = useState<{
    mode: 'add' | 'edit'
    dayNumber: number
    activity?: Activity
  } | null>(null)
  const [actForm, setActForm] = useState({
    day: 1,
    title: '',
    description: '',
    time: '09:00 AM',
    estimatedCost: 0,
    category: 'Activities',
    location: '',
    notes: '',
  })

  // Delete Activity Confirmation Modal State
  const [deleteConfirm, setDeleteConfirm] = useState<{
    dayNumber: number
    activity: Activity
  } | null>(null)

  // AI Alternatives Modal State
  const [aiReplaceModal, setAiReplaceModal] = useState<{
    dayNumber: number
    activity: Activity
    userReason: string
    loading: boolean
    alternatives: Activity[]
    selectedIdx: number
    source?: string
  } | null>(null)

  // AI Preferences Modal State
  const [showPrefsModal, setShowPrefsModal] = useState(false)
  const [prefsForm, setPrefsForm] = useState<{
    excludedActivities: string[]
    customExclusion: string
    pace: 'Relaxed' | 'Balanced' | 'Packed'
    customNotes: string
  }>({
    excludedActivities: [],
    customExclusion: '',
    pace: 'Balanced',
    customNotes: '',
  })

  // Budget Optimization State
  const [budgetOptimization, setBudgetOptimization] = useState<{
    loading: boolean
    summary: string
    recommendations: {
      day: number
      targetActivity: string
      currentCost: number
      suggestedAlternative: string
      estimatedNewCost: number
      estimatedSavings: number
      advice: string
    }[]
  } | null>(null)

  const [draggedActivity, setDraggedActivity] = useState<{ dayNumber: number; activityId: string } | null>(null)

  // Real-world forms state
  const [newPackingItem, setNewPackingItem] = useState({ item: '', category: 'Essentials' })

  // Upgraded Reminder Form State (Supports Add & Edit)
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null)
  const [reminderForm, setReminderForm] = useState<{
    day: number
    date: string
    time: string
    timezone: string
    advanceMode: string
    advanceMinutes: number
    title: string
    type: string
    notes: string
    enabled: boolean
    alarmSound: boolean
  }>(() => {
    const def = getFutureTimeInTz(detectedBrowserTz, 5)
    return {
      day: 1,
      date: def.date,
      time: def.time,
      timezone: detectedBrowserTz,
      advanceMode: '0',
      advanceMinutes: 0,
      title: '',
      type: 'Flight departure',
      notes: '',
      enabled: true,
      alarmSound: true,
    }
  })

  const [newNote, setNewNote] = useState({
    day: 1,
    tag: 'Personal note',
    title: '',
    content: '',
  })
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)

  const showToast = (text: string, canUndo = false) => {
    setToast({ text, canUndo })
  }

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 5500)
    return () => clearTimeout(timer)
  }, [toast])

  // Register Service Worker on mount
  useEffect(() => {
    void registerReminderServiceWorker().then((reg) => {
      setSwActive(Boolean(reg))
    })
    setNotifPermission(getBrowserNotificationPermission())
    return () => {
      alarmAudio.stopAlarm()
    }
  }, [])

  const syncFromTrip = (loadedTrip: Trip) => {
    setPrefsForm({
      excludedActivities: loadedTrip.itineraryPreferences?.excludedActivities || [],
      customExclusion: '',
      pace: loadedTrip.itineraryPreferences?.pace || 'Balanced',
      customNotes: loadedTrip.itineraryPreferences?.customNotes || '',
    })
    const effectiveTz =
      loadedTrip.reminderSettings?.tripTimezone ||
      loadedTrip.reminderSettings?.userTimezone ||
      detectedBrowserTz
    const defaultAdv = loadedTrip.reminderSettings?.defaultAdvanceMinutes ?? 0
    const presetModes = ['0', '5', '15', '30', '60', '120']
    setReminderForm((curr) =>
      editingReminderId
        ? curr
        : {
            ...curr,
            timezone: effectiveTz,
            date: curr.date || getFutureTimeInTz(effectiveTz, 5).date,
            advanceMinutes: defaultAdv,
            advanceMode: presetModes.includes(String(defaultAdv)) ? String(defaultAdv) : 'custom',
          }
    )
  }

  const load = async () => {
    try {
      const r = await tripsApi.get(id)
      setTrip(r.data.trip)
      setExpenses(r.data.expenses || [])
      syncFromTrip(r.data.trip)
    } catch (e) {
      setError(message(e))
    }
  }

  useEffect(() => {
    void load()
  }, [id])

  // Wall-clock 1-second timer + visibilitychange/focus wakeup + 30-second server sync
  useEffect(() => {
    const tick = window.setInterval(() => {
      setNowMs(Date.now())
    }, 1000)

    const onWake = () => {
      setNowMs(Date.now())
      setNotifPermission(getBrowserNotificationPermission())
    }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)

    return () => {
      clearInterval(tick)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
    }
  }, [])

  // Trigger Engine: checks if any enabled, uncompleted reminder has reached notifyAt
  useEffect(() => {
    if (!trip || !Array.isArray(trip.reminders) || trip.reminders.length === 0) return
    const canEditTrip =
      trip.membershipRole === 'OWNER' || trip.membershipRole === 'PARTNER' || trip.membershipRole === 'EDITOR'
    if (!canEditTrip) return

    for (const rem of trip.reminders) {
      if (rem.enabled === false || rem.completed) continue
      if (rem.wasCreatedInPast) continue
      if (!rem.notifyAt) continue

      const notifyTimeMs = new Date(rem.notifyAt).getTime()
      if (Number.isNaN(notifyTimeMs) || nowMs < notifyTimeMs) continue

      // Guard: Never auto-trigger if notifyAt was already <= the timestamp when the reminder schedule was created/updated
      const updatedAtMs = rem.scheduleUpdatedAt ? new Date(rem.scheduleUpdatedAt).getTime() : 0
      if (updatedAtMs > 0 && notifyTimeMs <= updatedAtMs) continue

      // Do not trigger if event was more than 24 hours ago
      if (rem.scheduledAt) {
        const schedMs = new Date(rem.scheduledAt).getTime()
        if (!Number.isNaN(schedMs) && nowMs - schedMs > 24 * 60 * 60 * 1000) continue
      }

      const scheduleKey = rem.notificationKey || `${rem.date}|${rem.time}|${rem.timezone}|${rem.advanceMinutes}`
      const compositeKey = `${trip._id}|${rem.id}|${scheduleKey}`

      // 1. Check MongoDB persisted delivery state
      if (rem.notifiedAt && rem.lastNotifiedKey === scheduleKey) continue
      // 2. Check localStorage cross-tab / refresh delivery state
      if (hasLocalDeliveredKey(compositeKey)) continue
      // 3. Check in-flight request lock
      if (inFlightTriggersRef.current.has(compositeKey)) continue

      inFlightTriggersRef.current.add(compositeKey)

      void (async () => {
        try {
          const perm = getBrowserNotificationPermission()
          const preferredChannel = perm === 'granted' ? 'browser_notification' : 'in_app_alarm'
          const { data } = await tripsApi.triggerReminderNotification(trip._id, rem.id, {
            channel: preferredChannel,
          })

          markLocalDeliveredKey(compositeKey)
          if (data.trip) {
            setTrip(data.trip)
          }

          if (!data.alreadyDelivered) {
            // 1. Show Desktop Browser Notification (via Service Worker or Notification API)
            await showDesktopTravelNotification({
              tripId: trip._id,
              destination: trip.destination,
              reminderId: rem.id,
              reminderTitle: rem.title,
              reminderType: rem.type,
              day: rem.day,
              scheduledTimeDisplay: rem.scheduledTimeDisplay || rem.time,
              advanceMinutes: rem.advanceMinutes,
              notes: rem.notes,
              notificationKey: scheduleKey,
              onClickNavigate: () => setActiveTab('reminders'),
            })

            // 2. Show Active In-App Alarm Banner
            setActiveAlarms((curr) => (curr.some((a) => a.id === rem.id) ? curr : [rem, ...curr]))

            // 3. Play Alarm Sound if enabled globally and on reminder
            const globalSound = trip.reminderSettings?.alarmSoundEnabled !== false
            const remSound = rem.alarmSound !== false
            if (globalSound && remSound) {
              const tone: AlarmTone = trip.reminderSettings?.alarmTone || 'chime'
              alarmAudio.startLoopingAlarm(tone)
            }
          }
        } catch {
          // Will retry on next check if network failed transiently
        } finally {
          inFlightTriggersRef.current.delete(compositeKey)
        }
      })()
    }
  }, [nowMs, trip])

  if (error && !trip) {
    return (
      <section className="content">
        <p className="error">{error}</p>
        <Link className="darkbtn" to="/dashboard">
          Back to dashboard
        </Link>
      </section>
    )
  }
  if (!trip) return <section className="content">Loading trip…</section>

  const isOwner = trip.membershipRole === 'OWNER'
  const canEdit =
    trip.membershipRole === 'OWNER' || trip.membershipRole === 'PARTNER' || trip.membershipRole === 'EDITOR'

  // --- Itinerary Activity Handlers ---

  const openAddActivityModal = (dayNumber: number) => {
    setActForm({
      day: dayNumber,
      title: '',
      description: '',
      time: '10:00 AM',
      estimatedCost: 0,
      category: 'Activities',
      location: trip.destination,
      notes: '',
    })
    setActivityModal({ mode: 'add', dayNumber })
  }

  const openEditActivityModal = (dayNumber: number, activity: Activity) => {
    setActForm({
      day: dayNumber,
      title: activity.title || '',
      description: activity.description || '',
      time: activity.time || '',
      estimatedCost: Number(activity.estimatedCost || 0),
      category: activity.category || 'Activities',
      location: activity.location || trip.destination,
      notes: activity.notes || '',
    })
    setActivityModal({ mode: 'edit', dayNumber, activity })
  }

  const applyPresetToActForm = (preset: (typeof QUICK_ACTIVITY_PRESETS)[number]) => {
    setActForm((curr) => ({
      ...curr,
      title: preset.title,
      category: preset.category,
      time: preset.time,
      estimatedCost: preset.estimatedCost,
      description: preset.description,
    }))
  }

  const handleSaveActivityModal = async (e: FormEvent) => {
    e.preventDefault()
    if (!activityModal) return
    setError('')
    setBusy(activityModal.mode === 'add' ? 'Adding activity…' : 'Saving activity changes…')
    try {
      if (activityModal.mode === 'add') {
        const { data } = await tripsApi.addActivity(id, actForm)
        setTrip(data.trip)
        showToast(`Added "${actForm.title}" to Day ${actForm.day}`, true)
      } else if (activityModal.activity) {
        const { data } = await tripsApi.updateActivity(id, activityModal.activity.id, actForm)
        setTrip(data.trip)
        showToast(`Updated "${actForm.title}"`, true)
      }
      setActivityModal(null)
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy('')
    }
  }

  const handleConfirmDeleteActivity = async () => {
    if (!deleteConfirm) return
    const { activity, dayNumber } = deleteConfirm
    setError('')
    setBusy(`Deleting "${activity.title}"…`)
    try {
      const { data } = await tripsApi.deleteActivity(id, activity.id)
      setTrip(data.trip)
      setDeleteConfirm(null)
      showToast(`Removed "${activity.title}" from Day ${dayNumber}. Daily & trip budgets updated.`, true)
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy('')
    }
  }

  const handleMoveActivity = async (activity: Activity, fromDay: number, targetDay: number) => {
    if (fromDay === targetDay) return
    setError('')
    setBusy(`Moving "${activity.title}" to Day ${targetDay}…`)
    try {
      const { data } = await tripsApi.moveActivity(id, activity.id, { targetDay })
      setTrip(data.trip)
      showToast(`Moved "${activity.title}" from Day ${fromDay} to Day ${targetDay}`, true)
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy('')
    }
  }

  const handleReorderActivity = async (dayNumber: number, activityId: string, direction: 'up' | 'down') => {
    setError('')
    setBusy('Reordering schedule…')
    try {
      const { data } = await tripsApi.reorderActivities(id, dayNumber, { activityId, direction })
      setTrip(data.trip)
      showToast(`Updated activity order in Day ${dayNumber}`, true)
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy('')
    }
  }

  const handleDropOnActivity = async (dayNumber: number, targetActivityId: string) => {
    if (!draggedActivity || draggedActivity.dayNumber !== dayNumber || draggedActivity.activityId === targetActivityId) {
      setDraggedActivity(null)
      return
    }
    const dayObj = (trip.itinerary?.days || []).find((d) => Number(d.day) === dayNumber)
    if (!dayObj) return
    const ids = dayObj.activities.map((a) => a.id)
    const fromIdx = ids.indexOf(draggedActivity.activityId)
    const toIdx = ids.indexOf(targetActivityId)
    if (fromIdx === -1 || toIdx === -1) return
    ids.splice(fromIdx, 1)
    ids.splice(toIdx, 0, draggedActivity.activityId)
    setDraggedActivity(null)

    setBusy('Saving new activity order…')
    try {
      const { data } = await tripsApi.reorderActivities(id, dayNumber, { orderedActivityIds: ids })
      setTrip(data.trip)
      showToast(`Reordered activities in Day ${dayNumber}`, true)
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy('')
    }
  }

  const handleUndoLastChange = async () => {
    setError('')
    setBusy('Undoing last itinerary change…')
    try {
      const { data } = await tripsApi.undoItineraryChange(id)
      setTrip(data.trip)
      showToast(`Undid: ${data.undoneAction}`)
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy('')
    }
  }

  // --- AI Replace Activity Flow ---

  const openAiReplaceModal = async (dayNumber: number, activity: Activity) => {
    setAiReplaceModal({
      dayNumber,
      activity,
      userReason: '',
      loading: true,
      alternatives: [],
      selectedIdx: 0,
    })
    try {
      const { data } = await aiApi.suggestAlternatives({
        tripId: id,
        dayNumber,
        activityId: activity.id,
      })
      setAiReplaceModal((curr) =>
        curr
          ? {
              ...curr,
              loading: false,
              alternatives: data.alternatives || [],
              selectedIdx: 0,
              source: data.source,
            }
          : null
      )
    } catch (e) {
      setAiReplaceModal((curr) => (curr ? { ...curr, loading: false } : null))
      setError(message(e))
    }
  }

  const refreshAiAlternatives = async () => {
    if (!aiReplaceModal) return
    setAiReplaceModal((curr) => (curr ? { ...curr, loading: true } : null))
    try {
      const { data } = await aiApi.suggestAlternatives({
        tripId: id,
        dayNumber: aiReplaceModal.dayNumber,
        activityId: aiReplaceModal.activity.id,
        userReason: aiReplaceModal.userReason,
      })
      setAiReplaceModal((curr) =>
        curr
          ? {
              ...curr,
              loading: false,
              alternatives: data.alternatives || [],
              selectedIdx: 0,
              source: data.source,
            }
          : null
      )
    } catch (e) {
      setAiReplaceModal((curr) => (curr ? { ...curr, loading: false } : null))
      setError(message(e))
    }
  }

  const confirmAiReplacement = async () => {
    if (!aiReplaceModal) return
    const chosen = aiReplaceModal.alternatives[aiReplaceModal.selectedIdx]
    if (!chosen) return
    setError('')
    setBusy(`Replacing "${aiReplaceModal.activity.title}" with "${chosen.title}"…`)
    try {
      const { data } = await tripsApi.updateActivity(id, aiReplaceModal.activity.id, {
        day: aiReplaceModal.dayNumber,
        title: chosen.title,
        description: chosen.description,
        time: chosen.time || aiReplaceModal.activity.time,
        estimatedCost: chosen.estimatedCost,
        category: chosen.category || 'Activities',
        location: chosen.location || trip.destination,
        notes: chosen.notes || '',
      })
      setTrip(data.trip)
      setAiReplaceModal(null)
      showToast(`Replaced "${aiReplaceModal.activity.title}" with "${chosen.title}"`, true)
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy('')
    }
  }

  // --- AI Itinerary Generation & Preferences ---

  const handleSavePreferences = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy('Saving AI preferences…')
    try {
      const { data } = await tripsApi.updatePreferences(id, {
        excludedActivities: prefsForm.excludedActivities,
        pace: prefsForm.pace,
        customNotes: prefsForm.customNotes,
      })
      setTrip(data.trip)
      setShowPrefsModal(false)
      showToast('Saved itinerary preferences & AI exclusions')
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy('')
    }
  }

  const toggleExclusionChip = (term: string) => {
    setPrefsForm((curr) => {
      const exists = curr.excludedActivities.includes(term)
      return {
        ...curr,
        excludedActivities: exists
          ? curr.excludedActivities.filter((x) => x !== term)
          : [...curr.excludedActivities, term],
      }
    })
  }

  const addCustomExclusion = () => {
    const clean = prefsForm.customExclusion.trim()
    if (!clean) return
    if (!prefsForm.excludedActivities.includes(clean)) {
      setPrefsForm((curr) => ({
        ...curr,
        excludedActivities: [...curr.excludedActivities, clean],
        customExclusion: '',
      }))
    } else {
      setPrefsForm((curr) => ({ ...curr, customExclusion: '' }))
    }
  }

  const generate = async () => {
    if (
      trip.itinerary?.days?.length &&
      !confirm(
        'Generate a new complete AI itinerary? (Note: You can edit, add, delete, or replace individual activities without regenerating. If you regenerate, you can still use Undo Last Change.)'
      )
    ) {
      return
    }
    setError('')
    setBusy('Generating AI itinerary…')
    try {
      const { data } = await aiApi.generate(id)
      setTrip(data.trip)
      showToast('AI itinerary generated!', true)
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy('')
    }
  }

  const handleRequestBudgetOptimization = async () => {
    setBudgetOptimization({ loading: true, summary: '', recommendations: [] })
    try {
      const { data } = await aiApi.optimizeBudget(id)
      setBudgetOptimization({
        loading: false,
        summary: data.optimization?.summary || '',
        recommendations: data.optimization?.recommendations || [],
      })
    } catch (e) {
      setBudgetOptimization(null)
      setError(message(e))
    }
  }

  // --- Expenses ---

  const addExpense = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formEl = e.currentTarget
    const f = new FormData(formEl)
    setError('')
    setBusy('Adding expense…')
    try {
      await expensesApi.create(id, {
        category: f.get('category'),
        title: f.get('title'),
        amount: Number(f.get('amount')),
      })
      formEl.reset()
      await load()
      showToast('Actual expense recorded')
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy('')
    }
  }

  const editExpense = async (expense: Expense) => {
    const amount = prompt(`Update ${expense.title} amount`, String(expense.amount))
    if (amount === null) return
    setError('')
    setBusy('Updating expense…')
    try {
      await expensesApi.update(expense._id, { amount: Number(amount) })
      await load()
      showToast(`Updated expense "${expense.title}"`)
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy('')
    }
  }

  const removeExpense = async (expense: Expense) => {
    if (!confirm(`Delete ${expense.title}?`)) return
    setError('')
    setBusy('Deleting expense…')
    try {
      await expensesApi.remove(expense._id)
      await load()
      showToast(`Deleted expense "${expense.title}"`)
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy('')
    }
  }

  // --- Packing Checklist Handlers ---

  const handleGeneratePacking = async () => {
    setError('')
    setBusy('Generating smart packing checklist…')
    try {
      const { data } = await tripsApi.generatePackingList(id)
      setTrip(data.trip)
      showToast('Generated destination & weather-aware packing checklist')
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy('')
    }
  }

  const handleTogglePackingItem = async (item: PackingItem) => {
    try {
      const { data } = await tripsApi.updatePackingItem(id, item.id, { packed: !item.packed })
      setTrip(data.trip)
    } catch (e) {
      setError(message(e))
    }
  }

  const handleAddPackingItem = async (e: FormEvent) => {
    e.preventDefault()
    if (!newPackingItem.item.trim()) return
    setBusy('Adding packing item…')
    try {
      const { data } = await tripsApi.addPackingItem(id, newPackingItem)
      setTrip(data.trip)
      setNewPackingItem({ item: '', category: newPackingItem.category })
      showToast('Added custom item to packing checklist')
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy('')
    }
  }

  const handleDeletePackingItem = async (itemId: string) => {
    try {
      const { data } = await tripsApi.deletePackingItem(id, itemId)
      setTrip(data.trip)
    } catch (e) {
      setError(message(e))
    }
  }

  // --- Upgraded Travel Reminders & Alarm Notification Handlers ---

  const handleRequestPermission = async () => {
    const res = await requestBrowserNotificationPermission()
    setNotifPermission(res)
    if (res === 'granted') {
      showToast('Desktop browser notifications enabled!')
    } else if (res === 'denied') {
      showToast('Notification permission is blocked in browser settings.')
    }
  }

  const handleTestDesktopNotification = async () => {
    let perm = getBrowserNotificationPermission()
    if (perm === 'default') {
      perm = await requestBrowserNotificationPermission()
      setNotifPermission(perm)
    }
    if (perm !== 'granted') {
      showToast('Grant browser notification permission first to receive desktop alerts.')
      return
    }
    await showDesktopTravelNotification({
      tripId: trip._id,
      destination: trip.destination,
      reminderId: 'test-notification',
      reminderTitle: 'Test Travel Reminder Alert',
      reminderType: 'Flight departure',
      day: 1,
      scheduledTimeDisplay: '07:12 PM',
      advanceMinutes: 120,
      notes: 'Desktop notifications are working for your trip!',
      notificationKey: `test-${Date.now()}`,
      onClickNavigate: () => setActiveTab('reminders'),
    })
    showToast('Sent test desktop browser notification!')
  }

  const handleTestAlarmSound = () => {
    const tone: AlarmTone = trip.reminderSettings?.alarmTone || 'chime'
    const ok = alarmAudio.playPattern(tone)
    if (ok) {
      showToast(`Playing "${tone}" alarm tone`)
    } else {
      showToast('Audio context could not be initialized')
    }
  }

  const handleUpdateReminderSettings = async (patch: Partial<ReminderSettings>) => {
    setError('')
    try {
      const { data } = await tripsApi.updateReminderSettings(id, patch)
      setTrip(data.trip)
      showToast('Updated reminder & notification settings')
    } catch (e) {
      setError(message(e))
    }
  }

  const resetReminderForm = () => {
    const effectiveTz =
      trip.reminderSettings?.tripTimezone ||
      trip.reminderSettings?.userTimezone ||
      detectedBrowserTz
    const defaultAdv = trip.reminderSettings?.defaultAdvanceMinutes ?? 0
    const presetModes = ['0', '5', '15', '30', '60', '120']
    const def = getFutureTimeInTz(effectiveTz, 5)
    setEditingReminderId(null)
    setReminderForm({
      day: 1,
      date: def.date,
      time: def.time,
      timezone: effectiveTz,
      advanceMode: presetModes.includes(String(defaultAdv)) ? String(defaultAdv) : 'custom',
      advanceMinutes: defaultAdv,
      title: '',
      type: 'Flight departure',
      notes: '',
      enabled: true,
      alarmSound: true,
    })
  }

  const handleQuickFill2MinAhead = () => {
    const tz = reminderForm.timezone || detectedBrowserTz
    const target = new Date(Date.now() + 2 * 60 * 1000)
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(target)
      const m: Record<string, string> = {}
      for (const p of parts) m[p.type] = p.value
      const hr = m.hour === '24' ? '00' : m.hour
      setReminderForm((curr) => ({
        ...curr,
        date: `${m.year}-${m.month}-${m.day}`,
        time: `${hr}:${m.minute}`,
        advanceMode: '0',
        advanceMinutes: 0,
        title: curr.title || `Flight Boarding Check (${trip.destination})`,
        enabled: true,
      }))
      showToast('Pre-filled reminder scheduled 2 minutes from now!')
    } catch {
      // ignore
    }
  }

  const handleSaveReminder = async (e: FormEvent) => {
    e.preventDefault()
    if (!reminderForm.title.trim()) return
    setError('')
    setBusy(editingReminderId ? 'Updating travel reminder…' : 'Scheduling travel reminder…')
    try {
      const payload = {
        day: reminderForm.day,
        date: reminderForm.date,
        time: reminderForm.time,
        timezone: reminderForm.timezone,
        advanceMinutes: reminderForm.advanceMinutes,
        advanceMode: reminderForm.advanceMode,
        title: reminderForm.title,
        type: reminderForm.type,
        notes: reminderForm.notes,
        enabled: reminderForm.enabled,
        alarmSound: reminderForm.alarmSound,
        clientNowMs: Date.now(),
      }
      if (editingReminderId) {
        const { data } = await tripsApi.updateReminder(id, editingReminderId, payload)
        setTrip(data.trip)
        showToast(`Updated reminder "${reminderForm.title}"`)
      } else {
        const { data } = await tripsApi.addReminder(id, payload)
        setTrip(data.trip)
        showToast(
          `Scheduled reminder for ${data.reminder?.date || reminderForm.date} (Notify at ${data.reminder?.notifyTimeDisplay || reminderForm.time})`
        )
      }
      resetReminderForm()
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy('')
    }
  }

  const handleStartEditReminder = (rem: ReminderItem) => {
    const presetModes = ['0', '5', '15', '30', '60', '120']
    const mode =
      rem.advanceMode && (presetModes.includes(rem.advanceMode) || rem.advanceMode === 'custom')
        ? rem.advanceMode
        : presetModes.includes(String(rem.advanceMinutes))
          ? String(rem.advanceMinutes)
          : 'custom'
    setEditingReminderId(rem.id)
    setReminderForm({
      day: rem.day || 1,
      date: rem.date || getTodayInTz(rem.timezone || detectedBrowserTz),
      time: rem.time || '09:00',
      timezone: rem.timezone || detectedBrowserTz,
      advanceMode: mode,
      advanceMinutes: Number(rem.advanceMinutes || 0),
      title: rem.title,
      type: rem.type || 'General',
      notes: rem.notes || '',
      enabled: rem.enabled !== false,
      alarmSound: rem.alarmSound !== false,
    })
    setActiveTab('reminders')
  }

  const handleToggleReminderCompleted = async (rem: ReminderItem) => {
    try {
      if (!rem.completed) {
        alarmAudio.stopAlarm()
        setActiveAlarms((curr) => curr.filter((a) => a.id !== rem.id))
      }
      const { data } = await tripsApi.updateReminder(id, rem.id, { completed: !rem.completed })
      setTrip(data.trip)
    } catch (e) {
      setError(message(e))
    }
  }

  const handleToggleReminderEnabled = async (rem: ReminderItem) => {
    try {
      if (rem.enabled) {
        alarmAudio.stopAlarm()
        setActiveAlarms((curr) => curr.filter((a) => a.id !== rem.id))
      }
      const { data } = await tripsApi.updateReminder(id, rem.id, { enabled: !rem.enabled })
      setTrip(data.trip)
      showToast(rem.enabled ? `Disabled reminder "${rem.title}"` : `Enabled reminder "${rem.title}"`)
    } catch (e) {
      setError(message(e))
    }
  }

  const handleDeleteReminder = async (reminderId: string) => {
    try {
      alarmAudio.stopAlarm()
      setActiveAlarms((curr) => curr.filter((a) => a.id !== reminderId))
      const { data } = await tripsApi.deleteReminder(id, reminderId)
      setTrip(data.trip)
      if (editingReminderId === reminderId) resetReminderForm()
      showToast('Reminder deleted')
    } catch (e) {
      setError(message(e))
    }
  }

  const handleDismissAlarm = async (rem: ReminderItem) => {
    alarmAudio.stopAlarm()
    setActiveAlarms((curr) => curr.filter((a) => a.id !== rem.id))
    try {
      const { data } = await tripsApi.dismissReminderAlarm(id, rem.id)
      setTrip(data.trip)
    } catch {
      // ignore
    }
  }

  const handleClearNotificationHistory = async () => {
    try {
      const { data } = await tripsApi.clearNotificationHistory(id)
      setTrip(data.trip)
      showToast('Cleared notification history')
    } catch (e) {
      setError(message(e))
    }
  }

  // --- Local Tips Handler ---

  const handleGenerateLocalTips = async () => {
    setError('')
    setBusy(`Generating AI local travel tips for ${trip.destination}…`)
    try {
      const { data } = await aiApi.generateLocalTips(id)
      setTrip(data.trip)
      showToast(`Loaded local travel tips for ${trip.destination}`)
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy('')
    }
  }

  // --- Trip Notes & Journal Handlers ---

  const handleSaveNote = async (e: FormEvent) => {
    e.preventDefault()
    if (!newNote.content.trim()) return
    setBusy('Saving journal note…')
    try {
      if (editingNoteId) {
        const { data } = await tripsApi.updateNote(id, editingNoteId, newNote)
        setTrip(data.trip)
        setEditingNoteId(null)
        showToast('Updated trip note')
      } else {
        const { data } = await tripsApi.addNote(id, newNote)
        setTrip(data.trip)
        showToast(`Saved note for Day ${newNote.day}`)
      }
      setNewNote((curr) => ({ ...curr, title: '', content: '' }))
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy('')
    }
  }

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Delete this note?')) return
    try {
      const { data } = await tripsApi.deleteNote(id, noteId)
      setTrip(data.trip)
      showToast('Deleted note')
    } catch (e) {
      setError(message(e))
    }
  }

  // --- Computed Values ---
  const spent = expenses.reduce((total, expense) => total + Number(expense.amount || 0), 0)
  const breakdown = trip.budgetBreakdown || {}
  const estimatedTotal = Number(breakdown.estimatedTotal ?? trip.budget ?? 0)
  const availableBudget = Number(trip.budget || 0)
  const isOverBudget = estimatedTotal > availableBudget
  const exceededBy = Math.max(0, estimatedTotal - availableBudget)
  const plannedRemaining = availableBudget - estimatedTotal

  const partners = trip.partners || []
  const owner = typeof trip.user === 'object' ? trip.user : user
  const people = [
    {
      name: owner.name,
      email: owner.email,
      id: typeof trip.user === 'object' ? String(trip.user._id || '') : String(trip.user || ''),
    },
    ...partners.map((partner) => ({ ...partner, id: partner.user })),
  ]
  const equalShare = availableBudget / people.length
  const memberSpent = (personId: string) =>
    expenses
      .filter((expense) => String(expense.user) === String(personId))
      .reduce((total, expense) => total + Number(expense.amount || 0), 0)

  const categories = [
    ['Transportation', 'transportation'],
    ['Accommodation', 'accommodation'],
    ['Food', 'food'],
    ['Activities', 'activities'],
    ['Local Transport', 'localTransport'],
    ['Shopping', 'shopping'],
    ['Miscellaneous', 'miscellaneous'],
  ] as const

  const readiness = trip.readiness
  const feasibilityWarnings = trip.feasibility?.warnings || []
  const weatherAdvisories = trip.feasibility?.weatherAdvisories || []
  const totalDayChoices = Math.max(Number(trip.days) || 1, trip.itinerary?.days?.length || 1)

  // Live Client-Side Evaluation of Reminders for Real-Time Countdowns & Status
  const allReminders: ReminderItem[] = (trip.reminders || []).map((r) => {
    const notifyMs = r.notifyAt ? new Date(r.notifyAt).getTime() : null
    const schedMs = r.scheduledAt ? new Date(r.scheduledAt).getTime() : null
    const enabled = r.enabled !== false
    const completed = Boolean(r.completed)
    const alreadyNotified = Boolean(r.notifiedAt && r.lastNotifiedKey && r.lastNotifiedKey === r.notificationKey)
    const updatedAtMs = r.scheduleUpdatedAt ? new Date(r.scheduleUpdatedAt).getTime() : 0
    const wasCreatedInPast = Boolean(
      r.wasCreatedInPast || (updatedAtMs > 0 && notifyMs !== null && notifyMs <= updatedAtMs)
    )

    let liveStatus: ReminderItem['status'] = r.status || 'upcoming'
    if (completed) liveStatus = 'completed'
    else if (!enabled) liveStatus = 'disabled'
    else if (schedMs !== null && nowMs > schedMs) liveStatus = 'overdue'
    else if (notifyMs !== null && nowMs >= notifyMs && !alreadyNotified && !wasCreatedInPast) liveStatus = 'due_now'
    else if (notifyMs !== null && nowMs >= notifyMs && alreadyNotified) liveStatus = 'notified_waiting_event'
    else if (notifyMs !== null) liveStatus = 'upcoming'

    return {
      ...r,
      enabled,
      completed,
      alreadyNotified,
      wasCreatedInPast,
      status: liveStatus,
      msUntilNotify: notifyMs !== null ? notifyMs - nowMs : null,
      msUntilEvent: schedMs !== null ? schedMs - nowMs : null,
    }
  })

  const upcomingReminders = allReminders
    .filter((r) => r.enabled && !r.completed && (r.status === 'upcoming' || r.status === 'notified_waiting_event' || r.status === 'due_now'))
    .sort((a, b) => {
      const aTarget = !a.alreadyNotified && a.notifyAt ? new Date(a.notifyAt).getTime() : new Date(a.scheduledAt || 0).getTime()
      const bTarget = !b.alreadyNotified && b.notifyAt ? new Date(b.notifyAt).getTime() : new Date(b.scheduledAt || 0).getTime()
      return aTarget - bTarget
    })

  const overdueReminders = allReminders.filter((r) => r.status === 'overdue')
  const inactiveReminders = allReminders.filter((r) => r.completed || !r.enabled)
  const nextUpcomingReminder = upcomingReminders[0] || null
  const previewSchedule = computePreviewNotifyTime(reminderForm.time, reminderForm.advanceMinutes)
  const timezoneChoices = Array.from(new Set([detectedBrowserTz, ...COMMON_TIMEZONES]))

  return (
    <section className="content">
      {/* Toast Notification with optional instant Undo */}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={16} />
          <span>{toast.text}</span>
          {toast.canUndo && (trip.undoHistory?.length || 0) > 0 && (
            <button type="button" className="toast-undo" onClick={() => void handleUndoLastChange()}>
              <RotateCcw size={13} /> Undo
            </button>
          )}
          <button type="button" className="toast-close" onClick={() => setToast(null)} aria-label="Dismiss notification">
            ×
          </button>
        </div>
      )}

      {/* ACTIVE RINGING ALARM BANNER (Section 3 & 4) */}
      {activeAlarms.length > 0 && (
        <section className="active-alarm-banner" role="alert">
          {activeAlarms.map((alarm) => (
            <div className="alarm-alert-card" key={alarm.id}>
              <div className="alarm-pulse-icon">
                <BellRing size={22} />
              </div>
              <div className="alarm-alert-copy">
                <span className="eyebrow">
                  TRAVEL REMINDER ALARM · {trip.destination.toUpperCase()} · DAY {alarm.day}
                </span>
                <h3>
                  {alarm.type}: {alarm.title}
                </h3>
                <p>
                  Scheduled for <b>{alarm.date}</b> at <b>{alarm.scheduledTimeDisplay || alarm.time}</b> (
                  {alarm.timezone}) · <em>{formatAdvanceLabel(alarm.advanceMinutes)}</em>
                </p>
                {alarm.notes && <small>Note: {alarm.notes}</small>}
              </div>
              <div className="alarm-alert-actions">
                <button
                  type="button"
                  className="darkbtn"
                  onClick={() => void handleDismissAlarm(alarm)}
                >
                  <VolumeX size={15} /> Dismiss Alarm
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => void handleToggleReminderCompleted(alarm)}
                >
                  <CheckCircle2 size={15} /> Mark Completed
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Trip Header */}
      <div className="pagehead">
        <div>
          <p className="eyebrow">
            {trip.preference} · {trip.days} DAYS · {trip.travelers} TRAVELLER{trip.travelers > 1 ? 'S' : ''}
          </p>
          <h1>{trip.destination}</h1>
          <p>
            Starting from {trip.startLocation} · Available Budget <b>{money(trip.budget)}</b> · Estimated Plan{' '}
            <b className={isOverBudget ? 'text-danger' : ''}>{money(estimatedTotal)}</b>
          </p>
          {!isOwner && (
            <small className="role-chip">
              Shared Trip · {trip.membershipRole === 'VIEWER' || trip.membershipRole === 'EDITOR' ? 'PARTNER' : trip.membershipRole || 'PARTNER'}
            </small>
          )}
        </div>
        <div className="head-actions">
          {canEdit && (trip.undoHistory?.length || 0) > 0 && (
            <button
              type="button"
              className="secondary-btn"
              disabled={!!busy}
              onClick={() => void handleUndoLastChange()}
              title={`Undo: ${trip.undoHistory?.[trip.undoHistory.length - 1]?.label}`}
            >
              <RotateCcw size={15} /> Undo Last Change
            </button>
          )}
          {canEdit && (
            <button type="button" className="secondary-btn" onClick={() => setShowPrefsModal(true)}>
              <Sliders size={15} /> AI Preferences
            </button>
          )}
          {canEdit && (
            <button
              className="login danger-text"
              onClick={async () => {
                if (confirm('Delete this trip and its expenses?')) {
                  await tripsApi.remove(id)
                  navigate('/dashboard')
                }
              }}
            >
              <Trash2 size={16} /> Delete Trip
            </button>
          )}
        </div>
      </div>

      {busy && <p className="notice">{busy}</p>}
      {error && <p className="error">{error}</p>}

      {/* Section 4.B: Compact Travel Readiness Dashboard */}
      {readiness && (
        <section className="readiness-strip" aria-label="Travel Readiness Dashboard">
          <div className="readiness-card" onClick={() => setActiveTab('itinerary')}>
            <span className="eyebrow">ITINERARY COMPLETION</span>
            <div className="readiness-row">
              <b>{readiness.itinerary.percent}%</b>
              <small>{readiness.itinerary.label}</small>
            </div>
            <div className="mini-progress">
              <i style={{ width: `${Math.min(100, readiness.itinerary.percent)}%` }} />
            </div>
          </div>

          <div className="readiness-card" onClick={() => setActiveTab('packing')}>
            <span className="eyebrow">PACKING CHECKLIST</span>
            <div className="readiness-row">
              <b>{readiness.packing.percent}%</b>
              <small>{readiness.packing.label}</small>
            </div>
            <div className="mini-progress">
              <i style={{ width: `${Math.min(100, readiness.packing.percent)}%` }} />
            </div>
          </div>

          <div className="readiness-card">
            <span className="eyebrow">BUDGET UTILIZATION</span>
            <div className="readiness-row">
              <b className={readiness.budget.isOverBudget ? 'text-danger' : ''}>
                {readiness.budget.estimatedUtilizationPercent}%
              </b>
              <small>
                Est. {money(readiness.budget.estimatedTotal)} / {money(readiness.budget.budget)}
              </small>
            </div>
            <div className="mini-progress">
              <i
                className={readiness.budget.isOverBudget ? 'over' : ''}
                style={{ width: `${Math.min(100, readiness.budget.estimatedUtilizationPercent)}%` }}
              />
            </div>
          </div>

          <div className="readiness-card">
            <span className="eyebrow">LIVE WEATHER & ROUTE</span>
            <div className="readiness-row">
              <b>{readiness.weather.available ? 'Live' : 'Pending'}</b>
              <small>{readiness.weather.label}</small>
            </div>
            <small className="sub-readiness">Route: {readiness.route.label}</small>
          </div>

          <div className="readiness-card" onClick={() => setActiveTab('reminders')}>
            <span className="eyebrow">TRAVEL REMINDERS</span>
            <div className="readiness-row">
              <b>{upcomingReminders.length}</b>
              <small>
                {nextUpcomingReminder
                  ? `Next in ${formatCountdown(
                      !nextUpcomingReminder.alreadyNotified
                        ? nextUpcomingReminder.msUntilNotify
                        : nextUpcomingReminder.msUntilEvent
                    )}`
                  : readiness.reminders.label}
              </small>
            </div>
          </div>
        </section>
      )}

      {/* Section 3.B: Budget Warning System */}
      {isOverBudget && (
        <section className="budget-warning-banner" role="alert">
          <div className="warning-icon">
            <AlertTriangle size={22} />
          </div>
          <div className="warning-copy">
            <strong>Budget Limit Exceeded</strong>
            <p>
              Your estimated trip cost is <b>{money(estimatedTotal)}</b>. Your available budget is{' '}
              <b>{money(availableBudget)}</b>. You are exceeding your budget by <b>{money(exceededBy)}</b>.
            </p>
          </div>
          <button
            type="button"
            className="darkbtn"
            disabled={budgetOptimization?.loading}
            onClick={() => void handleRequestBudgetOptimization()}
          >
            <Wand2 size={15} />{' '}
            {budgetOptimization?.loading ? 'Analyzing costs…' : 'Get AI Cost Optimization Suggestions'}
          </button>
        </section>
      )}

      {/* Optional AI Cost Optimization Panel */}
      {budgetOptimization && !budgetOptimization.loading && (
        <section className="panel optimization-panel">
          <div className="panelhead">
            <div>
              <p className="eyebrow">AI BUDGET ADVISOR (ESTIMATED SUGGESTIONS — NO AUTOMATIC CHANGES)</p>
              <h3>{budgetOptimization.summary}</h3>
            </div>
            <button type="button" className="icon" onClick={() => setBudgetOptimization(null)} aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <div className="optimization-grid">
            {budgetOptimization.recommendations.map((rec, i) => (
              <div className="optimization-card" key={i}>
                <span className="badge">Day {rec.day}</span>
                <b>{rec.targetActivity}</b>
                <p className="cost-compare">
                  Current: <span>{money(rec.currentCost)}</span> → Suggested: <b>{money(rec.estimatedNewCost)}</b>{' '}
                  <em className="savings-pill">Save ~{money(rec.estimatedSavings)}</em>
                </p>
                <p>
                  <strong>Alternative:</strong> {rec.suggestedAlternative}
                </p>
                <small>{rec.advice}</small>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Feature Navigation Tabs */}
      <div className="feature-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'itinerary'}
          className={activeTab === 'itinerary' ? 'active' : ''}
          onClick={() => setActiveTab('itinerary')}
        >
          <Compass size={15} /> Interactive Itinerary ({trip.itinerary?.days?.length || 0} days)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'packing'}
          className={activeTab === 'packing' ? 'active' : ''}
          onClick={() => setActiveTab('packing')}
        >
          <PackageCheck size={15} /> Packing Checklist ({trip.packingChecklist?.filter((i) => i.packed).length || 0}/
          {trip.packingChecklist?.length || 0})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'reminders'}
          className={activeTab === 'reminders' ? 'active' : ''}
          onClick={() => setActiveTab('reminders')}
        >
          <Bell size={15} /> Travel Reminders & Alarms ({allReminders.length})
          {overdueReminders.length > 0 && <span className="overdue-dot">{overdueReminders.length} overdue</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'tips'}
          className={activeTab === 'tips' ? 'active' : ''}
          onClick={() => setActiveTab('tips')}
        >
          <Sparkles size={15} /> Local Travel Tips ({(trip.localTips?.length || 0) + (trip.itinerary?.tips?.length || 0)})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'notes'}
          className={activeTab === 'notes' ? 'active' : ''}
          onClick={() => setActiveTab('notes')}
        >
          <BookOpen size={15} /> Trip Notes & Journal ({trip.tripNotes?.length || 0})
        </button>
      </div>

      <div className="dashboard-grid">
        {/* LEFT MAIN COLUMN */}
        <div className="left-main">
          {activeTab === 'itinerary' && (
            <section className="panel itinerary">
              <div className="panelhead">
                <div>
                  <p className="eyebrow">INTERACTIVE AI ITINERARY (ALL COSTS ARE ESTIMATES)</p>
                  <h2>{trip.itinerary?.summary || "Your AI itinerary hasn't been generated yet."}</h2>
                  {(trip.itineraryPreferences?.excludedActivities?.length || 0) > 0 && (
                    <p className="exclusions-summary">
                      Excluded from AI:{' '}
                      {trip.itineraryPreferences?.excludedActivities?.map((ex) => (
                        <span key={ex} className="mini-chip">
                          {ex}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
                <div className="panelhead-actions">
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        className="secondary-btn"
                        disabled={!!busy}
                        onClick={() => openAddActivityModal(1)}
                      >
                        <Plus size={15} /> Add Activity
                      </button>
                      <button type="button" className="darkbtn" disabled={!!busy} onClick={generate}>
                        <Sparkles size={15} />{' '}
                        {trip.itinerary?.days?.length ? 'Regenerate AI Itinerary' : 'Generate AI Itinerary'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Section 3.C & 3.D: Travel Feasibility & Weather-Aware Warnings */}
              {(feasibilityWarnings.length > 0 || weatherAdvisories.length > 0) && (
                <div className="feasibility-box">
                  <div className="feasibility-head">
                    <strong>
                      <AlertTriangle size={15} /> Smart Feasibility & Weather Check
                    </strong>
                    <small>Advisories only — your schedule is never modified automatically</small>
                  </div>

                  {weatherAdvisories.map((wa) => (
                    <div className="advisory-item weather-advisory" key={wa.id}>
                      <div>
                        <span className="source-badge verified">
                          <CloudRain size={12} /> Verified Open-Meteo Weather · Day {wa.day}
                        </span>
                        <b>
                          Outdoor activity "{wa.activityTitle}" — {wa.conditionLabel}
                        </b>
                        <p>{wa.warningMessage}</p>
                        <div className="indoor-suggestions">
                          <span>Suggested indoor alternatives:</span>
                          <ul>
                            {wa.indoorAlternatives.map((alt, idx) => (
                              <li key={idx}>{alt}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ))}

                  {feasibilityWarnings.map((fw) => (
                    <div className={`advisory-item ${fw.severity}`} key={fw.id}>
                      <div>
                        <span className={`source-badge ${fw.sourceType === 'verified_route' ? 'verified' : 'estimated'}`}>
                          {fw.sourceType === 'verified_route' ? 'Verified OSRM Route' : 'Estimated Schedule Check'} · Day{' '}
                          {fw.day}
                        </span>
                        <b>{fw.title}</b>
                        <p>{fw.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Empty state when no days exist yet */}
              {(!trip.itinerary?.days || trip.itinerary.days.length === 0) && (
                <div className="empty-itinerary">
                  <p>
                    Generate a personalized AI itinerary with Gemini, or start building your own custom schedule day by
                    day.
                  </p>
                  {canEdit && (
                    <div className="empty-actions">
                      <button type="button" className="darkbtn" disabled={!!busy} onClick={generate}>
                        <Sparkles size={15} /> Generate AI Itinerary
                      </button>
                      <button
                        type="button"
                        className="secondary-btn"
                        disabled={!!busy}
                        onClick={() => openAddActivityModal(1)}
                      >
                        <Plus size={15} /> Add First Custom Activity
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Day-by-Day Interactive List */}
              {trip.itinerary?.days?.map((d: ItineraryDay) => {
                const dayReminders = allReminders.filter((r) => Number(r.day) === Number(d.day))
                const dayNotes = (trip.tripNotes || []).filter((n) => Number(n.day) === Number(d.day))

                return (
                  <div className="day" key={d.day} id={`day-${d.day}`}>
                    <div className="daytitle">
                      <span>DAY {d.day}</span>
                      <strong>{d.title || `Day ${d.day} Exploration`}</strong>
                      <small>{d.activities.length} activities</small>
                      <b>{money(d.estimatedDayCost)} estimated</b>
                    </div>

                    {/* Reminders for this day */}
                    {dayReminders.length > 0 && (
                      <div className="day-reminders">
                        {dayReminders.map((rem) => (
                          <label
                            key={rem.id}
                            className={`day-reminder-pill ${rem.completed ? 'done' : ''} ${!rem.enabled ? 'disabled' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={rem.completed}
                              disabled={!canEdit}
                              onChange={() => void handleToggleReminderCompleted(rem)}
                            />
                            <Bell size={12} />
                            <span>
                              <b>{rem.type}:</b> {rem.title}{' '}
                              {rem.scheduledTimeDisplay
                                ? `(${rem.date ? `${rem.date} · ` : ''}${rem.scheduledTimeDisplay})`
                                : rem.time
                                  ? `(${rem.time})`
                                  : ''}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}

                    <div className="activities">
                      {d.activities.length === 0 ? (
                        <p className="empty-day-note">No activities planned for Day {d.day} yet.</p>
                      ) : (
                        d.activities.map((a: Activity, i: number) => (
                          <div
                            className="activity-card"
                            key={a.id || i}
                            draggable={canEdit}
                            onDragStart={() => setDraggedActivity({ dayNumber: d.day, activityId: a.id })}
                            onDragOver={(ev) => ev.preventDefault()}
                            onDrop={() => void handleDropOnActivity(d.day, a.id)}
                          >
                            <div className="activity-time-col">
                              <time>{a.time || 'Flexible'}</time>
                              <span className="cat-pill">{a.category || 'Activities'}</span>
                            </div>

                            <div className="activity-main-col">
                              <div className="activity-header-line">
                                <b>{a.title}</b>
                                <span className="activity-cost">{money(a.estimatedCost)} est.</span>
                              </div>
                              {a.description && <p className="activity-desc">{a.description}</p>}
                              <div className="activity-meta-line">
                                {a.location && (
                                  <span>
                                    <MapPin size={11} /> {a.location}
                                  </span>
                                )}
                                {a.isOutdoor && <span className="outdoor-tag">Outdoor</span>}
                                {a.notes && <span className="activity-note">Note: {a.notes}</span>}
                              </div>
                            </div>

                            {canEdit && (
                              <div className="activity-actions">
                                <button
                                  type="button"
                                  className="act-btn"
                                  title="Edit activity"
                                  disabled={!!busy}
                                  onClick={() => openEditActivityModal(d.day, a)}
                                >
                                  <Edit3 size={13} /> Edit
                                </button>
                                <button
                                  type="button"
                                  className="act-btn ai-btn"
                                  title="Replace with AI Suggestion"
                                  disabled={!!busy}
                                  onClick={() => void openAiReplaceModal(d.day, a)}
                                >
                                  <Wand2 size={13} /> AI Replace
                                </button>
                                <button
                                  type="button"
                                  className="act-btn delete-btn"
                                  title="Delete activity"
                                  disabled={!!busy}
                                  onClick={() => setDeleteConfirm({ dayNumber: d.day, activity: a })}
                                >
                                  <Trash2 size={13} /> Delete
                                </button>

                                <div className="act-sub-controls">
                                  <button
                                    type="button"
                                    className="icon-mini"
                                    title="Move Up"
                                    disabled={!!busy || i === 0}
                                    onClick={() => void handleReorderActivity(d.day, a.id, 'up')}
                                    aria-label="Move activity up"
                                  >
                                    <ArrowUp size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    className="icon-mini"
                                    title="Move Down"
                                    disabled={!!busy || i === d.activities.length - 1}
                                    onClick={() => void handleReorderActivity(d.day, a.id, 'down')}
                                    aria-label="Move activity down"
                                  >
                                    <ArrowDown size={13} />
                                  </button>
                                  {totalDayChoices > 1 && (
                                    <label className="move-day-select" title="Move activity to another day">
                                      <MoveRight size={12} />
                                      <select
                                        aria-label={`Move ${a.title} to another day`}
                                        value={d.day}
                                        disabled={!!busy}
                                        onChange={(ev) => void handleMoveActivity(a, d.day, Number(ev.target.value))}
                                      >
                                        {Array.from({ length: totalDayChoices }, (_, idx) => idx + 1).map((dayNum) => (
                                          <option key={dayNum} value={dayNum}>
                                            {dayNum === d.day ? `Day ${dayNum}` : `Move → Day ${dayNum}`}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ))
                      )}

                      {/* Day Notes summary if any */}
                      {dayNotes.length > 0 && (
                        <div className="day-notes-inline">
                          {dayNotes.map((n) => (
                            <div key={n.id} className="inline-note">
                              <span className="note-tag">{n.tag}</span>
                              {n.title && <b>{n.title}: </b>}
                              <span>{n.content}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Section 2.C: Clearly visible "+ Add Activity" button inside every itinerary day */}
                      {canEdit && (
                        <div className="day-footer-actions">
                          <button
                            type="button"
                            className="addactivity"
                            disabled={!!busy}
                            onClick={() => openAddActivityModal(d.day)}
                          >
                            <Plus size={14} /> + Add Activity to Day {d.day}
                          </button>
                          <button
                            type="button"
                            className="linkbtn"
                            onClick={() => {
                              setNewNote((curr) => ({ ...curr, day: d.day }))
                              setActiveTab('notes')
                            }}
                          >
                            <BookOpen size={13} /> + Add Day {d.day} Note
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {trip.itinerary?.tips?.length ? (
                <div className="itinerary-tips-footer">
                  <h3>Quick Itinerary Tips</h3>
                  <ul>
                    {trip.itinerary.tips.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          )}

          {/* Section 4.A: Smart Packing Checklist Tab */}
          {activeTab === 'packing' && (
            <section className="panel feature-panel">
              <div className="panelhead">
                <div>
                  <p className="eyebrow">DESTINATION, WEATHER & ACTIVITY-AWARE CHECKLIST</p>
                  <h2>Smart Packing Checklist for {trip.destination}</h2>
                  <p className="muted-note">
                    General travel packing guidance based on your {trip.days}-day {trip.preference} trip
                    {trip.weather ? ` and live weather (${trip.weather.temperature}${trip.weather.unit})` : ''}. Not a
                    legal or medical guarantee—verify official visa and health requirements separately.
                  </p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    className="darkbtn"
                    disabled={!!busy}
                    onClick={() => void handleGeneratePacking()}
                  >
                    <Sparkles size={15} />{' '}
                    {trip.packingChecklist?.length ? 'Refresh Smart Checklist' : 'Generate Smart Checklist'}
                  </button>
                )}
              </div>

              {canEdit && (
                <form className="inline-add-form" onSubmit={handleAddPackingItem}>
                  <input
                    value={newPackingItem.item}
                    onChange={(e) => setNewPackingItem((curr) => ({ ...curr, item: e.target.value }))}
                    placeholder="Add custom item (e.g., Polarized sunglasses, DSLR tripod)…"
                    required
                  />
                  <select
                    value={newPackingItem.category}
                    onChange={(e) => setNewPackingItem((curr) => ({ ...curr, category: e.target.value }))}
                  >
                    <option>Documents & Money</option>
                    <option>Clothing & Footwear</option>
                    <option>Weather Protection</option>
                    <option>Electronics & Gear</option>
                    <option>Health & Toiletries</option>
                    <option>Activity-Specific</option>
                    <option>Custom</option>
                  </select>
                  <button type="submit" className="darkbtn" disabled={!!busy}>
                    <Plus size={15} /> Add Item
                  </button>
                </form>
              )}

              {!trip.packingChecklist?.length ? (
                <div className="empty-itinerary">
                  <p>No packing items yet. Generate a tailored checklist or add your own items above.</p>
                </div>
              ) : (
                <div className="packing-groups">
                  {Array.from(new Set(trip.packingChecklist.map((i) => i.category || 'Essentials'))).map((cat) => (
                    <div className="packing-group" key={cat}>
                      <h4>{cat}</h4>
                      <div className="packing-list">
                        {trip.packingChecklist
                          ?.filter((i) => (i.category || 'Essentials') === cat)
                          .map((item) => (
                            <div key={item.id} className={`packing-row ${item.packed ? 'packed' : ''}`}>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={item.packed}
                                  disabled={!canEdit}
                                  onChange={() => void handleTogglePackingItem(item)}
                                />
                                <span>{item.item}</span>
                                {item.isCustom && <small className="custom-tag">Custom</small>}
                              </label>
                              {canEdit && (
                                <button
                                  type="button"
                                  className="icon-mini danger"
                                  onClick={() => void handleDeletePackingItem(item.id)}
                                  aria-label={`Remove ${item.item}`}
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* UPGRADED TRAVEL REMINDERS & ALARM NOTIFICATION SYSTEM TAB */}
          {activeTab === 'reminders' && (
            <section className="panel feature-panel">
              <div className="panelhead">
                <div>
                  <p className="eyebrow">REAL-TIME DESKTOP NOTIFICATIONS, ALARMS & TIMEZONE SCHEDULER</p>
                  <h2>Travel Reminders & Alarm Center</h2>
                  <p className="muted-note">
                    Schedule exact reminder dates, times, and advance notifications (e.g., 2 hours before Flight
                    Departure). Notifications and alarms trigger automatically while the app is open in any active or
                    background browser tab, and delivery state is saved in MongoDB to prevent duplicates.
                  </p>
                </div>
              </div>

              {/* Section 7: Professional Notification Settings & Next Reminder Countdown Dashboard */}
              <div className="notification-settings-grid">
                {/* Card 1: Desktop Permission & Service Worker Status */}
                <div className="notif-setting-card">
                  <span className="eyebrow">1. DESKTOP NOTIFICATION PERMISSION</span>
                  <div className="perm-status-row">
                    <span
                      className={`perm-badge ${
                        notifPermission === 'granted'
                          ? 'granted'
                          : notifPermission === 'denied'
                            ? 'denied'
                            : 'default'
                      }`}
                    >
                      {notifPermission === 'granted'
                        ? '✓ Permission Granted'
                        : notifPermission === 'denied'
                          ? '✕ Blocked in Browser'
                          : notifPermission === 'unsupported'
                            ? 'Not Supported'
                            : 'Permission Required'}
                    </span>
                    <small className="sw-badge">{swActive ? 'Service Worker Active' : 'In-Tab Notifier'}</small>
                  </div>
                  <p className="setting-help">
                    {notifPermission === 'granted'
                      ? 'Desktop notifications will appear even when you are viewing another browser tab.'
                      : 'Allow browser notifications so TravelAI can alert you on your desktop.'}
                  </p>
                  <div className="setting-btn-row">
                    {notifPermission !== 'granted' && notifPermission !== 'unsupported' && (
                      <button type="button" className="darkbtn" onClick={() => void handleRequestPermission()}>
                        <BellRing size={14} /> Enable Desktop Notifications
                      </button>
                    )}
                    <button type="button" className="secondary-btn" onClick={() => void handleTestDesktopNotification()}>
                      <Bell size={14} /> Test Desktop Notification
                    </button>
                  </div>
                </div>

                {/* Card 2: Alarm Sound & Tone Settings */}
                <div className="notif-setting-card">
                  <span className="eyebrow">2. ALARM SOUND & AUDIO SETTINGS</span>
                  <div className="sound-controls-row">
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={trip.reminderSettings?.alarmSoundEnabled !== false}
                        disabled={!canEdit}
                        onChange={(e) => void handleUpdateReminderSettings({ alarmSoundEnabled: e.target.checked })}
                      />
                      <span>
                        {trip.reminderSettings?.alarmSoundEnabled !== false ? (
                          <>
                            <Volume2 size={15} /> Alarm Sound Enabled
                          </>
                        ) : (
                          <>
                            <VolumeX size={15} /> Alarm Sound Muted
                          </>
                        )}
                      </span>
                    </label>
                    <select
                      aria-label="Alarm tone"
                      value={trip.reminderSettings?.alarmTone || 'chime'}
                      disabled={!canEdit}
                      onChange={(e) =>
                        void handleUpdateReminderSettings({ alarmTone: e.target.value as AlarmTone })
                      }
                    >
                      <option value="chime">Melodic Travel Chime</option>
                      <option value="pulse">Gentle Digital Pulse</option>
                      <option value="urgent">Urgent Departure Alarm</option>
                    </select>
                  </div>
                  <div className="setting-btn-row">
                    <button type="button" className="secondary-btn" onClick={handleTestAlarmSound}>
                      <Volume2 size={14} /> Test Alarm Sound
                    </button>
                    <button type="button" className="secondary-btn" onClick={() => alarmAudio.stopAlarm()}>
                      <VolumeX size={14} /> Stop Sound
                    </button>
                  </div>
                </div>

                {/* Card 3: Default Advance & Timezone Preferences */}
                <div className="notif-setting-card">
                  <span className="eyebrow">3. ADVANCE NOTICE & TIMEZONE PREFERENCES</span>
                  <div className="tz-controls-grid">
                    <label>
                      Default Advance Time
                      <select
                        value={String(trip.reminderSettings?.defaultAdvanceMinutes ?? 15)}
                        disabled={!canEdit}
                        onChange={(e) =>
                          void handleUpdateReminderSettings({ defaultAdvanceMinutes: Number(e.target.value) })
                        }
                      >
                        <option value="0">At scheduled time</option>
                        <option value="5">5 minutes before</option>
                        <option value="15">15 minutes before</option>
                        <option value="30">30 minutes before</option>
                        <option value="60">1 hour before</option>
                        <option value="120">2 hours before</option>
                      </select>
                    </label>
                    <label>
                      Trip / Reminder Timezone
                      <select
                        value={
                          trip.reminderSettings?.tripTimezone ||
                          trip.reminderSettings?.userTimezone ||
                          detectedBrowserTz
                        }
                        disabled={!canEdit}
                        onChange={(e) =>
                          void handleUpdateReminderSettings({
                            tripTimezone: e.target.value,
                            userTimezone: detectedBrowserTz,
                          })
                        }
                      >
                        {timezoneChoices.map((tz) => (
                          <option key={tz} value={tz}>
                            {tz} {tz === detectedBrowserTz ? '(Your Local TZ)' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                {/* Card 4: Next Upcoming Reminder & Live Countdown */}
                <div className="notif-setting-card highlight-countdown">
                  <span className="eyebrow">4. NEXT UPCOMING REMINDER COUNTDOWN</span>
                  {nextUpcomingReminder ? (
                    <div className="next-reminder-box">
                      <div className="next-rem-top">
                        <span className="badge">Day {nextUpcomingReminder.day}</span>
                        <span className="cat-pill">{nextUpcomingReminder.type}</span>
                      </div>
                      <h4>{nextUpcomingReminder.title}</h4>
                      <p>
                        Event: <b>{nextUpcomingReminder.date}</b> at{' '}
                        <b>{nextUpcomingReminder.scheduledTimeDisplay || nextUpcomingReminder.time}</b> (
                        {nextUpcomingReminder.timezone})
                      </p>
                      <p>
                        Notify: <b>{nextUpcomingReminder.notifyTimeDisplay}</b> (
                        {formatAdvanceLabel(nextUpcomingReminder.advanceMinutes)})
                      </p>
                      <div className="countdown-pill">
                        <Clock size={14} />
                        <span>
                          {!nextUpcomingReminder.alreadyNotified
                            ? `Notification triggers in: ${formatCountdown(nextUpcomingReminder.msUntilNotify)}`
                            : `Notified ✓ · Event in: ${formatCountdown(nextUpcomingReminder.msUntilEvent)}`}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="setting-help">No upcoming active reminders scheduled. Add one below!</p>
                  )}
                </div>
              </div>

              {/* Section 1 & 2: Reminder Scheduling Form (Create / Edit) */}
              {canEdit && (
                <form className="reminder-form" onSubmit={handleSaveReminder}>
                  <div className="reminder-form-header">
                    <h4>{editingReminderId ? 'Edit Scheduled Reminder' : 'Schedule a New Travel Reminder'}</h4>
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={handleQuickFill2MinAhead}
                      title="Pre-fill a reminder scheduled 2 minutes from now to test live notifications"
                    >
                      <Clock size={14} /> Quick Fill: +2 Min Test Reminder
                    </button>
                  </div>

                  <div className="formrow">
                    <label>
                      Reminder Title *
                      <input
                        value={reminderForm.title}
                        onChange={(e) => setReminderForm((curr) => ({ ...curr, title: e.target.value }))}
                        placeholder="e.g., Flight Departure to Las Vegas, Hotel Check-in"
                        required
                      />
                    </label>
                    <label>
                      Reminder Type
                      <select
                        value={reminderForm.type}
                        onChange={(e) => setReminderForm((curr) => ({ ...curr, type: e.target.value }))}
                      >
                        {REMINDER_TYPES.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="formrow-4">
                    <label>
                      Trip Day
                      <select
                        value={reminderForm.day}
                        onChange={(e) => setReminderForm((curr) => ({ ...curr, day: Number(e.target.value) }))}
                      >
                        {Array.from({ length: totalDayChoices }, (_, idx) => idx + 1).map((d) => (
                          <option key={d} value={d}>
                            Day {d}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Exact Reminder Date *
                      <input
                        type="date"
                        value={reminderForm.date}
                        onChange={(e) => setReminderForm((curr) => ({ ...curr, date: e.target.value }))}
                        required
                      />
                    </label>

                    <label>
                      Exact Reminder Time *
                      <input
                        type="time"
                        value={
                          /^\d{2}:\d{2}$/.test(reminderForm.time)
                            ? reminderForm.time
                            : '19:12'
                        }
                        onChange={(e) => setReminderForm((curr) => ({ ...curr, time: e.target.value }))}
                        required
                      />
                    </label>

                    <label>
                      Timezone
                      <select
                        value={reminderForm.timezone}
                        onChange={(e) => setReminderForm((curr) => ({ ...curr, timezone: e.target.value }))}
                      >
                        {timezoneChoices.map((tz) => (
                          <option key={tz} value={tz}>
                            {tz}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="formrow">
                    <label>
                      Advance Notification Time
                      <select
                        value={reminderForm.advanceMode}
                        onChange={(e) => {
                          const mode = e.target.value
                          const found = ADVANCE_OPTIONS.find((o) => o.mode === mode)
                          setReminderForm((curr) => ({
                            ...curr,
                            advanceMode: mode,
                            advanceMinutes: mode === 'custom' ? curr.advanceMinutes || 45 : found?.minutes ?? 0,
                          }))
                        }}
                      >
                        {ADVANCE_OPTIONS.map((opt) => (
                          <option key={opt.mode} value={opt.mode}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    {reminderForm.advanceMode === 'custom' ? (
                      <label>
                        Custom Advance Time (minutes before)
                        <input
                          type="number"
                          min="0"
                          max="10080"
                          value={reminderForm.advanceMinutes}
                          onChange={(e) =>
                            setReminderForm((curr) => ({
                              ...curr,
                              advanceMinutes: Math.max(0, Number(e.target.value) || 0),
                            }))
                          }
                          required
                        />
                      </label>
                    ) : (
                      <label>
                        Optional Notes
                        <input
                          value={reminderForm.notes}
                          onChange={(e) => setReminderForm((curr) => ({ ...curr, notes: e.target.value }))}
                          placeholder="e.g., Terminal 2 Gate B4 · Carry printed passport & visa"
                        />
                      </label>
                    )}
                  </div>

                  {reminderForm.advanceMode === 'custom' && (
                    <label>
                      Optional Notes
                      <input
                        value={reminderForm.notes}
                        onChange={(e) => setReminderForm((curr) => ({ ...curr, notes: e.target.value }))}
                        placeholder="e.g., Terminal 2 Gate B4 · Carry printed passport & visa"
                      />
                    </label>
                  )}

                  {/* Live Schedule Preview Banner (Example: Scheduled 07:12 PM · Notify 2 hours before -> Expected notification: 05:12 PM) */}
                  {previewSchedule && (
                    <div className="schedule-preview-bar">
                      <Clock size={15} />
                      <span>
                        Scheduled time: <b>{previewSchedule.scheduled12}</b> ({reminderForm.date} ·{' '}
                        {reminderForm.timezone}) · Notify: <b>{formatAdvanceLabel(reminderForm.advanceMinutes)}</b> →{' '}
                        Expected notification: <b>{previewSchedule.notify12}</b>
                      </span>
                    </div>
                  )}

                  <div className="reminder-toggles-row">
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={reminderForm.enabled}
                        onChange={(e) => setReminderForm((curr) => ({ ...curr, enabled: e.target.checked }))}
                      />
                      <span>Reminder Enabled</span>
                    </label>
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={reminderForm.alarmSound}
                        onChange={(e) => setReminderForm((curr) => ({ ...curr, alarmSound: e.target.checked }))}
                      />
                      <span>Play Alarm Sound When Triggered</span>
                    </label>

                    <div className="form-btn-row" style={{ marginLeft: 'auto' }}>
                      {editingReminderId && (
                        <button type="button" className="secondary-btn" onClick={resetReminderForm}>
                          Cancel Edit
                        </button>
                      )}
                      <button type="submit" className="darkbtn" disabled={!!busy}>
                        <Plus size={15} /> {editingReminderId ? 'Save Reminder Changes' : 'Schedule Travel Reminder'}
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* Section 5: Overdue Reminders List */}
              {overdueReminders.length > 0 && (
                <div className="reminder-section-group">
                  <h3 className="section-subhead overdue-head">
                    <AlertTriangle size={16} /> Overdue Reminders ({overdueReminders.length})
                  </h3>
                  <div className="reminders-list">
                    {overdueReminders.map((rem) => (
                      <div key={rem.id} className="reminder-card overdue">
                        <input
                          type="checkbox"
                          checked={rem.completed}
                          disabled={!canEdit}
                          onChange={() => void handleToggleReminderCompleted(rem)}
                          title="Mark as completed"
                        />
                        <div className="reminder-body">
                          <div className="reminder-meta">
                            <span className="badge">Day {rem.day}</span>
                            <span className="cat-pill">{rem.type}</span>
                            <span className="status-tag overdue-tag">Overdue</span>
                            <time>
                              {rem.date} · {rem.scheduledTimeDisplay || rem.time} ({rem.timezone})
                            </time>
                          </div>
                          <b>{rem.title}</b>
                          <small>
                            Notification was scheduled for <b>{rem.notifyTimeDisplay}</b> (
                            {formatAdvanceLabel(rem.advanceMinutes)})
                            {rem.notifiedAt ? ` · Delivered at ${new Date(rem.notifiedAt).toLocaleTimeString()}` : ''}
                          </small>
                          {rem.notes && <small className="rem-note">Note: {rem.notes}</small>}
                        </div>
                        {canEdit && (
                          <div className="reminder-card-actions">
                            <button
                              type="button"
                              className="icon-mini"
                              title="Edit reminder"
                              onClick={() => handleStartEditReminder(rem)}
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              type="button"
                              className="icon-mini"
                              title={rem.enabled ? 'Disable reminder' : 'Enable reminder'}
                              onClick={() => void handleToggleReminderEnabled(rem)}
                            >
                              {rem.enabled ? <Bell size={14} /> : <BellOff size={14} />}
                            </button>
                            <button
                              type="button"
                              className="icon-mini danger"
                              title="Delete reminder"
                              onClick={() => void handleDeleteReminder(rem.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Section 5: Upcoming Reminders List */}
              <div className="reminder-section-group">
                <h3 className="section-subhead">
                  <Clock size={16} /> Upcoming Reminders ({upcomingReminders.length})
                </h3>
                {upcomingReminders.length === 0 ? (
                  <div className="empty-itinerary">
                    <p>No upcoming active reminders. Use the form above to schedule a reminder.</p>
                  </div>
                ) : (
                  <div className="reminders-list">
                    {upcomingReminders.map((rem) => (
                      <div key={rem.id} className="reminder-card upcoming">
                        <input
                          type="checkbox"
                          checked={rem.completed}
                          disabled={!canEdit}
                          onChange={() => void handleToggleReminderCompleted(rem)}
                          title="Mark as completed"
                        />
                        <div className="reminder-body">
                          <div className="reminder-meta">
                            <span className="badge">Day {rem.day}</span>
                            <span className="cat-pill">{rem.type}</span>
                            <time>
                              <Globe size={11} /> {rem.date} · Scheduled <b>{rem.scheduledTimeDisplay || rem.time}</b> (
                              {rem.timezone})
                            </time>
                            <span className="countdown-chip">
                              {!rem.alreadyNotified
                                ? `Notify in ${formatCountdown(rem.msUntilNotify)}`
                                : `Notified ✓ · Event in ${formatCountdown(rem.msUntilEvent)}`}
                            </span>
                          </div>
                          <b>{rem.title}</b>
                          <small>
                            Expected notification: <b>{rem.notifyTimeDisplay}</b> (
                            {formatAdvanceLabel(rem.advanceMinutes)})
                            {rem.alarmSound !== false ? ' · 🔔 Alarm sound on' : ' · 🔕 Silent'}
                          </small>
                          {rem.notes && <small className="rem-note">Note: {rem.notes}</small>}
                        </div>
                        {canEdit && (
                          <div className="reminder-card-actions">
                            <button
                              type="button"
                              className="icon-mini"
                              title="Edit reminder"
                              onClick={() => handleStartEditReminder(rem)}
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              type="button"
                              className="icon-mini"
                              title={rem.enabled ? 'Disable reminder' : 'Enable reminder'}
                              onClick={() => void handleToggleReminderEnabled(rem)}
                            >
                              {rem.enabled ? <Bell size={14} /> : <BellOff size={14} />}
                            </button>
                            <button
                              type="button"
                              className="icon-mini danger"
                              title="Delete reminder"
                              onClick={() => void handleDeleteReminder(rem.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 5: Disabled & Completed Reminders List */}
              {inactiveReminders.length > 0 && (
                <div className="reminder-section-group">
                  <h3 className="section-subhead muted-head">
                    Completed & Disabled Reminders ({inactiveReminders.length})
                  </h3>
                  <div className="reminders-list">
                    {inactiveReminders.map((rem) => (
                      <div key={rem.id} className={`reminder-card ${rem.completed ? 'done' : 'disabled-card'}`}>
                        <input
                          type="checkbox"
                          checked={rem.completed}
                          disabled={!canEdit}
                          onChange={() => void handleToggleReminderCompleted(rem)}
                        />
                        <div className="reminder-body">
                          <div className="reminder-meta">
                            <span className="badge">Day {rem.day}</span>
                            <span className="cat-pill">{rem.type}</span>
                            <span className="status-tag">
                              {rem.completed ? 'Completed' : 'Disabled (Will not trigger)'}
                            </span>
                            <time>
                              {rem.date} · {rem.scheduledTimeDisplay || rem.time}
                            </time>
                          </div>
                          <b>{rem.title}</b>
                        </div>
                        {canEdit && (
                          <div className="reminder-card-actions">
                            <button
                              type="button"
                              className="icon-mini"
                              title="Edit reminder"
                              onClick={() => handleStartEditReminder(rem)}
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              type="button"
                              className="icon-mini"
                              title={rem.enabled ? 'Disable reminder' : 'Enable reminder'}
                              onClick={() => void handleToggleReminderEnabled(rem)}
                            >
                              {rem.enabled ? <Bell size={14} /> : <BellOff size={14} />}
                            </button>
                            <button
                              type="button"
                              className="icon-mini danger"
                              title="Delete reminder"
                              onClick={() => void handleDeleteReminder(rem.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Section 7: Notification Delivery History */}
              <div className="reminder-section-group history-group">
                <div className="history-head">
                  <h3 className="section-subhead">
                    <History size={16} /> Notification Delivery History ({trip.notificationHistory?.length || 0})
                  </h3>
                  {canEdit && (trip.notificationHistory?.length || 0) > 0 && (
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => void handleClearNotificationHistory()}
                    >
                      Clear History
                    </button>
                  )}
                </div>
                {!trip.notificationHistory?.length ? (
                  <p className="muted-note">
                    No notifications delivered yet. When a scheduled reminder triggers, its delivery timestamp and
                    channel are logged here and persisted in MongoDB.
                  </p>
                ) : (
                  <div className="history-list">
                    {trip.notificationHistory.map((h) => (
                      <div className="history-row" key={h.id}>
                        <div>
                          <b>
                            Day {h.day} · {h.type}: {h.title}
                          </b>
                          <small>
                            Scheduled {h.date} at {h.scheduledTimeDisplay} ({formatAdvanceLabel(h.advanceMinutes)}) ·
                            Channel: <code>{h.channel}</code>
                          </small>
                        </div>
                        <div className="history-timestamps">
                          <span>Delivered: {new Date(h.deliveredAt).toLocaleString()}</span>
                          {h.dismissedAt && (
                            <small>Dismissed: {new Date(h.dismissedAt).toLocaleTimeString()}</small>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Section 4.D: Local Travel Tips Tab */}
          {activeTab === 'tips' && (
            <section className="panel feature-panel">
              <div className="panelhead">
                <div>
                  <p className="eyebrow">AI-GENERATED DESTINATION GUIDANCE (VERIFY CRITICAL LOCAL RULES)</p>
                  <h2>Local Travel Tips for {trip.destination}</h2>
                  <p className="muted-note">
                    Covers local transportation, common tourist mistakes, customs & etiquette, safety precautions,
                    currency, useful phrases, and best times to visit attractions.
                  </p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    className="darkbtn"
                    disabled={!!busy}
                    onClick={() => void handleGenerateLocalTips()}
                  >
                    <Sparkles size={15} />{' '}
                    {trip.localTips?.length ? 'Refresh Local Tips' : 'Generate Destination Tips'}
                  </button>
                )}
              </div>

              {!trip.localTips?.length && !trip.itinerary?.tips?.length ? (
                <div className="empty-itinerary">
                  <p>Click "Generate Destination Tips" to load structured local advice for {trip.destination}.</p>
                </div>
              ) : (
                <>
                  {trip.localTips && trip.localTips.length > 0 && (
                    <div className="tips-grid">
                      {trip.localTips.map((tip, idx) => (
                        <div className="tip-card" key={idx}>
                          <span className="eyebrow">{tip.category}</span>
                          <h4>{tip.title}</h4>
                          <p>{tip.advice}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {trip.itinerary?.tips && trip.itinerary.tips.length > 0 && (
                    <div className="itinerary-tips-footer">
                      <h3>General Itinerary Tips</h3>
                      <ul>
                        {trip.itinerary.tips.map((t, idx) => (
                          <li key={idx}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* Section 4.E: Trip Notes & Journal Tab */}
          {activeTab === 'notes' && (
            <section className="panel feature-panel">
              <div className="panelhead">
                <div>
                  <p className="eyebrow">PERSONAL DAY-BY-DAY NOTES & MEMORIES</p>
                  <h2>Trip Notes & Travel Journal</h2>
                </div>
              </div>

              {canEdit && (
                <form className="reminder-form" onSubmit={handleSaveNote}>
                  <div className="formrow">
                    <label>
                      Trip Day
                      <select
                        value={newNote.day}
                        onChange={(e) => setNewNote((curr) => ({ ...curr, day: Number(e.target.value) }))}
                      >
                        {Array.from({ length: totalDayChoices }, (_, idx) => idx + 1).map((d) => (
                          <option key={d} value={d}>
                            Day {d}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Category Tag
                      <select
                        value={newNote.tag}
                        onChange={(e) => setNewNote((curr) => ({ ...curr, tag: e.target.value }))}
                      >
                        {NOTE_TAGS.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Headline / Place (optional)
                      <input
                        value={newNote.title}
                        onChange={(e) => setNewNote((curr) => ({ ...curr, title: e.target.value }))}
                        placeholder="e.g., Sunset Café by the River"
                      />
                    </label>
                  </div>
                  <label>
                    Note or Travel Memory
                    <textarea
                      rows={3}
                      value={newNote.content}
                      onChange={(e) => setNewNote((curr) => ({ ...curr, content: e.target.value }))}
                      placeholder="Write personal reminders, places to revisit, important contacts, or travel memories…"
                      required
                    />
                  </label>
                  <div className="form-btn-row">
                    <button type="submit" className="darkbtn" disabled={!!busy}>
                      <Plus size={15} /> {editingNoteId ? 'Update Note' : 'Save Note to MongoDB'}
                    </button>
                    {editingNoteId && (
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => {
                          setEditingNoteId(null)
                          setNewNote({ day: 1, tag: 'Personal note', title: '', content: '' })
                        }}
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>
                </form>
              )}

              {!trip.tripNotes?.length ? (
                <div className="empty-itinerary">
                  <p>No journal notes saved yet. Add personal notes, important information, or places to revisit.</p>
                </div>
              ) : (
                <div className="notes-list">
                  {[...trip.tripNotes]
                    .sort((a, b) => a.day - b.day)
                    .map((n) => (
                      <div className="note-card" key={n.id}>
                        <div className="note-card-head">
                          <span className="badge">Day {n.day}</span>
                          <span className="cat-pill">{n.tag}</span>
                          {n.title && <strong>{n.title}</strong>}
                          {canEdit && (
                            <div className="note-actions">
                              <button
                                type="button"
                                className="icon-mini"
                                onClick={() => {
                                  setEditingNoteId(n.id)
                                  setNewNote({
                                    day: n.day,
                                    tag: n.tag,
                                    title: n.title || '',
                                    content: n.content,
                                  })
                                }}
                              >
                                <Edit3 size={13} />
                              </button>
                              <button
                                type="button"
                                className="icon-mini danger"
                                onClick={() => void handleDeleteNote(n.id)}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                        <p>{n.content}</p>
                      </div>
                    ))}
                </div>
              )}
            </section>
          )}
        </div>

        {/* RIGHT SIDEBAR COLUMN */}
        <aside className="rightcol">
          {/* Section 3.A: Automatic Budget Recalculation & Actual Expenses Summary */}
          <section className="budgetcard">
            <p className="eyebrow">ESTIMATED BUDGET VS. ACTUAL EXPENSES</p>
            {categories.map(([label, key]) => {
              const estimated = Number(breakdown[key] || 0)
              const categorySpent = expenses
                .filter((expense) => expense.category === label)
                .reduce((total, expense) => total + Number(expense.amount || 0), 0)
              return (
                <p key={key}>
                  <span>{label}:</span>
                  <b>{money(estimated)}</b>
                  <small>
                    Spent {money(categorySpent)} · Diff {money(estimated - categorySpent)}
                  </small>
                </p>
              )
            })}
            <hr />
            <p>
              <span>Total trip budget:</span>
              <b>{money(availableBudget)}</b>
            </p>
            <p>
              <span>Estimated itinerary total:</span>
              <b className={isOverBudget ? 'warning-highlight' : ''}>{money(estimatedTotal)}</b>
            </p>
            <p>
              <span>{isOverBudget ? 'Exceeding budget by:' : 'Planned remaining budget:'}</span>
              <b className={isOverBudget ? 'warning-highlight' : ''}>
                {isOverBudget ? money(exceededBy) : money(plannedRemaining)}
              </b>
            </p>
            <hr />
            <p>
              <span>Actual expenses recorded:</span>
              <b>{money(spent)}</b>
            </p>
            <p>
              <span>Remaining budget (vs. actual):</span>
              <b>{money(availableBudget - spent)}</b>
            </p>
          </section>

          {partners.length > 0 && (
            <section className="panel split-budget">
              <p className="eyebrow">SPLIT BUDGET</p>
              <p>
                Total budget <b>{money(trip.budget)}</b>
              </p>
              <p>
                Equal share <b>{money(equalShare)}</b>
              </p>
              {people.map((person) => {
                const personSpent = memberSpent(person.id)
                return (
                  <p key={person.email}>
                    <span>
                      {person.name}
                      <small>{person.email}</small>
                      <small>
                        Spent {money(personSpent)} · Remaining {money(equalShare - personSpent)}
                      </small>
                    </span>
                    <b>{money(equalShare)}</b>
                  </p>
                )
              })}
            </section>
          )}

          <section className="panel data-card">
            <h3>Actual Expenses</h3>
            <small className="muted-note">
              Actual expenses are tracked separately and are never overwritten when estimated itinerary costs change.
            </small>
            {expenses.length ? (
              <div className="expenses-list">
                {expenses.map((expense) => (
                  <div className="expense-item" key={expense._id}>
                    <div>
                      <b>{expense.title}</b>
                      <small>
                        {expense.category} — {money(expense.amount)}
                      </small>
                    </div>
                    {canEdit && (
                      <div className="expense-actions">
                        <button type="button" onClick={() => void editExpense(expense)} disabled={!!busy}>
                          Edit
                        </button>
                        <button type="button" onClick={() => void removeExpense(expense)} disabled={!!busy}>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p>No actual expenses added yet.</p>
            )}
            <form onSubmit={addExpense}>
              <input name="title" required placeholder="Expense title" />
              <input name="amount" type="number" min="1" required placeholder="Amount (INR)" />
              <select name="category">
                <option>Food</option>
                <option>Transportation</option>
                <option>Accommodation</option>
                <option>Activities</option>
                <option>Local Transport</option>
                <option>Shopping</option>
                <option>Miscellaneous</option>
              </select>
              <button disabled={!!busy}>Add expense</button>
            </form>
          </section>
        </aside>
      </div>

      {/* MODAL 1: Add / Edit Activity Modal */}
      {activityModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="activity-modal-title">
          <div className="modal-card">
            <div className="modal-head">
              <div>
                <p className="eyebrow">
                  {activityModal.mode === 'add' ? 'ADD CUSTOM ACTIVITY' : `EDIT ACTIVITY · DAY ${activityModal.dayNumber}`}
                </p>
                <h3 id="activity-modal-title">
                  {activityModal.mode === 'add' ? `Add Activity to Day ${actForm.day}` : 'Edit Activity Details'}
                </h3>
              </div>
              <button type="button" className="icon" onClick={() => setActivityModal(null)} aria-label="Close modal">
                <X size={18} />
              </button>
            </div>

            {activityModal.mode === 'add' && (
              <div className="preset-bar">
                <small>Quick ideas:</small>
                <div className="preset-chips">
                  {QUICK_ACTIVITY_PRESETS.map((p) => (
                    <button key={p.title} type="button" onClick={() => applyPresetToActForm(p)}>
                      + {p.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form className="modal-form" onSubmit={handleSaveActivityModal}>
              <label>
                Activity Title *
                <input
                  value={actForm.title}
                  onChange={(e) => setActForm((curr) => ({ ...curr, title: e.target.value }))}
                  required
                  placeholder="e.g., Grand Canyon Sunset Photography Walk"
                />
              </label>

              <div className="formrow">
                <label>
                  Trip Day
                  <select
                    value={actForm.day}
                    onChange={(e) => setActForm((curr) => ({ ...curr, day: Number(e.target.value) }))}
                  >
                    {Array.from({ length: totalDayChoices }, (_, idx) => idx + 1).map((d) => (
                      <option key={d} value={d}>
                        Day {d}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Start Time
                  <input
                    value={actForm.time}
                    onChange={(e) => setActForm((curr) => ({ ...curr, time: e.target.value }))}
                    placeholder="e.g., 09:30 AM"
                  />
                </label>
              </div>

              <div className="formrow">
                <label>
                  Estimated Cost (INR)
                  <input
                    type="number"
                    min="0"
                    value={actForm.estimatedCost}
                    onChange={(e) => setActForm((curr) => ({ ...curr, estimatedCost: Number(e.target.value) }))}
                    required
                  />
                </label>
                <label>
                  Activity Category
                  <select
                    value={actForm.category}
                    onChange={(e) => setActForm((curr) => ({ ...curr, category: e.target.value }))}
                  >
                    {ACTIVITY_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label>
                Location
                <input
                  value={actForm.location}
                  onChange={(e) => setActForm((curr) => ({ ...curr, location: e.target.value }))}
                  placeholder={`Neighborhood or landmark in ${trip.destination}`}
                />
              </label>

              <label>
                Description
                <textarea
                  rows={3}
                  value={actForm.description}
                  onChange={(e) => setActForm((curr) => ({ ...curr, description: e.target.value }))}
                  placeholder="What will you do or see during this activity?"
                />
              </label>

              <label>
                Additional Notes
                <input
                  value={actForm.notes}
                  onChange={(e) => setActForm((curr) => ({ ...curr, notes: e.target.value }))}
                  placeholder="Optional tips, dress code, or timing reminders"
                />
              </label>

              <div className="modal-actions">
                <button type="button" className="secondary-btn" onClick={() => setActivityModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="darkbtn" disabled={!!busy}>
                  {activityModal.mode === 'add' ? 'Add Activity' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Delete Activity Confirmation Dialog */}
      {deleteConfirm && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
          <div className="modal-card compact">
            <div className="modal-head">
              <div>
                <p className="eyebrow">CONFIRM ACTIVITY REMOVAL</p>
                <h3 id="delete-modal-title">Delete "{deleteConfirm.activity.title}"?</h3>
              </div>
              <button type="button" className="icon" onClick={() => setDeleteConfirm(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body-copy">
              <p>
                This will permanently remove <b>{deleteConfirm.activity.title}</b> (Estimated{' '}
                <b>{money(deleteConfirm.activity.estimatedCost)}</b>) from <b>Day {deleteConfirm.dayNumber}</b>.
              </p>
              <ul>
                <li>All other activities in Day {deleteConfirm.dayNumber} will remain unchanged.</li>
                <li>Day {deleteConfirm.dayNumber} and total estimated trip budget will update automatically.</li>
                <li>Your complete itinerary will NOT be regenerated.</li>
              </ul>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="darkbtn danger-btn"
                disabled={!!busy}
                onClick={() => void handleConfirmDeleteActivity()}
              >
                <Trash2 size={15} /> Confirm Delete Activity
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Replace Activity with AI Suggestion Modal */}
      {aiReplaceModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="ai-replace-title">
          <div className="modal-card wide">
            <div className="modal-head">
              <div>
                <p className="eyebrow">REPLACE SINGLE ACTIVITY WITH AI SUGGESTION · DAY {aiReplaceModal.dayNumber}</p>
                <h3 id="ai-replace-title">Alternatives for "{aiReplaceModal.activity.title}"</h3>
                <small>
                  Original: {aiReplaceModal.activity.time || 'Flexible'} · Estimated{' '}
                  {money(aiReplaceModal.activity.estimatedCost)}
                </small>
              </div>
              <button type="button" className="icon" onClick={() => setAiReplaceModal(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="ai-reason-bar">
              <input
                value={aiReplaceModal.userReason}
                onChange={(e) =>
                  setAiReplaceModal((curr) => (curr ? { ...curr, userReason: e.target.value } : null))
                }
                placeholder="Optional preference (e.g., Prefer scenic sunset photography, indoor museum, or lower cost)…"
              />
              <button
                type="button"
                className="secondary-btn"
                disabled={aiReplaceModal.loading}
                onClick={() => void refreshAiAlternatives()}
              >
                <Sparkles size={14} /> {aiReplaceModal.loading ? 'Thinking…' : 'Refresh Suggestions'}
              </button>
            </div>

            {aiReplaceModal.loading ? (
              <div className="modal-loading">
                <p>Generating tailored alternatives for Day {aiReplaceModal.dayNumber} in {trip.destination}…</p>
              </div>
            ) : (
              <div className="alternatives-grid">
                {aiReplaceModal.alternatives.map((alt, idx) => {
                  const diff = Number(alt.estimatedCost || 0) - Number(aiReplaceModal.activity.estimatedCost || 0)
                  const selected = aiReplaceModal.selectedIdx === idx
                  return (
                    <div
                      key={alt.id || idx}
                      className={`alternative-card ${selected ? 'selected' : ''}`}
                      onClick={() =>
                        setAiReplaceModal((curr) => (curr ? { ...curr, selectedIdx: idx } : null))
                      }
                    >
                      <div className="alt-head">
                        <span className="cat-pill">{alt.category || 'Activities'}</span>
                        <b>{money(alt.estimatedCost)} est.</b>
                      </div>
                      <h4>{alt.title}</h4>
                      <p>{alt.description}</p>
                      <small className="alt-why">
                        <Sparkles size={12} /> {alt.whySuitable || 'Tailored to your destination and budget'}
                      </small>
                      <div className="alt-foot">
                        <span>
                          <MapPin size={11} /> {alt.location || trip.destination}
                        </span>
                        <span className={diff <= 0 ? 'savings-pill' : 'cost-up'}>
                          {diff <= 0 ? `Saves ${money(Math.abs(diff))}` : `+${money(diff)}`}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setAiReplaceModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="darkbtn"
                disabled={aiReplaceModal.loading || !aiReplaceModal.alternatives[aiReplaceModal.selectedIdx]}
                onClick={() => void confirmAiReplacement()}
              >
                <CheckCircle2 size={15} /> Replace with Selected Alternative
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: AI Itinerary Preferences & Exclusions Modal */}
      {showPrefsModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="prefs-modal-title">
          <div className="modal-card">
            <div className="modal-head">
              <div>
                <p className="eyebrow">CUSTOMIZE FUTURE AI RECOMMENDATIONS</p>
                <h3 id="prefs-modal-title">AI Itinerary Preferences & Exclusions</h3>
              </div>
              <button type="button" className="icon" onClick={() => setShowPrefsModal(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <form className="modal-form" onSubmit={handleSavePreferences}>
              <div>
                <label>Exclude Specific Activities or Categories from AI Suggestions</label>
                <div className="exclusion-chips">
                  {COMMON_EXCLUSIONS.map((item) => {
                    const active = prefsForm.excludedActivities.includes(item)
                    return (
                      <button
                        type="button"
                        key={item}
                        className={`chip-toggle ${active ? 'active' : ''}`}
                        onClick={() => toggleExclusionChip(item)}
                      >
                        {active ? '✕ ' : '+ '}
                        {item}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="inline-add-form">
                <input
                  value={prefsForm.customExclusion}
                  onChange={(e) => setPrefsForm((curr) => ({ ...curr, customExclusion: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addCustomExclusion()
                    }
                  }}
                  placeholder="Add custom exclusion (e.g., Bungee jumping, Casinos)…"
                />
                <button type="button" className="secondary-btn" onClick={addCustomExclusion}>
                  Add Exclusion
                </button>
              </div>

              {prefsForm.excludedActivities.length > 0 && (
                <div className="active-exclusions">
                  <small>Currently excluded:</small>
                  <div className="partner-chips">
                    {prefsForm.excludedActivities.map((ex) => (
                      <span key={ex}>
                        {ex}
                        <button type="button" onClick={() => toggleExclusionChip(ex)}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <label>
                Preferred Daily Pace
                <select
                  value={prefsForm.pace}
                  onChange={(e) =>
                    setPrefsForm((curr) => ({
                      ...curr,
                      pace: e.target.value as 'Relaxed' | 'Balanced' | 'Packed',
                    }))
                  }
                >
                  <option value="Relaxed">Relaxed (3 easy-paced activities/day)</option>
                  <option value="Balanced">Balanced (3–4 well-rounded activities/day)</option>
                  <option value="Packed">Packed (4–5 energetic activities/day)</option>
                </select>
              </label>

              <label>
                Additional Dietary, Accessibility, or Interest Notes
                <input
                  value={prefsForm.customNotes}
                  onChange={(e) => setPrefsForm((curr) => ({ ...curr, customNotes: e.target.value }))}
                  placeholder="e.g., Vegetarian food preferred, avoid steep hiking trails"
                />
              </label>

              <div className="modal-actions">
                <button type="button" className="secondary-btn" onClick={() => setShowPrefsModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="darkbtn" disabled={!!busy}>
                  Save Preferences
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </section>
  )
}

function App() {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const token = localStorage.getItem('travelai_token')
      const cached = localStorage.getItem('travelai_user')
      if (token && cached) return JSON.parse(cached) as User
    } catch {
      // ignore corrupted storage
    }
    return null
  })
  const [authLoading, setAuthLoading] = useState<boolean>(() => Boolean(localStorage.getItem('travelai_token')))
  const [darkMode, setDarkMode] = useState<boolean>(() => localStorage.getItem('travelai_theme') === 'dark')

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
    localStorage.setItem('travelai_theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  const onAuth = (u: User, t: string) => {
    localStorage.setItem('travelai_token', t)
    localStorage.setItem('travelai_user', JSON.stringify(u))
    setUser(u)
    setAuthLoading(false)
  }
  const logout = () => {
    void authApi.logout().catch(() => {})
    localStorage.removeItem('travelai_token')
    localStorage.removeItem('travelai_user')
    setUser(null)
    setAuthLoading(false)
  }

  useEffect(() => {
    void registerReminderServiceWorker()
    authApi
      .me()
      .then((r) => {
        setUser(r.data.user)
        localStorage.setItem('travelai_user', JSON.stringify(r.data.user))
      })
      .catch((err) => {
        if (err?.response?.status === 401) {
          localStorage.removeItem('travelai_token')
          localStorage.removeItem('travelai_user')
          setUser(null)
        }
      })
      .finally(() => {
        setAuthLoading(false)
      })
  }, [])

  const protectedPage = (page: React.ReactNode) => {
    if (user) {
      return (
        <Layout user={user} onLogout={logout} darkMode={darkMode} onToggleDark={() => setDarkMode((d) => !d)}>
          {page}
        </Layout>
      )
    }
    if (authLoading) {
      return <section className="content">Restoring your session…</section>
    }
    return <Navigate to="/login" replace />
  }

  return (
    <Routes>
      <Route path="/" element={authLoading && !user ? <section className="content">Loading…</section> : <Navigate to={user ? '/dashboard' : '/login'} replace />} />
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Auth onAuth={onAuth} />} />
      <Route path="/register" element={user ? <Navigate to="/dashboard" /> : <Auth register onAuth={onAuth} />} />
      <Route path="/dashboard" element={protectedPage(<Dashboard />)} />
      <Route path="/trips/new" element={protectedPage(<TripForm user={user as User} />)} />
      <Route path="/trips/:id" element={protectedPage(<TripDetail user={user as User} />)} />
    </Routes>
  )
}

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
