const mongoose = require('mongoose')
const { z } = require('zod')
const Trip = require('../models/Trip')
const User = require('../models/User')
const TripMember = require('../models/TripMember')
const Expense = require('../models/Expense')
const Itinerary = require('../models/Itinerary')
const asyncHandler = require('../utils/asyncHandler')
const { calculateBudget, normalizeAndRecalculateTrip } = require('../utils/budgetCalculator')
const { normalizeActivity } = require('../services/ai.service')
const {
  evaluateItineraryFeasibility,
  generateSmartPackingChecklist,
  calculateTravelReadiness,
} = require('../services/feasibility.service')
const {
  computeReminderSchedule,
  evaluateTripReminders,
  normalizeTimeZone,
} = require('../services/reminderScheduler.service')

const tripSchema = z.object({
  destination: z.string().trim().min(2).max(200),
  startLocation: z.string().trim().min(2).max(200),
  days: z.coerce.number().int().min(1).max(30),
  travelers: z.coerce.number().int().min(1).max(20),
  budget: z.coerce.number().finite().nonnegative(),
  preference: z.enum(['Adventure', 'Relaxation', 'Family', 'Couple', 'Luxury', 'Budget', 'Nature', 'Culture', 'Food', 'Mixed']),
  travelDates: z.object({ start: z.coerce.date().optional(), end: z.coerce.date().optional() }).optional(),
  partnerEmails: z.array(z.string().trim().email().max(254)).max(50).optional().default([]),
})

const activityInputSchema = z.object({
  day: z.coerce.number().int().min(1).max(30).optional(),
  title: z.string().trim().min(1, 'Activity title is required').max(200),
  description: z.string().trim().max(1000).optional().default(''),
  time: z.string().trim().max(30).optional().default(''),
  estimatedCost: z.coerce.number().finite().min(0).optional().default(0),
  category: z.string().trim().max(60).optional().default('Activities'),
  location: z.string().trim().max(200).optional().default(''),
  notes: z.string().trim().max(1000).optional().default(''),
  durationMinutes: z.coerce.number().int().min(5).max(1440).optional().default(90),
  isOutdoor: z.boolean().optional(),
})

const activityUpdateSchema = z.object({
  day: z.coerce.number().int().min(1).max(30).optional(),
  title: z.string().trim().min(1, 'Activity title is required').max(200).optional(),
  description: z.string().trim().max(1000).optional(),
  time: z.string().trim().max(30).optional(),
  estimatedCost: z.coerce.number().finite().min(0).optional(),
  category: z.string().trim().max(60).optional(),
  location: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
  durationMinutes: z.coerce.number().int().min(5).max(1440).optional(),
  isOutdoor: z.boolean().optional(),
})

const preferencesSchema = z.object({
  excludedActivities: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  excludedCategories: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  pace: z.enum(['Relaxed', 'Balanced', 'Packed']).optional(),
  customNotes: z.string().trim().max(500).optional(),
})

const packingItemInputSchema = z.object({
  item: z.string().trim().min(1).max(150),
  category: z.string().trim().max(60).optional().default('Essentials'),
})

const reminderInputSchema = z.object({
  day: z.coerce.number().int().min(1).max(30).optional().default(1),
  date: z.string().trim().max(20).optional().default(''),
  time: z.string().trim().max(30).optional().default('09:00'),
  timezone: z.string().trim().max(80).optional(),
  advanceMinutes: z.coerce.number().int().min(0).max(10080).optional().default(0),
  advanceMode: z.string().trim().max(20).optional().default('0'),
  title: z.string().trim().min(1).max(200),
  type: z.string().trim().max(60).optional().default('General'),
  notes: z.string().trim().max(500).optional().default(''),
  enabled: z.boolean().optional().default(true),
  completed: z.boolean().optional().default(false),
  alarmSound: z.boolean().optional().default(true),
  clientNowMs: z.coerce.number().optional(),
})

const reminderUpdateSchema = z.object({
  day: z.coerce.number().int().min(1).max(30).optional(),
  date: z.string().trim().max(20).optional(),
  time: z.string().trim().max(30).optional(),
  timezone: z.string().trim().max(80).optional(),
  advanceMinutes: z.coerce.number().int().min(0).max(10080).optional(),
  advanceMode: z.string().trim().max(20).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  type: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(500).optional(),
  enabled: z.boolean().optional(),
  completed: z.boolean().optional(),
  alarmSound: z.boolean().optional(),
  clientNowMs: z.coerce.number().optional(),
})

const reminderSettingsSchema = z.object({
  alarmSoundEnabled: z.boolean().optional(),
  alarmTone: z.enum(['chime', 'pulse', 'urgent']).optional(),
  defaultAdvanceMinutes: z.coerce.number().int().min(0).max(10080).optional(),
  userTimezone: z.string().trim().max(80).optional(),
  tripTimezone: z.string().trim().max(80).optional(),
})

const noteInputSchema = z.object({
  day: z.coerce.number().int().min(1).max(30).optional().default(1),
  tag: z.string().trim().max(60).optional().default('Personal note'),
  title: z.string().trim().max(200).optional().default(''),
  content: z.string().trim().min(1).max(3000),
})

