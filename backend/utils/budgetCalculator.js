const mongoose = require('mongoose')

const CATEGORY_MAP = {
  transportation: 'Transportation',
  transport: 'Transportation',
  flight: 'Transportation',
  train: 'Transportation',
  accommodation: 'Accommodation',
  hotel: 'Accommodation',
  stay: 'Accommodation',
  food: 'Food',
  dining: 'Food',
  restaurant: 'Food',
  activities: 'Activities',
  activity: 'Activities',
  sightseeing: 'Activities',
  relaxation: 'Activities',
  adventure: 'Activities',
  culture: 'Activities',
  nature: 'Activities',
  'local transport': 'Local Transport',
  localtransport: 'Local Transport',
  shopping: 'Shopping',
  miscellaneous: 'Miscellaneous',
  misc: 'Miscellaneous',
}

const CATEGORY_TO_BUDGET_KEY = {
  Transportation: 'transportation',
  Accommodation: 'accommodation',
  Food: 'food',
  Activities: 'activities',
  'Local Transport': 'localTransport',
  Shopping: 'shopping',
  Miscellaneous: 'miscellaneous',
}

function inferActivityCategory(activity = {}) {
  const raw = String(activity.category || '').trim().toLowerCase()
  if (raw && raw !== 'activities' && raw !== 'activity' && CATEGORY_MAP[raw]) {
    if (raw === 'sightseeing' || raw === 'relaxation' || raw === 'adventure' || raw === 'culture' || raw === 'nature') {
      return raw.charAt(0).toUpperCase() + raw.slice(1)
    }
    return CATEGORY_MAP[raw]
  }
  const text = `${activity.title || ''} ${activity.description || ''}`.toLowerCase()
  if (/\b(flight|airport|airline|express train|intercity bus|railway|depart from|journey from|return journey)\b/.test(text)) return 'Transportation'
  if (/\b(hotel|resort|check-in|check in|checkout|check-out|hostel|homestay|stay at|accommodation|villa|lodge)\b/.test(text)) return 'Accommodation'
  if (/\b(breakfast|lunch|dinner|brunch|cafe|restaurant|street food|food tour|culinary|dining|bistro|eatery|tapas|feast)\b/.test(text)) return 'Food'
  if (/\b(taxi|cab|metro|subway|tuk-tuk|auto rickshaw|shuttle|local bus|car rental|bike rental|scooter|ferry transfer|local transfer)\b/.test(text)) return 'Local Transport'
  if (/\b(shopping|market|bazaar|souvenir|mall|boutique|craft market|flea market)\b/.test(text)) return 'Shopping'
  if (/\b(sim card|currency exchange|travel insurance|tip|emergency)\b/.test(text)) return 'Miscellaneous'
  return 'Activities'
}

function inferIsOutdoor(activity = {}) {
  if (typeof activity.isOutdoor === 'boolean') return activity.isOutdoor
  const text = `${activity.title || ''} ${activity.description || ''} ${activity.category || ''}`.toLowerCase()
  if (/\b(indoor|museum|gallery|mall|cinema|theater|theatre|aquarium|planetarium|spa|hotel|check-in)\b/.test(text)) return false
  return /\b(beach|hike|hiking|trek|trail|park|canyon|outdoor|walking tour|photography walk|boat|cruise|kayak|safari|camp|garden|viewpoint|sunset|sunrise|waterfall|lake|river|mountain|cycling|helicopter|paragliding|surfing|snorkeling|diving|street food|open-air|fort|ruins|promenade)\b/.test(text)
}

function calculateBudget({ budget, days, travelers }) {
  const total = Math.max(0, Number(budget) || 0) || Math.max(1, Number(days) || 1) * Math.max(1, Number(travelers) || 1) * 2000
  const weights = {
    transportation: 0.27,
    accommodation: 0.28,
    food: 0.17,
    activities: 0.13,
    localTransport: 0.09,
    shopping: 0,
    miscellaneous: 0.06,
  }
  const result = {}
  for (const [key, weight] of Object.entries(weights)) {
    result[key] = Math.round(total * weight)
  }
  result.estimatedTotal = Object.values(result).reduce((sum, value) => sum + value, 0)
  return result
}

function normalizeAndRecalculateTrip(trip) {
  let modified = false
  if (!trip.itinerary) {
    trip.itinerary = { summary: '', days: [], tips: [] }
    modified = true
  }
  const days = Array.isArray(trip.itinerary.days) ? trip.itinerary.days : []
  const categoryTotals = {
    transportation: 0,
    accommodation: 0,
    food: 0,
    activities: 0,
    localTransport: 0,
    shopping: 0,
    miscellaneous: 0,
  }

  let itineraryEstimatedTotal = 0

  days.forEach((dayEntry, idx) => {
    const expectedDayNum = idx + 1
    if (dayEntry.day !== expectedDayNum) {
      dayEntry.day = expectedDayNum
      modified = true
    }
    const activities = Array.isArray(dayEntry.activities) ? dayEntry.activities : []
    let dayCost = 0

    activities.forEach((act) => {
      if (!act.id) {
        act.id = new mongoose.Types.ObjectId().toString()
        modified = true
      }
      const cleanCost = Math.max(0, Math.round(Number(act.estimatedCost) || 0))
      if (act.estimatedCost !== cleanCost) {
        act.estimatedCost = cleanCost
        modified = true
      }
      const inferredCategory = inferActivityCategory(act)
      if (!act.category || !act.category.trim() || (act.category === 'Activities' && inferredCategory !== 'Activities')) {
        act.category = inferredCategory
        modified = true
      }
      const computedOutdoor = inferIsOutdoor(act)
      if (typeof act.isOutdoor !== 'boolean' || (act.isOutdoor === false && computedOutdoor === true)) {
        act.isOutdoor = computedOutdoor
      }
      if (typeof act.location !== 'string') act.location = ''
      if (typeof act.notes !== 'string') act.notes = ''

      dayCost += cleanCost
      const normalizedTopCategory = CATEGORY_MAP[String(act.category).trim().toLowerCase()] || 'Activities'
      const budgetKey = CATEGORY_TO_BUDGET_KEY[normalizedTopCategory] || 'activities'
      categoryTotals[budgetKey] += cleanCost
    })

    if (dayEntry.estimatedDayCost !== dayCost) {
      dayEntry.estimatedDayCost = dayCost
      modified = true
    }
    itineraryEstimatedTotal += dayCost
  })

  if (days.length > 0) {
    const nextBreakdown = {
      ...categoryTotals,
      estimatedTotal: itineraryEstimatedTotal,
    }
    const current = trip.budgetBreakdown || {}
    const keys = Object.keys(nextBreakdown)
    if (keys.some((k) => Number(current[k] || 0) !== nextBreakdown[k])) {
      trip.budgetBreakdown = nextBreakdown
      modified = true
    }
  } else if (!trip.budgetBreakdown || typeof trip.budgetBreakdown.estimatedTotal !== 'number') {
    trip.budgetBreakdown = calculateBudget(trip)
    modified = true
  }

  const estimatedTotal = Number(trip.budgetBreakdown?.estimatedTotal || 0)
  const availableBudget = Number(trip.budget || 0)
  const exceededBy = Math.max(0, estimatedTotal - availableBudget)

  return {
    modified,
    budgetStatus: {
      estimatedTotal,
      availableBudget,
      remainingPlannedBudget: availableBudget - estimatedTotal,
      isExceeded: estimatedTotal > availableBudget,
      exceededBy,
    },
  }
}

module.exports = {
  calculateBudget,
  inferActivityCategory,
  inferIsOutdoor,
  normalizeAndRecalculateTrip,
}
