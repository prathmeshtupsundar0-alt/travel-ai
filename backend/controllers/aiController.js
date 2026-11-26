const { z } = require('zod')
const Itinerary = require('../models/Itinerary')
const {
  generateItinerary,
  generateActivityAlternatives,
  generateBudgetOptimization,
  generateLocalTravelTips,
} = require('../services/ai.service')
const { generateSmartPackingChecklist } = require('../services/feasibility.service')
const asyncHandler = require('../utils/asyncHandler')
const { findEditable, findAccessible, enrichAndPersistTrip } = require('./tripController')

const generate = asyncHandler(async (req, res) => {
  const { tripId } = z.object({ tripId: z.string().min(1) }).parse(req.body)
  const { trip, role, error } = await findEditable(tripId, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })

  try {
    const preMutationDays = Array.isArray(trip.itinerary?.days) && trip.itinerary.days.length
      ? JSON.parse(JSON.stringify(trip.itinerary.days))
      : null

    const itinerary = await generateItinerary(trip)
    trip.itinerary = {
      summary: itinerary.summary || '',
      days: itinerary.days,
      tips: itinerary.tips || [],
      generatedAt: new Date(),
    }
    if (Array.isArray(itinerary.localTips) && itinerary.localTips.length > 0) {
      trip.localTips = itinerary.localTips
      trip.markModified('localTips')
    }
    if (!Array.isArray(trip.packingChecklist) || trip.packingChecklist.length === 0) {
      trip.packingChecklist = generateSmartPackingChecklist(trip)
      trip.markModified('packingChecklist')
    }
    trip.status = 'ready'

    const { trip: updatedTrip } = await enrichAndPersistTrip(trip, role, {
      saveIfModified: true,
      undoLabel: preMutationDays ? 'Regenerated AI itinerary' : null,
      preMutationDays,
    })

    await Itinerary.findOneAndUpdate(
      { trip: trip._id },
      { user: req.user._id, ...trip.itinerary.toObject() },
      { upsert: true }
    )

    res.json({ success: true, itinerary: updatedTrip.itinerary, trip: updatedTrip })
  } catch (err) {
    if (err.name === 'GeminiError') {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
        error: { type: err.type, status: err.statusCode, details: err.details },
      })
    }
    throw err
  }
})

const suggestAlternatives = asyncHandler(async (req, res) => {
  const { tripId, dayNumber, activityId, userReason } = z
    .object({
      tripId: z.string().min(1),
      dayNumber: z.coerce.number().int().min(1).optional(),
      activityId: z.string().min(1),
      userReason: z.string().trim().max(300).optional().default(''),
    })
    .parse(req.body)

  const { trip, error } = await findEditable(tripId, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })

  let targetActivity = null
  let resolvedDayNum = dayNumber || 1

  for (const d of trip.itinerary?.days || []) {
    const act = (d.activities || []).find((a) => String(a.id) === String(activityId))
    if (act) {
      targetActivity = act
      resolvedDayNum = d.day
      break
    }
  }

  if (!targetActivity) {
    return res.status(404).json({ success: false, message: 'Original activity not found in itinerary' })
  }

  const result = await generateActivityAlternatives(trip, {
    dayNumber: resolvedDayNum,
    activity: targetActivity,
    userReason,
  })

  res.json({
    success: true,
    originalActivity: targetActivity,
    dayNumber: resolvedDayNum,
    alternatives: result.alternatives,
    source: result.source,
  })
})

const optimizeBudget = asyncHandler(async (req, res) => {
  const { tripId } = z.object({ tripId: z.string().min(1) }).parse(req.body)
  const access = await findAccessible(tripId, req.user._id)
  if (!access) return res.status(404).json({ success: false, message: 'Trip not found' })

  const optimization = await generateBudgetOptimization(access.trip)
  res.json({
    success: true,
    optimization,
  })
})

const localTips = asyncHandler(async (req, res) => {
  const { tripId } = z.object({ tripId: z.string().min(1) }).parse(req.body)
  const { trip, role, error } = await findEditable(tripId, req.user._id)
  if (error) return res.status(error.status).json({ success: false, message: error.message })

  const generatedTips = await generateLocalTravelTips(trip)
  trip.localTips = generatedTips
  trip.markModified('localTips')
  await trip.save()

  const { trip: updatedTrip } = await enrichAndPersistTrip(trip, role, { saveIfModified: false })
  res.json({
    success: true,
    localTips: generatedTips,
    trip: updatedTrip,
  })
})

module.exports = {
  generate,
  suggestAlternatives,
  optimizeBudget,
  localTips,
}