const noteUpdateSchema = z.object({
  day: z.coerce.number().int().min(1).max(30).optional(),
  tag: z.string().trim().max(60).optional(),
  title: z.string().trim().max(200).optional(),
  content: z.string().trim().min(1).max(3000).optional(),
})

const findOwned = (id, user) => {
  if (!mongoose.Types.ObjectId.isValid(id)) return null
  return Trip.findOne({ _id: id, user })
}

const findAccessible = async (id, user) => {
  if (!mongoose.Types.ObjectId.isValid(id)) return null
  const membership = await TripMember.findOne({ trip: id, user }).select('role')
  if (!membership) {
    const ownedTrip = await findOwned(id, user)
    if (!ownedTrip) return null
    await TripMember.updateOne({ trip: ownedTrip._id, user }, { $set: { role: 'OWNER' } }, { upsert: true })
    return { trip: await Trip.findById(id).populate('user', 'name email'), role: 'OWNER' }
  }
  const trip = await Trip.findById(id).populate('user', 'name email')
  return trip ? { trip, role: membership.role } : null
}

const findEditable = async (id, userId) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { error: { status: 404, message: 'Trip not found' } }
  }
  const access = await findAccessible(id, userId)
  if (!access) {
    const exists = await Trip.exists({ _id: id })
    if (exists) {
      return { error: { status: 403, message: 'You do not have permission to modify this trip' } }
    }
    return { error: { status: 404, message: 'Trip not found' } }
  }
  if (access.role === 'VIEWER') {
    return { error: { status: 403, message: 'Viewers do not have permission to modify this trip' } }
  }
  return { trip: access.trip, role: access.role }
}

async function enrichAndPersistTrip(trip, role = 'OWNER', { saveIfModified = true, undoLabel = null, preMutationDays = null } = {}) {
  if (undoLabel && Array.isArray(preMutationDays)) {
    if (!Array.isArray(trip.undoHistory)) trip.undoHistory = []
    trip.undoHistory.push({
      label: undoLabel,
      createdAt: new Date(),
      days: preMutationDays,
    })
    if (trip.undoHistory.length > 10) {
      trip.undoHistory = trip.undoHistory.slice(-10)
    }
    trip.markModified('undoHistory')
  }

  const { modified, budgetStatus } = normalizeAndRecalculateTrip(trip)
  let remindersNormalized = false
  if (Array.isArray(trip.reminders) && trip.reminders.length > 0) {
    trip.reminders.forEach((rem) => {
      const sched = computeReminderSchedule(rem, trip)
      if (!rem.notificationKey || rem.date !== sched.date || rem.scheduledTimeDisplay !== sched.scheduledTimeDisplay) {
        rem.date = sched.date
        rem.time = sched.time
        rem.timezone = sched.timezone
        rem.advanceMinutes = sched.advanceMinutes
        rem.advanceMode = sched.advanceMode
        rem.scheduledAt = sched.scheduledAt
        rem.notifyAt = sched.notifyAt
        rem.scheduledTimeDisplay = sched.scheduledTimeDisplay
        rem.notifyTimeDisplay = sched.notifyTimeDisplay
        rem.notificationKey = sched.notificationKey
        remindersNormalized = true
      }
    })
    if (remindersNormalized) trip.markModified('reminders')
  }

  if (saveIfModified && (modified || undoLabel || remindersNormalized)) {
    trip.markModified('itinerary')
    trip.markModified('budgetBreakdown')
    await trip.save()
    if (trip.itinerary?.days?.length) {
      await Itinerary.findOneAndUpdate(
        { trip: trip._id },
        {
          user: trip.user?._id || trip.user,
          summary: trip.itinerary.summary || '',
          days: trip.itinerary.days,
          tips: trip.itinerary.tips || [],
        },
        { upsert: true }
      )
    }
  }

  const expenses = await Expense.find({ trip: trip._id }).sort({ date: -1 })
  const feasibility = evaluateItineraryFeasibility(trip)
  const readiness = calculateTravelReadiness(trip, expenses)
  const reminderEvaluation = evaluateTripReminders(trip)

  return {
    trip: {
      ...trip.toObject(),
      reminders: reminderEvaluation.reminders,
      reminderEvaluation: {
        dueReminders: reminderEvaluation.dueReminders,
        upcomingReminders: reminderEvaluation.upcomingReminders,
        overdueReminders: reminderEvaluation.overdueReminders,
        nextUpcoming: reminderEvaluation.nextUpcoming,
      },
      membershipRole: role,
      budgetStatus,
      feasibility,
      readiness,
    },
    expenses,
  }
}

