const mongoose = require('mongoose')
const { inferIsOutdoor } = require('../utils/budgetCalculator')
const { describeWeather } = require('./weather.service')

function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null
  const clean = timeStr.trim().toUpperCase()
  const match = clean.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/)
  if (!match) return null
  let hours = parseInt(match[1], 10)
  const minutes = match[2] ? parseInt(match[2], 10) : 0
  const period = match[3]
  if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes < 0 || minutes > 59) return null
  if (period === 'PM' && hours < 12) hours += 12
  if (period === 'AM' && hours === 12) hours = 0
  if (!period && (hours < 0 || hours > 23)) return null
  return hours * 60 + minutes
}

function suggestIndoorAlternatives(activity, destination) {
  const text = `${activity.title || ''} ${activity.description || ''}`.toLowerCase()
  const dest = destination || 'the destination'
  if (/\b(beach|water|boat|cruise|kayak|surfing|snorkeling|lake|river)\b/.test(text)) {
    return [
      `Visit a maritime, science, or regional heritage museum in ${dest}`,
      `Explore an indoor aquarium, art gallery, or cultural exhibition center`,
      `Join an indoor regional cooking class or covered waterfront café tasting`,
    ]
  }
  if (/\b(hike|hiking|trek|trail|canyon|park|mountain|viewpoint|sunset|sunrise|helicopter)\b/.test(text)) {
    return [
      `Tour an indoor natural history center, planetarium, or visitor interpretation gallery in ${dest}`,
      `Attend a local cultural performance, indoor observation deck, or heritage palace tour`,
      `Enjoy a traditional wellness spa or indoor artisan craft workshop`,
    ]
  }
  if (/\b(market|street food|walk|walking tour|photography)\b/.test(text)) {
    return [
      `Explore a historic covered market, indoor food hall, or shopping arcade in ${dest}`,
      `Take a guided museum architecture tour or indoor culinary tasting experience`,
      `Visit a local specialty coffee roastery, tea house, or cultural center`,
    ]
  }
  return [
    `Visit a renowned local museum or historical gallery in ${dest}`,
    `Experience an indoor cultural center, covered bazaar, or culinary workshop`,
    `Relax at an indoor heritage venue or local specialty dining experience`,
  ]
}

function evaluateItineraryFeasibility(trip) {
  const warnings = []
  const weatherAdvisories = []
  const days = Array.isArray(trip?.itinerary?.days) ? trip.itinerary.days : []
  const destination = trip?.destination || 'destination'

  // 1. Check route duration vs Day 1 schedule (verified route vs estimated schedule)
  if (trip?.transport?.durationMinutes && trip.transport.durationMinutes > 360 && days.length > 0) {
    const day1 = days[0]
    const day1Activities = Array.isArray(day1?.activities) ? day1.activities : []
    if (day1Activities.length >= 4) {
      const hours = (trip.transport.durationMinutes / 60).toFixed(1)
      warnings.push({
        id: 'route-day1-packed',
        day: 1,
        type: 'unrealistic_travel_duration',
        severity: 'warning',
        sourceType: 'verified_route',
        title: `Long transit on Day 1 (${hours} hrs driving route)`,
        message: `OSRM route from ${trip.startLocation} to ${destination} is ~${trip.transport.distanceKm} km (${hours} hours), while Day 1 has ${day1Activities.length} scheduled activities. Consider moving non-essential Day 1 sightseeing to a later day.`,
      })
    }
  }

  // 2. Check day-by-day schedule feasibility
  days.forEach((dayEntry, idx) => {
    const dayNum = dayEntry.day || idx + 1
    if (dayNum !== idx + 1) {
      warnings.push({
        id: `day-order-${dayNum}`,
        day: dayNum,
        type: 'inconsistent_day_ordering',
        severity: 'info',
        sourceType: 'estimated_schedule',
        title: `Day numbering out of sequence (Day ${dayNum})`,
        message: `Day ${dayNum} appears at position ${idx + 1}. Saving any activity edit will normalize day sequence automatically.`,
      })
    }

    const activities = Array.isArray(dayEntry.activities) ? dayEntry.activities : []
    if (activities.length > 5) {
      warnings.push({
        id: `packed-day-${dayNum}`,
        day: dayNum,
        type: 'excessively_packed_day',
        severity: 'warning',
        sourceType: 'estimated_schedule',
        title: `Day ${dayNum} is heavily packed (${activities.length} activities)`,
        message: `Scheduling ${activities.length} activities in a single day may leave insufficient time for rest and transit. Consider moving 1–2 activities to a lighter day.`,
      })
    }

    let prevMinutes = null
    let prevActivity = null

    activities.forEach((act, actIdx) => {
      const mins = parseTimeToMinutes(act.time)
      const duration = Number(act.durationMinutes) > 0 ? Number(act.durationMinutes) : 90

      if ( duration > 600) {
        warnings.push({
          id: `long-duration-${dayNum}-${act.id || actIdx}`,
          day: dayNum,
          activityId: act.id,
          type: 'unrealistic_travel_duration',
          severity: 'info',
          sourceType: 'estimated_schedule',
          title: `Extended activity duration on Day ${dayNum}: "${act.title}"`,
          message: `This activity is estimated at ${(duration / 60).toFixed(1)} hours. Verify remaining Day ${dayNum} activities fit comfortably.`,
        })
      }

      if (mins !== null && prevMinutes !== null && prevActivity) {
        const diff = mins - prevMinutes
        if (diff < 0) {
          warnings.push({
            id: `chronology-${dayNum}-${act.id || actIdx}`,
            day: dayNum,
            activityId: act.id,
            type: 'inconsistent_day_ordering',
            severity: 'warning',
            sourceType: 'estimated_schedule',
            title: `Out-of-order timing on Day ${dayNum}`,
            message: `"${act.title}" (${act.time}) is listed after "${prevActivity.title}" (${prevActivity.time}). Use Reorder (Move Up/Down) or update start times so the schedule flows chronologically.`,
          })
        } else if (diff === 0) {
          warnings.push({
            id: `overlap-exact-${dayNum}-${act.id || actIdx}`,
            day: dayNum,
            activityId: act.id,
            type: 'overlapping_timings',
            severity: 'warning',
            sourceType: 'estimated_schedule',
            title: `Overlapping start time on Day ${dayNum} (${act.time})`,
            message: `"${prevActivity.title}" and "${act.title}" are both scheduled at ${act.time}. Adjust one of their start times to avoid a conflict.`,
          })
        } else if (diff < 45) {
          warnings.push({
            id: `tight-gap-${dayNum}-${act.id || actIdx}`,
            day: dayNum,
            activityId: act.id,
            type: 'scheduled_too_close',
            severity: 'warning',
            sourceType: 'estimated_schedule',
            title: `Activities scheduled very close together on Day ${dayNum}`,
            message: `Only ${diff} minutes between "${prevActivity.title}" (${prevActivity.time}) and "${act.title}" (${act.time}), leaving little buffer for activity completion or transit.`,
          })
        } else {
          const prevLoc = String(prevActivity.location || '').trim().toLowerCase()
          const currLoc = String(act.location || '').trim().toLowerCase()
          const hasDistinctLocations = prevLoc && currLoc && prevLoc !== currLoc
          if (hasDistinctLocations && diff < 75 && prevActivity.category !== 'Local Transport' && act.category !== 'Local Transport') {
            warnings.push({
              id: `missing-transit-${dayNum}-${act.id || actIdx}`,
              day: dayNum,
              activityId: act.id,
              type: 'missing_travel_time',
              severity: 'info',
              sourceType: 'estimated_schedule',
              title: `Tight transfer between locations on Day ${dayNum}`,
              message: `"${prevActivity.title}" (${prevActivity.location}) and "${act.title}" (${act.location}) are at different locations with ${diff} minutes between start times. Allow buffer for local travel.`,
            })
          }
        }
      }

      if (mins !== null) {
        prevMinutes = mins
        prevActivity = act
      }
    })
  })

  // 3. Weather-aware activity alternatives (using real Open-Meteo data when loaded)
  if (trip?.weather) {
    const w = trip.weather
    const currentMeta = describeWeather(w.weatherCode, w.temperature)
    const dailyList = Array.isArray(w.dailyForecast) ? w.dailyForecast : []
    const tripStartDate = trip?.travelDates?.start ? new Date(trip.travelDates.start) : null

    days.forEach((dayEntry, idx) => {
      const dayNum = dayEntry.day || idx + 1
      let matchedForecast = null
      let forecastScope = 'current_conditions'

      if (tripStartDate && !Number.isNaN(tripStartDate.getTime()) && dailyList.length > 0) {
        const d = new Date(tripStartDate)
        d.setDate(d.getDate() + idx)
        const isoDate = d.toISOString().slice(0, 10)
        matchedForecast = dailyList.find((f) => f.date === isoDate) || null
        forecastScope = matchedForecast ? 'verified_daily_forecast' : 'outside_forecast_window'
      } else if (dailyList[idx]) {
        matchedForecast = dailyList[idx]
        forecastScope = 'upcoming_7day_window'
      }

      if (forecastScope === 'outside_forecast_window') {
        // Honest functionality: never pretend a forecast exists outside Open-Meteo's supported window
        return
      }

      const activeWeather = matchedForecast || {
        conditionLabel: w.conditionLabel || currentMeta.conditionLabel,
        isRainOrExtreme: typeof w.isRainOrExtreme === 'boolean' ? w.isRainOrExtreme : currentMeta.isRainOrExtreme,
        temperature: w.temperature,
        precipitationProbability: 0,
      }

      if (activeWeather.isRainOrExtreme) {
        const activities = Array.isArray(dayEntry.activities) ? dayEntry.activities : []
        activities.forEach((act) => {
          if (inferIsOutdoor(act)) {
            weatherAdvisories.push({
              id: `weather-day-${dayNum}-${act.id || act.title}`,
              day: dayNum,
              activityId: act.id,
              activityTitle: act.title,
              conditionLabel: activeWeather.conditionLabel,
              precipitationProbability: activeWeather.precipitationProbability || null,
              forecastDate: matchedForecast?.date || null,
              forecastScope,
              warningMessage: matchedForecast?.date
                ? `Open-Meteo forecast for ${matchedForecast.date} indicates ${activeWeather.conditionLabel}${activeWeather.precipitationProbability ? ` (${activeWeather.precipitationProbability}% precip. probability)` : ''}.`
                : `Current Open-Meteo weather in ${w.location || destination} is ${activeWeather.conditionLabel} (${w.temperature}${w.unit || '°C'}).`,
              indoorAlternatives: suggestIndoorAlternatives(act, destination),
            })
          }
        })
      }
    })
  }

  return {
    warnings,
    weatherAdvisories,
    weatherLoaded: Boolean(trip?.weather),
    routeLoaded: Boolean(trip?.transport),
    forecastDisclaimer: trip?.weather
      ? trip.weather.forecastWindowStart && trip.weather.forecastWindowEnd
        ? `Live weather and 7-day forecast provided by Open-Meteo (${trip.weather.forecastWindowStart} to ${trip.weather.forecastWindowEnd}). Dates outside this 7-day window are not forecast.`
        : 'Live current weather provided by Open-Meteo.'
      : 'Load live weather to enable weather-aware outdoor activity checks.',
  }
}