function ensureItineraryDaysInitialized(trip, minDay = 1) {
  if (!trip.itinerary) {
    trip.itinerary = { summary: `Custom itinerary for ${trip.destination}`, days: [], tips: [] }
  }
  if (!Array.isArray(trip.itinerary.days)) {
    trip.itinerary.days = []
  }
  const targetTotalDays = Math.max(Number(trip.days) || 1, Number(minDay) || 1, trip.itinerary.days.length)
  const existingByDay = new Map(trip.itinerary.days.map((d) => [Number(d.day), d]))
  for (let d = 1; d <= targetTotalDays; d++) {
    if (!existingByDay.has(d)) {
      trip.itinerary.days.push({
        day: d,
        title: `Day ${d} in ${trip.destination}`,
        activities: [],
        estimatedDayCost: 0,
      })
    }
  }
  trip.itinerary.days.sort((a, b) => a.day - b.day)
}

const listTrips = asyncHandler(async (req, res) => {
  const ownedTrips = await Trip.find({ user: req.user._id }).select('_id')
  if (ownedTrips.length) {
    await TripMember.bulkWrite(
      ownedTrips.map((trip) => ({
        updateOne: {
          filter: { trip: trip._id, user: req.user._id },
          update: { $set: { role: 'OWNER' } },
          upsert: true,
        },
      }))
    )
  }
  const memberships = await TripMember.find({ user: req.user._id }).sort({ createdAt: -1 }).populate('trip')
  const trips = memberships
    .filter(({ trip }) => trip)
    .map(({ trip, role }) => ({ ...trip.toObject(), membershipRole: role }))
  res.json({ success: true, trips })
})

const createTrip = asyncHandler(async (req, res) => {
  const data = tripSchema.parse(req.body)
  const partnerEmails = [...new Set(data.partnerEmails.map((email) => email.toLowerCase()))].filter(
    (email) => email !== req.user.email.toLowerCase()
  )
  const users = partnerEmails.length ? await User.find({ email: { $in: partnerEmails } }).select('name email') : []
  const foundByEmail = new Map(users.map((user) => [user.email, user]))
  const missingEmails = partnerEmails.filter((email) => !foundByEmail.has(email))
  if (missingEmails.length) {
    return res.status(400).json({ success: false, message: `No registered user found with: ${missingEmails.join(', ')}` })
  }
  const { partnerEmails: ignoredPartnerEmails, ...tripData } = data
  const partners = partnerEmails.map((email) => {
    const user = foundByEmail.get(email)
    return { user: user._id, name: user.name, email: user.email }
  })
  const trip = await Trip.create({
    ...tripData,
    user: req.user._id,
    partners,
    budgetBreakdown: calculateBudget(data),
  })
  await TripMember.bulkWrite([
    { updateOne: { filter: { trip: trip._id, user: req.user._id }, update: { $set: { role: 'OWNER' } }, upsert: true } },
    ...partners.map((partner) => ({
      updateOne: { filter: { trip: trip._id, user: partner.user }, update: { $set: { role: 'VIEWER' } }, upsert: true },
    })),
  ])
  res.status(201).json({ success: true, trip })
})

const getTrip = asyncHandler(async (req, res) => {
  const access = await findAccessible(req.params.id, req.user._id)
  if (!access) {
    const exists = mongoose.Types.ObjectId.isValid(req.params.id) && (await Trip.exists({ _id: req.params.id }))
    if (exists) return res.status(403).json({ success: false, message: 'You do not have access to this trip' })
    return res.status(404).json({ success: false, message: 'Trip not found' })
  }
  const { trip, expenses } = await enrichAndPersistTrip(access.trip, access.role, { saveIfModified: true })
  res.json({ success: true, trip, expenses })
})

const updateTrip = asyncHandler(async (req, res) => {
  const { trip, role, error } = await findEditable(req.params.id, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })
  const data = tripSchema.partial().parse(req.body)
  Object.assign(trip, data)
  if (!trip.itinerary?.days?.length && Object.keys(data).some((key) => ['days', 'travelers', 'budget', 'destination', 'startLocation'].includes(key))) {
    trip.budgetBreakdown = calculateBudget(trip)
  }
  await trip.save()
  const enriched = await enrichAndPersistTrip(trip, role, { saveIfModified: true })
  res.json({ success: true, trip: enriched.trip })
})

const deleteTrip = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ success: false, message: 'Trip not found' })
  }
  const trip = await findOwned(req.params.id, req.user._id)
  if (!trip) {
    const exists = await Trip.exists({ _id: req.params.id })
    if (exists) return res.status(403).json({ success: false, message: 'Only the trip owner can delete this trip' })
    return res.status(404).json({ success: false, message: 'Trip not found' })
  }
  await Expense.deleteMany({ trip: trip._id })
  await TripMember.deleteMany({ trip: trip._id })
  await Itinerary.deleteMany({ trip: trip._id })
  await trip.deleteOne()
  res.json({ success: true, message: 'Trip deleted' })
})

// --- Section 2: Editable Itinerary Activity Endpoints ---