function generateSmartPackingChecklist(trip) {
  const existing = Array.isArray(trip?.packingChecklist) ? trip.packingChecklist : []
  const existingByName = new Map(existing.map((item) => [item.item.toLowerCase(), item]))
  const items = []

  const addItem = (item, category) => {
    const key = item.toLowerCase()
    if (existingByName.has(key)) {
      items.push(existingByName.get(key))
      existingByName.delete(key)
      return
    }
    items.push({
      id: new mongoose.Types.ObjectId().toString(),
      item,
      category,
      packed: false,
      isCustom: false,
    })
  }

  // Core travel documents & essentials
  addItem('Government ID / Passport (verify validity)', 'Documents & Money')
  addItem('Printed & digital itinerary + emergency contacts', 'Documents & Money')
  addItem('Travel insurance & health cards (if applicable)', 'Documents & Money')
  addItem('Cash (INR / local currency) & payment cards', 'Documents & Money')

  // Clothing scaled to duration
  const days = Math.max(1, Number(trip?.days) || 3)
  addItem(`${Math.min(days + 1, 10)} sets of comfortable daily clothing`, 'Clothing & Footwear')
  addItem('Comfortable walking shoes', 'Clothing & Footwear')
  addItem('Sleepwear & undergarments', 'Clothing & Footwear')

  // Weather-specific additions
  const temp = Number(trip?.weather?.temperature)
  const code = Number(trip?.weather?.weatherCode)
  if (Number.isFinite(temp) && temp <= 15) {
    addItem('Warm jacket / thermal layering (cool weather detected)', 'Clothing & Footwear')
  } else if (Number.isFinite(temp) && temp >= 30) {
    addItem('Breathable cotton wear, sun hat & UV sunglasses', 'Clothing & Footwear')
  } else {
    addItem('Light jacket or layering sweater', 'Clothing & Footwear')
  }

  if (code >= 51 || (Array.isArray(trip?.weather?.dailyForecast) && trip.weather.dailyForecast.some((d) => d.isRainOrExtreme))) {
    addItem('Compact umbrella & waterproof rain jacket (rain forecast)', 'Weather Protection')
    addItem('Waterproof pouch for phone & documents', 'Weather Protection')
  } else {
    addItem('Compact travel umbrella / rain poncho', 'Weather Protection')
  }

  // Electronics
  addItem('Smartphone & charging cable', 'Electronics & Gear')
  addItem('Portable power bank (10,000+ mAh)', 'Electronics & Gear')
  addItem('Universal travel adapter', 'Electronics & Gear')
  addItem('Camera / memory cards (optional)', 'Electronics & Gear')

  // Health & personal care
  addItem('Personal prescription medicines & basic first-aid kit', 'Health & Toiletries')
  addItem('Sunscreen, lip balm & hand sanitizer', 'Health & Toiletries')
  addItem('Reusable water bottle', 'Health & Toiletries')

  // Activity & preference specific items
  const allText = `${trip?.preference || ''} ${(trip?.itinerary?.days || []).map((d) => (d.activities || []).map((a) => `${a.title} ${a.description}`).join(' ')).join(' ')}`.toLowerCase()
  if (/\b(hike|hiking|trek|trail|canyon|mountain|adventure|park|camp)\b/.test(allText)) {
    addItem('Sturdy hiking shoes / trail daypack', 'Activity-Specific')
    addItem('Electrolyte packets & blister bandages', 'Activity-Specific')
  }
  if (/\b(beach|swim|pool|lake|waterfall|island|coast|cruise)\b/.test(allText)) {
    addItem('Swimwear & quick-dry microfiber towel', 'Activity-Specific')
    addItem('Flip-flops / water sandals', 'Activity-Specific')
  }
  if (/\b(temple|shrine|monastery|mosque|church|heritage|culture)\b/.test(allText)) {
    addItem('Modest cover-up / scarf for cultural & religious sites', 'Activity-Specific')
  }

  // Keep any custom user items that weren't in the generated set
  for (const leftover of existingByName.values()) {
    items.push(leftover)
  }

  return items
}