const addActivity = asyncHandler(async (req, res) => {
  const { trip, role, error } = await findEditable(req.params.id, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })

  const input = activityInputSchema.parse(req.body)
  const dayNumber = Math.min(Math.max(1, Number(input.day) || 1), Math.max(30, Number(trip.days) || 1))
  normalizeAndRecalculateTrip(trip)
  const preMutationDays = JSON.parse(JSON.stringify(trip.itinerary?.days || []))

  ensureItineraryDaysInitialized(trip, dayNumber)
  const dayEntry = trip.itinerary.days.find((d) => Number(d.day) === dayNumber)
  const newActivity = normalizeActivity(
    {
      ...input,
      id: new mongoose.Types.ObjectId().toString(),
      location: input.location || trip.destination,
    },
    trip.destination
  )
  dayEntry.activities.push(newActivity)
  if (dayNumber > trip.days) trip.days = dayNumber

  trip.markModified('itinerary')
  const { trip: updatedTrip } = await enrichAndPersistTrip(trip, role, {
    saveIfModified: true,
    undoLabel: `Added "${newActivity.title}" to Day ${dayNumber}`,
    preMutationDays,
  })
  res.status(201).json({ success: true, activity: newActivity, trip: updatedTrip })
})

const updateActivity = asyncHandler(async (req, res) => {
  const { trip, role, error } = await findEditable(req.params.id, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })

  const { activityId } = req.params
  normalizeAndRecalculateTrip(trip)
  const days = trip.itinerary?.days || []

  let foundDay = null
  let foundIndex = -1
  for (const d of days) {
    const idx = (d.activities || []).findIndex((a) => String(a.id) === String(activityId))
    if (idx !== -1) {
      foundDay = d
      foundIndex = idx
      break
    }
  }

  if (!foundDay || foundIndex === -1) {
    return res.status(404).json({ success: false, message: 'Activity not found in this itinerary' })
  }

  const preMutationDays = JSON.parse(JSON.stringify(days))
  const existingAct = foundDay.activities[foundIndex].toObject
    ? foundDay.activities[foundIndex].toObject()
    : foundDay.activities[foundIndex]

  const partialInput = activityUpdateSchema.parse(req.body)
  const updatedActivity = normalizeActivity(
    {
      ...existingAct,
      ...partialInput,
      id: existingAct.id,
    },
    trip.destination
  )

  const targetDayNum = partialInput.day ? Number(partialInput.day) : Number(foundDay.day)
  if (targetDayNum !== Number(foundDay.day)) {
    foundDay.activities.splice(foundIndex, 1)
    ensureItineraryDaysInitialized(trip, targetDayNum)
    const destDay = trip.itinerary.days.find((d) => Number(d.day) === targetDayNum)
    destDay.activities.push(updatedActivity)
  } else {
    foundDay.activities[foundIndex] = updatedActivity
  }

  trip.markModified('itinerary')
  const { trip: updatedTrip } = await enrichAndPersistTrip(trip, role, {
    saveIfModified: true,
    undoLabel: `Updated "${updatedActivity.title}"`,
    preMutationDays,
  })
  res.json({ success: true, activity: updatedActivity, trip: updatedTrip })
})

const deleteActivity = asyncHandler(async (req, res) => {
  const { trip, role, error } = await findEditable(req.params.id, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })

  const { activityId } = req.params
  normalizeAndRecalculateTrip(trip)
  const days = trip.itinerary?.days || []

  let foundDay = null
  let foundIndex = -1
  for (const d of days) {
    const idx = (d.activities || []).findIndex((a) => String(a.id) === String(activityId))
    if (idx !== -1) {
      foundDay = d
      foundIndex = idx
      break
    }
  }

  if (!foundDay || foundIndex === -1) {
    return res.status(404).json({ success: false, message: 'Activity not found in this itinerary' })
  }

  const preMutationDays = JSON.parse(JSON.stringify(days))
  const [removed] = foundDay.activities.splice(foundIndex, 1)

  trip.markModified('itinerary')
  const { trip: updatedTrip } = await enrichAndPersistTrip(trip, role, {
    saveIfModified: true,
    undoLabel: `Deleted "${removed.title}" from Day ${foundDay.day}`,
    preMutationDays,
  })
  res.json({
    success: true,
    message: `Deleted "${removed.title}" from Day ${foundDay.day}`,
    deletedActivityId: activityId,
    trip: updatedTrip,
  })
})

const moveActivity = asyncHandler(async (req, res) => {
  const { trip, role, error } = await findEditable(req.params.id, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })

  const { activityId } = req.params
  const { targetDay, targetIndex } = z
    .object({
      targetDay: z.coerce.number().int().min(1).max(30),
      targetIndex: z.coerce.number().int().min(0).optional(),
    })
    .parse(req.body)

  normalizeAndRecalculateTrip(trip)
  const days = trip.itinerary?.days || []

  let sourceDay = null
  let sourceIndex = -1
  for (const d of days) {
    const idx = (d.activities || []).findIndex((a) => String(a.id) === String(activityId))
    if (idx !== -1) {
      sourceDay = d
      sourceIndex = idx
      break
    }
  }

  if (!sourceDay || sourceIndex === -1) {
    return res.status(404).json({ success: false, message: 'Activity not found in this itinerary' })
  }

  const preMutationDays = JSON.parse(JSON.stringify(days))
  const [movedActivity] = sourceDay.activities.splice(sourceIndex, 1)
  ensureItineraryDaysInitialized(trip, targetDay)
  const destDay = trip.itinerary.days.find((d) => Number(d.day) === targetDay)

  if (typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex <= destDay.activities.length) {
    destDay.activities.splice(targetIndex, 0, movedActivity)
  } else {
    destDay.activities.push(movedActivity)
  }

  trip.markModified('itinerary')
  const { trip: updatedTrip } = await enrichAndPersistTrip(trip, role, {
    saveIfModified: true,
    undoLabel: `Moved "${movedActivity.title}" from Day ${sourceDay.day} to Day ${targetDay}`,
    preMutationDays,
  })
  res.json({ success: true, trip: updatedTrip })
})

const reorderActivities = asyncHandler(async (req, res) => {
  const { trip, role, error } = await findEditable(req.params.id, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })

  const dayNumber = Number(req.params.dayNumber)
  normalizeAndRecalculateTrip(trip)
  const dayEntry = (trip.itinerary?.days || []).find((d) => Number(d.day) === dayNumber)
  if (!dayEntry) {
    return res.status(404).json({ success: false, message: `Day ${dayNumber} not found` })
  }

  const preMutationDays = JSON.parse(JSON.stringify(trip.itinerary.days))
  const { activityId, direction, orderedActivityIds } = z
    .object({
      activityId: z.string().optional(),
      direction: z.enum(['up', 'down']).optional(),
      orderedActivityIds: z.array(z.string()).optional(),
    })
    .parse(req.body)

  if (Array.isArray(orderedActivityIds) && orderedActivityIds.length === dayEntry.activities.length) {
    const byId = new Map(dayEntry.activities.map((a) => [String(a.id), a]))
    const reordered = orderedActivityIds.map((id) => byId.get(String(id))).filter(Boolean)
    if (reordered.length === dayEntry.activities.length) {
      dayEntry.activities = reordered
    }
  } else if (activityId && direction) {
    const idx = dayEntry.activities.findIndex((a) => String(a.id) === String(activityId))
    if (idx === -1) return res.status(404).json({ success: false, message: 'Activity not found in this day' })
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx >= 0 && swapIdx < dayEntry.activities.length) {
      const temp = dayEntry.activities[idx]
      dayEntry.activities[idx] = dayEntry.activities[swapIdx]
      dayEntry.activities[swapIdx] = temp
    }
  } else {
    return res.status(400).json({ success: false, message: 'Provide either activityId + direction or orderedActivityIds' })
  }

  trip.markModified('itinerary')
  const { trip: updatedTrip } = await enrichAndPersistTrip(trip, role, {
    saveIfModified: true,
    undoLabel: `Reordered activities in Day ${dayNumber}`,
    preMutationDays,
  })
  res.json({ success: true, trip: updatedTrip })
})

const undoItineraryChange = asyncHandler(async (req, res) => {
  const { trip, role, error } = await findEditable(req.params.id, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })

  if (!Array.isArray(trip.undoHistory) || trip.undoHistory.length === 0) {
    return res.status(400).json({ success: false, message: 'No recent itinerary changes to undo' })
  }

  const snapshot = trip.undoHistory.pop()
  trip.itinerary.days = snapshot.days
  trip.markModified('undoHistory')
  trip.markModified('itinerary')

  const { trip: updatedTrip } = await enrichAndPersistTrip(trip, role, { saveIfModified: true })
  res.json({
    success: true,
    undoneAction: snapshot.label,
    trip: updatedTrip,
  })
})

const updatePreferences = asyncHandler(async (req, res) => {
  const { trip, role, error } = await findEditable(req.params.id, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })

  const input = preferencesSchema.parse(req.body)
  trip.itineraryPreferences = {
    excludedActivities: input.excludedActivities ?? trip.itineraryPreferences?.excludedActivities ?? [],
    excludedCategories: input.excludedCategories ?? trip.itineraryPreferences?.excludedCategories ?? [],
    pace: input.pace ?? trip.itineraryPreferences?.pace ?? 'Balanced',
    customNotes: input.customNotes ?? trip.itineraryPreferences?.customNotes ?? '',
  }
  trip.markModified('itineraryPreferences')
  await trip.save()
  const { trip: updatedTrip } = await enrichAndPersistTrip(trip, role, { saveIfModified: false })
  res.json({ success: true, trip: updatedTrip })
})

// --- Section 4.A: Smart Packing Checklist Endpoints ---

const generatePackingList = asyncHandler(async (req, res) => {
  const { trip, role, error } = await findEditable(req.params.id, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })

  trip.packingChecklist = generateSmartPackingChecklist(trip)
  trip.markModified('packingChecklist')
  await trip.save()
  const { trip: updatedTrip } = await enrichAndPersistTrip(trip, role, { saveIfModified: false })
  res.json({ success: true, packingChecklist: updatedTrip.packingChecklist, trip: updatedTrip })
})