function calculateTravelReadiness(trip, expenses = []) {
  const totalDays = Math.max(1, Number(trip?.days) || 1)
  const itineraryDays = Array.isArray(trip?.itinerary?.days) ? trip.itinerary.days : []
  const daysWithActivities = itineraryDays.filter((d) => Array.isArray(d.activities) && d.activities.length > 0).length
  const totalActivities = itineraryDays.reduce((sum, d) => sum + (Array.isArray(d.activities) ? d.activities.length : 0), 0)
  const itineraryPercent = Math.min(100, Math.round((daysWithActivities / totalDays) * 100))

  const checklist = Array.isArray(trip?.packingChecklist) ? trip.packingChecklist : []
  const packedCount = checklist.filter((i) => i.packed).length
  const packingPercent = checklist.length > 0 ? Math.round((packedCount / checklist.length) * 100) : 0

  const budget = Math.max(0, Number(trip?.budget) || 0)
  const estimatedTotal = Math.max(0, Number(trip?.budgetBreakdown?.estimatedTotal) || 0)
  const actualSpent = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
  const estimatedUtilizationPercent = budget > 0 ? Math.round((estimatedTotal / budget) * 100) : 0
  const actualUtilizationPercent = budget > 0 ? Math.round((actualSpent / budget) * 100) : 0
  const isOverBudget = budget > 0 && estimatedTotal > budget

  const weatherAvailable = Boolean(trip?.weather && trip.weather.location)
  const routeAvailable = Boolean(trip?.transport && trip.transport.distanceKm)

  const reminders = Array.isArray(trip?.reminders) ? trip.reminders : []
  const completedReminders = reminders.filter((r) => r.completed).length
  const pendingReminders = reminders.length - completedReminders

  return {
    itinerary: {
      plannedDays: daysWithActivities,
      totalDays,
      totalActivities,
      percent: itineraryPercent,
      label: daysWithActivities > 0
        ? `${daysWithActivities}/${totalDays} days planned (${totalActivities} activities)`
        : 'No itinerary generated yet',
    },
    packing: {
      packedCount,
      totalCount: checklist.length,
      percent: packingPercent,
      label: checklist.length > 0
        ? `${packedCount}/${checklist.length} items packed (${packingPercent}%)`
        : 'Packing checklist not initialized yet',
    },
    budget: {
      budget,
      estimatedTotal,
      actualSpent,
      remainingPlanned: budget - estimatedTotal,
      remainingActual: budget - actualSpent,
      estimatedUtilizationPercent,
      actualUtilizationPercent,
      isOverBudget,
      exceededBy: Math.max(0, estimatedTotal - budget),
      label: budget > 0
        ? `Estimated ${estimatedUtilizationPercent}% of budget (${isOverBudget ? 'Over budget' : 'Within budget'})`
        : 'Budget not set',
    },
    weather: {
      available: weatherAvailable,
      location: trip?.weather?.location || null,
      temperature: trip?.weather?.temperature ?? null,
      conditionLabel: trip?.weather?.conditionLabel || null,
      fetchedAt: trip?.weather?.fetchedAt || null,
      label: weatherAvailable
        ? `${trip.weather.location}: ${trip.weather.temperature}${trip.weather.unit || '°C'} (${trip.weather.conditionLabel || 'Loaded'})`
        : 'Live weather not loaded yet',
    },
    route: {
      available: routeAvailable,
      distanceKm: trip?.transport?.distanceKm ?? null,
      durationMinutes: trip?.transport?.durationMinutes ?? null,
      label: routeAvailable
        ? `${trip.transport.distanceKm} km · ${trip.transport.durationMinutes} min`
        : 'Route not loaded yet',
    },
    reminders: {
      totalCount: reminders.length,
      completedCount: completedReminders,
      pendingCount: pendingReminders,
      label: reminders.length > 0
        ? `${pendingReminders} active reminder${pendingReminders === 1 ? '' : 's'} (${completedReminders} completed)`
        : 'No reminders added yet',
    },
  }
}

module.exports = {
  evaluateItineraryFeasibility,
  generateSmartPackingChecklist,
  calculateTravelReadiness,
  parseTimeToMinutes,
}