const addPackingItem = asyncHandler(async (req, res) => {
  const { trip, role, error } = await findEditable(req.params.id, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })

  const input = packingItemInputSchema.parse(req.body)
  if (!Array.isArray(trip.packingChecklist)) trip.packingChecklist = []
  const newItem = {
    id: new mongoose.Types.ObjectId().toString(),
    item: input.item,
    category: input.category || 'Custom',
    packed: false,
    isCustom: true,
  }
  trip.packingChecklist.push(newItem)
  trip.markModified('packingChecklist')
  await trip.save()
  const { trip: updatedTrip } = await enrichAndPersistTrip(trip, role, { saveIfModified: false })
  res.status(201).json({ success: true, item: newItem, trip: updatedTrip })
})

const updatePackingItem = asyncHandler(async (req, res) => {
  const { trip, role, error } = await findEditable(req.params.id, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })

  const { itemId } = req.params
  const item = (trip.packingChecklist || []).find((i) => String(i.id) === String(itemId))
  if (!item) return res.status(404).json({ success: false, message: 'Packing item not found' })

  const { packed, item: label, category } = z
    .object({
      packed: z.boolean().optional(),
      item: z.string().trim().min(1).max(150).optional(),
      category: z.string().trim().max(60).optional(),
    })
    .parse(req.body)

  if (typeof packed === 'boolean') item.packed = packed
  if (label) item.item = label
  if (category) item.category = category

  trip.markModified('packingChecklist')
  await trip.save()
  const { trip: updatedTrip } = await enrichAndPersistTrip(trip, role, { saveIfModified: false })
  res.json({ success: true, item, trip: updatedTrip })
})

const deletePackingItem = asyncHandler(async (req, res) => {
  const { trip, role, error } = await findEditable(req.params.id, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })

  const { itemId } = req.params
  const before = (trip.packingChecklist || []).length
  trip.packingChecklist = (trip.packingChecklist || []).filter((i) => String(i.id) !== String(itemId))
  if (trip.packingChecklist.length === before) {
    return res.status(404).json({ success: false, message: 'Packing item not found' })
  }
  trip.markModified('packingChecklist')
  await trip.save()
  const { trip: updatedTrip } = await enrichAndPersistTrip(trip, role, { saveIfModified: false })
  res.json({ success: true, trip: updatedTrip })
})

// --- Section 4.C: Travel Reminders & Alarm Notification Endpoints ---

function resolveCreationTimestamp(clientNowMs) {
  const serverNow = Date.now()
  if (typeof clientNowMs === 'number' && Number.isFinite(clientNowMs) && Math.abs(clientNowMs - serverNow) <= 15 * 60 * 1000) {
    return new Date(Math.max(serverNow, clientNowMs))
  }
  return new Date(serverNow)
}

const addReminder = asyncHandler(async (req, res) => {
  const { trip, role, error } = await findEditable(req.params.id, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })

  const { clientNowMs, ...input } = reminderInputSchema.parse(req.body)
  if (!Array.isArray(trip.reminders)) trip.reminders = []
  const schedule = computeReminderSchedule(input, trip)
  const scheduleUpdatedAt = resolveCreationTimestamp(clientNowMs)

  // If event is in the future but the advance window already passed before creation, clamp notifyAt to scheduledAt
  if (
    schedule.scheduledAt &&
    schedule.notifyAt &&
    schedule.notifyAt.getTime() <= scheduleUpdatedAt.getTime() &&
    schedule.scheduledAt.getTime() > scheduleUpdatedAt.getTime()
  ) {
    schedule.notifyAt = schedule.scheduledAt
    schedule.notifyTimeDisplay = schedule.scheduledTimeDisplay
  }

  const newReminder = {
    id: new mongoose.Types.ObjectId().toString(),
    ...input,
    ...schedule,
    scheduleUpdatedAt,
    notifiedAt: null,
    lastNotifiedKey: '',
    acknowledgedAt: null,
    deliveryChannel: '',
  }
  trip.reminders.push(newReminder)
  trip.markModified('reminders')
  await trip.save()
  const { trip: updatedTrip } = await enrichAndPersistTrip(trip, role, { saveIfModified: false })
  const savedRem = updatedTrip.reminders.find((r) => String(r.id) === String(newReminder.id)) || newReminder
  res.status(201).json({ success: true, reminder: savedRem, trip: updatedTrip })
})

const updateReminder = asyncHandler(async (req, res) => {
  const { trip, role, error } = await findEditable(req.params.id, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })

  const { reminderId } = req.params
  const reminder = (trip.reminders || []).find((r) => String(r.id) === String(reminderId))
  if (!reminder) return res.status(404).json({ success: false, message: 'Reminder not found' })

  const oldKey = reminder.notificationKey || ''
  const { clientNowMs, ...rawPatch } = reminderUpdateSchema.parse(req.body)
  // Strip undefined fields so partial updates never overwrite existing reminder properties
  const input = Object.fromEntries(Object.entries(rawPatch).filter(([, v]) => v !== undefined))

  const merged = {
    ...(reminder.toObject ? reminder.toObject() : reminder),
    ...input,
  }
  const schedule = computeReminderSchedule(merged, trip)
  Object.assign(reminder, input, schedule)

  if (schedule.notificationKey && schedule.notificationKey !== oldKey) {
    const scheduleUpdatedAt = resolveCreationTimestamp(clientNowMs)
    if (
      schedule.scheduledAt &&
      schedule.notifyAt &&
      schedule.notifyAt.getTime() <= scheduleUpdatedAt.getTime() &&
      schedule.scheduledAt.getTime() > scheduleUpdatedAt.getTime()
    ) {
      reminder.notifyAt = schedule.scheduledAt
      reminder.notifyTimeDisplay = schedule.scheduledTimeDisplay
    }
    reminder.scheduleUpdatedAt = scheduleUpdatedAt
    reminder.notifiedAt = null
    reminder.lastNotifiedKey = ''
    reminder.acknowledgedAt = null
    reminder.deliveryChannel = ''
  }

  trip.markModified('reminders')
  await trip.save()
  const { trip: updatedTrip } = await enrichAndPersistTrip(trip, role, { saveIfModified: false })
  const savedRem = updatedTrip.reminders.find((r) => String(r.id) === String(reminderId)) || reminder
  res.json({ success: true, reminder: savedRem, trip: updatedTrip })
})

const deleteReminder = asyncHandler(async (req, res) => {
  const { trip, role, error } = await findEditable(req.params.id, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })

  const { reminderId } = req.params
  const before = (trip.reminders || []).length
  trip.reminders = (trip.reminders || []).filter((r) => String(r.id) !== String(reminderId))
  if (trip.reminders.length === before) {
    return res.status(404).json({ success: false, message: 'Reminder not found' })
  }
  trip.markModified('reminders')
  await trip.save()
  const { trip: updatedTrip } = await enrichAndPersistTrip(trip, role, { saveIfModified: false })
  res.json({ success: true, trip: updatedTrip })
})

const checkDueReminders = asyncHandler(async (req, res) => {
  const access = await findAccessible(req.params.id, req.user._id)
  if (!access) return res.status(404).json({ success: false, message: 'Trip not found' })

  const evaluation = evaluateTripReminders(access.trip, new Date())
  res.json({
    success: true,
    serverTime: new Date().toISOString(),
    ...evaluation,
  })
})

const triggerReminderNotification = asyncHandler(async (req, res) => {
  const { trip, role, error } = await findEditable(req.params.id, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })

  const { reminderId } = req.params
  const reminder = (trip.reminders || []).find((r) => String(r.id) === String(reminderId))
  if (!reminder) return res.status(404).json({ success: false, message: 'Reminder not found' })

  if (reminder.enabled === false) {
    return res.status(400).json({ success: false, message: 'Disabled reminders cannot trigger notifications' })
  }
  if (reminder.completed) {
    return res.status(400).json({ success: false, message: 'Completed reminders cannot trigger notifications' })
  }

  const schedule = computeReminderSchedule(reminder, trip)
  const currentKey = schedule.notificationKey || `${reminder.id}|default`

  if (reminder.notifiedAt && reminder.lastNotifiedKey === currentKey) {
    const { trip: existingTrip } = await enrichAndPersistTrip(trip, role, { saveIfModified: false })
    return res.json({
      success: true,
      alreadyDelivered: true,
      duplicatePrevented: true,
      trip: existingTrip,
    })
  }

  const channel = typeof req.body?.channel === 'string' && req.body.channel.trim()
    ? req.body.channel.trim()
    : 'browser_notification'

  const now = new Date()
  reminder.notifiedAt = now
  reminder.notificationKey = currentKey
  reminder.lastNotifiedKey = currentKey
  reminder.deliveryChannel = channel

  const historyEntry = {
    id: new mongoose.Types.ObjectId().toString(),
    reminderId: String(reminder.id),
    title: reminder.title,
    type: reminder.type || 'General',
    day: reminder.day || 1,
    date: schedule.date,
    scheduledTimeDisplay: schedule.scheduledTimeDisplay,
    notifyTimeDisplay: schedule.notifyTimeDisplay,
    advanceMinutes: schedule.advanceMinutes,
    timezone: schedule.timezone,
    deliveredAt: now,
    channel,
    dismissedAt: null,
  }

  if (!Array.isArray(trip.notificationHistory)) trip.notificationHistory = []
  trip.notificationHistory.unshift(historyEntry)
  if (trip.notificationHistory.length > 50) {
    trip.notificationHistory = trip.notificationHistory.slice(0, 50)
  }

  trip.markModified('reminders')
  trip.markModified('notificationHistory')
  await trip.save()

  const { trip: updatedTrip } = await enrichAndPersistTrip(trip, role, { saveIfModified: false })
  res.json({
    success: true,
    alreadyDelivered: false,
    duplicatePrevented: false,
    historyEntry,
    trip: updatedTrip,
  })
})

const dismissReminderAlarm = asyncHandler(async (req, res) => {
  const { trip, role, error } = await findEditable(req.params.id, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })

  const { reminderId } = req.params
  const reminder = (trip.reminders || []).find((r) => String(r.id) === String(reminderId))
  if (!reminder) return res.status(404).json({ success: false, message: 'Reminder not found' })

  const now = new Date()
  reminder.acknowledgedAt = now
  if (Array.isArray(trip.notificationHistory)) {
    const hist = trip.notificationHistory.find((h) => String(h.reminderId) === String(reminderId) && !h.dismissedAt)
    if (hist) hist.dismissedAt = now
    trip.markModified('notificationHistory')
  }
  trip.markModified('reminders')
  await trip.save()

  const { trip: updatedTrip } = await enrichAndPersistTrip(trip, role, { saveIfModified: false })
  res.json({ success: true, trip: updatedTrip })
})

const updateReminderSettings = asyncHandler(async (req, res) => {
  const { trip, role, error } = await findEditable(req.params.id, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })

  const input = reminderSettingsSchema.parse(req.body)
  const current = trip.reminderSettings || {}
  trip.reminderSettings = {
    alarmSoundEnabled: input.alarmSoundEnabled ?? current.alarmSoundEnabled ?? true,
    alarmTone: input.alarmTone ?? current.alarmTone ?? 'chime',
    defaultAdvanceMinutes: input.defaultAdvanceMinutes ?? current.defaultAdvanceMinutes ?? 15,
    userTimezone: input.userTimezone ? normalizeTimeZone(input.userTimezone) : current.userTimezone || 'Asia/Kolkata',
    tripTimezone:
      typeof input.tripTimezone === 'string'
        ? input.tripTimezone.trim()
          ? normalizeTimeZone(input.tripTimezone)
          : ''
        : current.tripTimezone || '',
  }
  trip.markModified('reminderSettings')
  await trip.save()

  const { trip: updatedTrip } = await enrichAndPersistTrip(trip, role, { saveIfModified: true })
  res.json({ success: true, reminderSettings: updatedTrip.reminderSettings, trip: updatedTrip })
})

const clearNotificationHistory = asyncHandler(async (req, res) => {
  const { trip, role, error } = await findEditable(req.params.id, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })

  trip.notificationHistory = []
  trip.markModified('notificationHistory')
  await trip.save()
  const { trip: updatedTrip } = await enrichAndPersistTrip(trip, role, { saveIfModified: false })
  res.json({ success: true, trip: updatedTrip })
})

// --- Section 4.E: Trip Notes and Journal Endpoints ---

const addTripNote = asyncHandler(async (req, res) => {
  const { trip, role, error } = await findEditable(req.params.id, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })

  const input = noteInputSchema.parse(req.body)
  if (!Array.isArray(trip.tripNotes)) trip.tripNotes = []
  const newNote = {
    id: new mongoose.Types.ObjectId().toString(),
    ...input,
    updatedAt: new Date(),
  }
  trip.tripNotes.push(newNote)
  trip.markModified('tripNotes')
  await trip.save()
  const { trip: updatedTrip } = await enrichAndPersistTrip(trip, role, { saveIfModified: false })
  res.status(201).json({ success: true, note: newNote, trip: updatedTrip })
})

const updateTripNote = asyncHandler(async (req, res) => {
  const { trip, role, error } = await findEditable(req.params.id, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })

  const { noteId } = req.params
  const note = (trip.tripNotes || []).find((n) => String(n.id) === String(noteId))
  if (!note) return res.status(404).json({ success: false, message: 'Note not found' })

  const rawPatch = noteUpdateSchema.parse(req.body)
  const input = Object.fromEntries(Object.entries(rawPatch).filter(([, v]) => v !== undefined))
  Object.assign(note, input, { updatedAt: new Date() })
  trip.markModified('tripNotes')
  await trip.save()
  const { trip: updatedTrip } = await enrichAndPersistTrip(trip, role, { saveIfModified: false })
  res.json({ success: true, note, trip: updatedTrip })
})

const deleteTripNote = asyncHandler(async (req, res) => {
  const { trip, role, error } = await findEditable(req.params.id, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })

  const { noteId } = req.params
  const before = (trip.tripNotes || []).length
  trip.tripNotes = (trip.tripNotes || []).filter((n) => String(n.id) !== String(noteId))
  if (trip.tripNotes.length === before) {
    return res.status(404).json({ success: false, message: 'Note not found' })
  }
  trip.markModified('tripNotes')
  await trip.save()
  const { trip: updatedTrip } = await enrichAndPersistTrip(trip, role, { saveIfModified: false })
  res.json({ success: true, trip: updatedTrip })
})

module.exports = {
  listTrips,
  createTrip,
  getTrip,
  updateTrip,
  deleteTrip,
  addActivity,
  updateActivity,
  deleteActivity,
  moveActivity,
  reorderActivities,
  undoItineraryChange,
  updatePreferences,
  generatePackingList,
  addPackingItem,
  updatePackingItem,
  deletePackingItem,
  addReminder,
  updateReminder,
  deleteReminder,
  checkDueReminders,
  triggerReminderNotification,
  dismissReminderAlarm,
  updateReminderSettings,
  clearNotificationHistory,
  addTripNote,
  updateTripNote,
  deleteTripNote,
  findOwned,
  findAccessible,
  findEditable,
  enrichAndPersistTrip,
}
