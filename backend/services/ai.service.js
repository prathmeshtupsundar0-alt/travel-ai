const mongoose = require('mongoose')
const { inferActivityCategory, inferIsOutdoor } = require('../utils/budgetCalculator')

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash'
let discoveredModelsCache = null

async function resolveSupportedModels() {
  if (discoveredModelsCache) return discoveredModelsCache
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`
    )
    if (!res.ok) return []
    const data = await res.json()
    const models = Array.isArray(data?.models) ? data.models : []
    const generateModels = models
      .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => String(m.name || '').replace(/^models\//, ''))
      .filter((name) => name.startsWith('gemini') && !name.includes('tts') && !name.includes('image') && !name.includes('robotics') && !name.includes('computer-use'))
    const flashModels = generateModels.filter((name) => name.includes('flash'))
    discoveredModelsCache = [...flashModels, ...generateModels.filter((n) => !n.includes('flash'))].slice(0, 4)
    return discoveredModelsCache
  } catch {
    return []
  }
}

class GeminiError extends Error {
  constructor(message, { statusCode = 502, type = 'gemini_error', details = 'The Gemini API could not complete the request.' } = {}) {
    super(message)
    this.name = 'GeminiError'
    this.statusCode = statusCode
    this.type = type
    this.details = details
  }
}

const safeDetails = (value) =>
  String(value || 'No additional details were provided by Gemini.')
    .replace(/AIza[\w-]+/g, '[redacted API key]')
    .slice(0, 500)

function stripCodeFences(text) {
  return String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

async function callGeminiJson(prompt, contextMeta = {}) {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key') {
    throw new GeminiError('Gemini request failed', {
      statusCode: 503,
      type: 'configuration_error',
      details: 'GEMINI_API_KEY is not configured on the server.',
    })
  }

  const candidateModels = [GEMINI_MODEL]
  let lastErr = null
  for (let i = 0; i < candidateModels.length; i++) {
    const model = candidateModels[i]
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`
    let response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      })
    } catch (error) {
      lastErr = new GeminiError('Gemini request failed', {
        statusCode: 503,
        type: 'network_error',
        details: 'The server could not reach Gemini. Please try again shortly.',
      })
      continue
    }

    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      const details = safeDetails(body?.error?.message)
      if ((response.status === 404 || response.status === 503 || response.status === 429) && i === 0) {
        const discoveredList = await resolveSupportedModels()
        for (const m of discoveredList) {
          if (m && !candidateModels.includes(m)) candidateModels.push(m)
        }
      }
      if ((response.status === 404 || response.status === 503 || response.status === 429) && i < candidateModels.length - 1) {
        lastErr = new GeminiError('Gemini request failed', {
          statusCode: response.status >= 400 && response.status < 500 ? 502 : 503,
          type: body?.error?.status || 'api_error',
          details,
        })
        continue
      }
      throw new GeminiError('Gemini request failed', {
        statusCode: response.status >= 400 && response.status < 500 ? 502 : 503,
        type: body?.error?.status || 'api_error',
        details,
      })
    }

    const rawText = body.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('')
    if (!rawText || !rawText.trim()) {
      throw new GeminiError('Gemini request failed', {
        type: 'empty_response',
        details: 'Gemini returned an empty response.',
      })
    }

    try {
      return JSON.parse(stripCodeFences(rawText))
    } catch {
      throw new GeminiError('Gemini request failed', {
        type: 'invalid_json',
        details: 'Gemini returned content that was not valid JSON.',
      })
    }
  }

  throw lastErr || new GeminiError('Gemini request failed')
}

function normalizeActivity(activity = {}, destination = '') {
  const title = typeof (activity.title || activity.activity || activity.name) === 'string'
    ? (activity.title || activity.activity || activity.name).trim()
    : ''
  const description = typeof activity.description === 'string' ? activity.description.trim() : ''
  const time = typeof activity.time === 'string' ? activity.time.trim() : ''
  const estimatedCost = Number.isFinite(Number(activity.estimatedCost)) && Number(activity.estimatedCost) >= 0
    ? Math.round(Number(activity.estimatedCost))
    : 0
  const location = typeof activity.location === 'string' && activity.location.trim()
    ? activity.location.trim()
    : destination
  const notes = typeof activity.notes === 'string' ? activity.notes.trim() : ''
  const durationMinutes = Number.isFinite(Number(activity.durationMinutes)) && Number(activity.durationMinutes) > 0
    ? Math.round(Number(activity.durationMinutes))
    : 90
  const category = inferActivityCategory({ ...activity, title, description })
  const isOutdoor = inferIsOutdoor({ ...activity, title, description, category })

  return {
    id: typeof activity.id === 'string' && activity.id.trim() ? activity.id.trim() : new mongoose.Types.ObjectId().toString(),
    time,
    title,
    description,
    estimatedCost,
    category,
    location,
    notes,
    durationMinutes,
    isOutdoor,
  }
}

function parseItinerary(itinerary, trip = {}) {
  if (!itinerary || !Array.isArray(itinerary.days) || !itinerary.days.length) {
    throw new GeminiError('Gemini itinerary generation failed', {
      type: 'invalid_structure',
      details: 'Gemini returned JSON without one or more itinerary days.',
    })
  }

  const excludedTerms = [
    ...(trip?.itineraryPreferences?.excludedActivities || []),
    ...(trip?.itineraryPreferences?.excludedCategories || []),
  ]
    .map((s) => String(s || '').trim().toLowerCase())
    .filter(Boolean)

  const days = itinerary.days.map((entry, index) => {
    const rawActivities = Array.isArray(entry?.activities) ? entry.activities : []
    let activities = rawActivities
      .filter((activity) => activity && typeof activity === 'object')
      .map((activity) => normalizeActivity(activity, trip.destination || ''))
      .filter((activity) => activity.title)

    if (excludedTerms.length > 0 && activities.length > 1) {
      const filtered = activities.filter((act) => {
        const hay = `${act.title} ${act.description} ${act.category}`.toLowerCase()
        return !excludedTerms.some((term) => hay.includes(term))
      })
      if (filtered.length > 0) activities = filtered
    }

    const estimatedDayCost = activities.reduce((sum, act) => sum + (Number(act.estimatedCost) || 0), 0)

    return {
      day: Number.isInteger(entry?.day) && entry.day > 0 ? entry.day : index + 1,
      title: typeof entry?.title === 'string' && entry.title.trim() ? entry.title.trim() : `Day ${index + 1}`,
      activities,
      estimatedDayCost,
    }
  })

  if (days.some((day) => day.activities.length === 0)) {
    throw new GeminiError('Gemini itinerary generation failed', {
      type: 'invalid_structure',
      details: 'Gemini returned an itinerary day without activities.',
    })
  }

  const localTips = Array.isArray(itinerary.localTips)
    ? itinerary.localTips
        .filter((t) => t && typeof t === 'object' && (t.advice || t.title))
        .map((t) => ({
          category: String(t.category || 'General').trim(),
          title: String(t.title || t.category || 'Travel tip').trim(),
          advice: String(t.advice || t.description || '').trim(),
        }))
    : []

  return {
    summary: typeof itinerary.summary === 'string' ? itinerary.summary.trim() : '',
    days,
    tips: Array.isArray(itinerary.tips)
      ? itinerary.tips.filter((tip) => typeof tip === 'string').map((tip) => tip.trim()).filter(Boolean)
      : [],
    localTips,
  }
}

async function generateItinerary(trip) {
  const prefs = trip.itineraryPreferences || {}
  const exclusions = [
    ...(prefs.excludedActivities || []),
    ...(prefs.excludedCategories || []),
  ].filter(Boolean)

  const exclusionDirective = exclusions.length > 0
    ? `STRICT EXCLUSIONS — Do NOT include any activities matching: ${exclusions.join(', ')}.`
    : 'Avoid unnecessary ultra-expensive luxury activities (such as helicopter tours, extreme adventure sports, or nightclubs) unless the user preference explicitly requests them.'

  const paceDirective = prefs.pace === 'Relaxed'
    ? 'Keep daily schedules relaxed with 3 well-paced activities per day and generous downtime.'
    : prefs.pace === 'Packed'
      ? 'Create an energetic schedule with 4–5 well-sequenced activities per day.'
      : 'Create a balanced schedule with 3–4 realistic activities per day combining sightseeing, local food, relaxation, and exploration.'

  const prompt = `Create a realistic, practical travel itinerary as JSON only.
Currency must be INR and all prices are estimated costs, never live bookings.
Destination: ${trip.destination}
Starting location: ${trip.startLocation}
Duration: ${trip.days} days
Travelers: ${trip.travelers}
Total available budget: INR ${trip.budget}
Travel style preference: ${trip.preference}
${paceDirective}
${exclusionDirective}
${prefs.customNotes ? `Additional traveler notes: ${prefs.customNotes}` : ''}

Ensure realistic chronological start times (e.g. "09:00 AM", "12:30 PM", "03:30 PM", "07:30 PM"), practical transit buffers, specific locations within ${trip.destination}, and keep the total estimated cost across all days within INR ${trip.budget}.
Return strictly valid JSON with this exact schema:
{
  "summary": "Brief overview of the trip",
  "days": [
    {
      "day": 1,
      "title": "Day theme title",
      "activities": [
        {
          "time": "09:00 AM",
          "title": "Activity name",
          "description": "Practical details and what to expect",
          "estimatedCost": 1500,
          "category": "Activities | Food | Transportation | Accommodation | Local Transport | Shopping | Miscellaneous",
          "location": "Specific neighborhood or landmark in ${trip.destination}",
          "notes": "Helpful tip or duration note",
          "durationMinutes": 90,
          "isOutdoor": true
        }
      ],
      "estimatedDayCost": 1500
    }
  ],
  "tips": ["Practical tip 1", "Practical tip 2"],
  "localTips": [
    {"category": "Local Transportation", "title": "Getting around ${trip.destination}", "advice": "..."},
    {"category": "Common Tourist Mistakes", "title": "What to avoid", "advice": "..."},
    {"category": "Local Customs & Etiquette", "title": "Cultural norms", "advice": "..."},
    {"category": "Safety Precautions", "title": "Staying safe", "advice": "..."},
    {"category": "Currency & Payments", "title": "Money tips", "advice": "..."},
    {"category": "Useful Local Phrases", "title": "Key expressions", "advice": "..."},
    {"category": "Best Time to Visit Attractions", "title": "Crowd & timing advice", "advice": "..."}
  ]
}`

  console.info('Gemini request started', { tripId: String(trip._id), apiKeyConfigured: true, model: GEMINI_MODEL })
  try {
    const rawJson = await callGeminiJson(prompt, { tripId: String(trip._id) })
    const itinerary = parseItinerary(rawJson, trip)
    console.info('Gemini itinerary generated', { tripId: String(trip._id), model: GEMINI_MODEL, days: itinerary.days.length })
    return itinerary
  } catch (error) {
    if (error.name === 'GeminiError') {
      console.error('Gemini itinerary generation failed', { tripId: String(trip._id), type: error.type, message: safeDetails(error.details || error.message) })
      throw error
    }
    throw new GeminiError('Gemini itinerary generation failed', {
      statusCode: 502,
      type: error.name || 'gemini_error',
      details: safeDetails(error.message),
    })
  }
}

function buildContextualFallbackAlternatives(trip, { dayNumber, activity }) {
  const dest = trip.destination || 'the destination'
  const origCost = Math.max(0, Number(activity?.estimatedCost) || 1500)
  const lowerCost = Math.round(origCost * 0.45)
  const moderateCost = Math.round(origCost * 0.65)
  const budgetFriendlyCost = Math.min(800, Math.round(origCost * 0.25))
  const time = activity?.time || '10:00 AM'

  return [
    {
      id: new mongoose.Types.ObjectId().toString(),
      time,
      title: `${dest} Cultural & Heritage Walking Discovery`,
      description: `Guided or self-paced exploration of iconic landmarks, local architecture, and scenic viewpoints in ${dest} tailored for ${trip.preference || 'Balanced'} travelers.`,
      estimatedCost: lowerCost,
      category: 'Activities',
      location: `${dest} Historic Quarter`,
      notes: 'Estimated cost; flexible pacing with great photography spots.',
      durationMinutes: 120,
      isOutdoor: true,
      whySuitable: `Lower-cost, ground-level cultural alternative to "${activity?.title}" on Day ${dayNumber}.`,
    },
    {
      id: new mongoose.Types.ObjectId().toString(),
      time,
      title: `Local Culinary & Artisan Market Experience in ${dest}`,
      description: `Sample authentic regional specialties, visit vibrant local craft stalls, and experience everyday culture in ${dest}.`,
      estimatedCost: moderateCost,
      category: 'Food',
      location: `${dest} Central Market District`,
      notes: 'Estimated food & tasting cost for the group.',
      durationMinutes: 90,
      isOutdoor: false,
      whySuitable: `Combines local cuisine and cultural immersion within your INR ${Number(trip.budget || 0).toLocaleString('en-IN')} budget.`,
    },
    {
      id: new mongoose.Types.ObjectId().toString(),
      time,
      title: `${dest} Museum, Art Gallery & Scenic Café Relaxation`,
      description: `Indoor curated museum or gallery visit followed by a relaxed café stop overlooking ${dest}.`,
      estimatedCost: budgetFriendlyCost,
      category: 'Activities',
      location: `${dest} Cultural Center`,
      notes: 'Weather-safe indoor option with minimal physical strain.',
      durationMinutes: 120,
      isOutdoor: false,
      whySuitable: `Budget-friendly, weather-proof indoor alternative that avoids high-cost or high-intensity excursions.`,
    },
  ]
}

async function generateActivityAlternatives(trip, { dayNumber, activity, userReason = '' }) {
  const existingTitles = (trip.itinerary?.days || [])
    .flatMap((d) => (d.activities || []).map((a) => a.title))
    .filter(Boolean)

  const prefs = trip.itineraryPreferences || {}
  const exclusions = [
    ...(prefs.excludedActivities || []),
    ...(prefs.excludedCategories || []),
    activity.title,
  ].filter(Boolean)

  const currentEstimatedTotal = Number(trip.budgetBreakdown?.estimatedTotal || 0)
  const remainingBudget = Number(trip.budget || 0) - currentEstimatedTotal + Number(activity.estimatedCost || 0)

  const prompt = `Suggest exactly 3 realistic alternative travel activities as JSON only to replace an unwanted activity in an existing itinerary.
All costs must be in INR and are estimated costs only.
Destination: ${trip.destination}
Day number: Day ${dayNumber} of ${trip.days}
Travelers: ${trip.travelers}
Travel preference: ${trip.preference}
Total trip budget: INR ${trip.budget}
Available budget for this activity slot: INR ${Math.max(0, remainingBudget)}
Activity being replaced: "${activity.title}" (Time: ${activity.time || 'Flexible'}, Cost: INR ${activity.estimatedCost || 0}, Category: ${activity.category || 'Activities'}, Location: ${activity.location || trip.destination})
${userReason ? `User's reason / request for replacement: ${userReason}` : ''}
Strictly exclude: ${exclusions.join(', ')}
Do NOT duplicate existing itinerary activities: ${existingTitles.slice(0, 25).join('; ')}

Provide 3 distinct, practical alternatives (e.g., 1 scenic/cultural option, 1 culinary/local experience, 1 budget-friendly or indoor option) that fit the time slot "${activity.time || '10:00 AM'}".
Return strictly JSON:
{
  "alternatives": [
    {
      "time": "${activity.time || '10:00 AM'}",
      "title": "Alternative activity title",
      "description": "Clear description of the activity",
      "estimatedCost": 1200,
      "category": "Activities | Food | Local Transport | Shopping",
      "location": "Specific location in ${trip.destination}",
      "notes": "Practical tip",
      "durationMinutes": 90,
      "isOutdoor": true,
      "whySuitable": "One sentence explaining why this is a great fit"
    }
  ]
}`

  try {
    const data = await callGeminiJson(prompt, { tripId: String(trip._id), action: 'activity_alternatives' })
    const rawList = Array.isArray(data?.alternatives) ? data.alternatives : []
    const alternatives = rawList
      .filter((item) => item && typeof item === 'object' && (item.title || item.name))
      .slice(0, 3)
      .map((item) => ({
        ...normalizeActivity(item, trip.destination),
        time: item.time || activity.time || '10:00 AM',
        whySuitable: typeof item.whySuitable === 'string' ? item.whySuitable.trim() : 'Tailored to your destination, preferences, and budget.',
      }))

    if (alternatives.length >= 2) {
      return { alternatives, source: 'gemini_ai' }
    }
  } catch (error) {
    console.warn('Gemini alternatives fallback triggered:', safeDetails(error.details || error.message))
  }

  return {
    alternatives: buildContextualFallbackAlternatives(trip, { dayNumber, activity }),
    source: 'contextual_ai_assistant',
  }
}

async function generateBudgetOptimization(trip) {
  const days = Array.isArray(trip.itinerary?.days) ? trip.itinerary.days : []
  const estimatedTotal = Number(trip.budgetBreakdown?.estimatedTotal || 0)
  const budget = Number(trip.budget || 0)
  const exceededBy = Math.max(0, estimatedTotal - budget)

  const allActivities = days.flatMap((d) =>
    (d.activities || []).map((a) => ({
      day: d.day,
      id: a.id,
      title: a.title,
      estimatedCost: Number(a.estimatedCost || 0),
      category: a.category || 'Activities',
    }))
  )
  const sortedByCost = [...allActivities].sort((a, b) => b.estimatedCost - a.estimatedCost).slice(0, 6)

  const prompt = `Analyze this travel itinerary's estimated costs and provide practical cost optimization suggestions as JSON only.
Do NOT modify the itinerary automatically — only provide actionable recommendations for the traveler.
Destination: ${trip.destination} (${trip.days} days, ${trip.travelers} travelers)
Available budget: INR ${budget}
Current estimated trip cost: INR ${estimatedTotal}
Amount over budget: INR ${exceededBy}
Highest-cost planned activities: ${JSON.stringify(sortedByCost)}

Return strictly JSON:
{
  "summary": "Brief cost optimization summary",
  "recommendations": [
    {
      "day": 1,
      "targetActivity": "Name of expensive activity",
      "currentCost": 15000,
      "suggestedAlternative": "Specific lower-cost alternative in ${trip.destination}",
      "estimatedNewCost": 3500,
      "estimatedSavings": 11500,
      "advice": "Why this saves money without sacrificing the trip experience"
    }
  ]
}`

  try {
    const data = await callGeminiJson(prompt, { tripId: String(trip._id), action: 'budget_optimization' })
    if (Array.isArray(data?.recommendations) && data.recommendations.length > 0) {
      return {
        summary: String(data.summary || `Identified ways to save toward your INR ${budget.toLocaleString('en-IN')} budget.`),
        recommendations: data.recommendations.slice(0, 4).map((r) => ({
          day: Number(r.day) || 1,
          targetActivity: String(r.targetActivity || ''),
          currentCost: Math.max(0, Number(r.currentCost) || 0),
          suggestedAlternative: String(r.suggestedAlternative || ''),
          estimatedNewCost: Math.max(0, Number(r.estimatedNewCost) || 0),
          estimatedSavings: Math.max(0, Number(r.estimatedSavings) || 0),
          advice: String(r.advice || ''),
        })),
        source: 'gemini_ai',
      }
    }
  } catch (error) {
    console.warn('Gemini budget optimization fallback triggered:', safeDetails(error.details || error.message))
  }

  const fallbackRecs = sortedByCost.slice(0, 3).map((item) => {
    const newCost = Math.round(item.estimatedCost * 0.4)
    const savings = Math.max(0, item.estimatedCost - newCost)
    return {
      day: item.day,
      targetActivity: item.title,
      currentCost: item.estimatedCost,
      suggestedAlternative: `Switch "${item.title}" to a self-guided or public-access experience in ${trip.destination}`,
      estimatedNewCost: newCost,
      estimatedSavings: savings,
      advice: `Using "Replace with AI Suggestion" or editing this activity on Day ${item.day} can save approximately INR ${savings.toLocaleString('en-IN')}.`,
    }
  })

  return {
    summary: exceededBy > 0
      ? `Your estimated itinerary exceeds your INR ${budget.toLocaleString('en-IN')} budget by INR ${exceededBy.toLocaleString('en-IN')}. Adjusting the highest-cost activities below can bring the plan back within budget.`
      : `Here are optional cost-saving opportunities across your highest-cost activities in ${trip.destination}.`,
    recommendations: fallbackRecs,
    source: 'contextual_ai_assistant',
  }
}

async function generateLocalTravelTips(trip) {
  const dest = trip.destination || 'your destination'
  const prompt = `Generate practical, honest destination-specific travel tips for ${dest} (travelers: ${trip.travelers}, style: ${trip.preference}) as JSON only.
Avoid presenting uncertain live prices or dynamic rules as guaranteed facts; label estimates clearly.
Cover all 7 required categories:
1. Local Transportation
2. Common Tourist Mistakes
3. Local Customs & Etiquette
4. Safety Precautions
5. Currency & Payments
6. Useful Local Phrases
7. Best Time to Visit Attractions

Return strictly JSON:
{
  "localTips": [
    {"category": "Local Transportation", "title": "...", "advice": "..."},
    {"category": "Common Tourist Mistakes", "title": "...", "advice": "..."},
    {"category": "Local Customs & Etiquette", "title": "...", "advice": "..."},
    {"category": "Safety Precautions", "title": "...", "advice": "..."},
    {"category": "Currency & Payments", "title": "...", "advice": "..."},
    {"category": "Useful Local Phrases", "title": "...", "advice": "..."},
    {"category": "Best Time to Visit Attractions", "title": "...", "advice": "..."}
  ]
}`

  try {
    const data = await callGeminiJson(prompt, { tripId: String(trip._id), action: 'local_tips' })
    if (Array.isArray(data?.localTips) && data.localTips.length > 0) {
      return data.localTips.map((t) => ({
        category: String(t.category || 'General').trim(),
        title: String(t.title || t.category || 'Travel Tip').trim(),
        advice: String(t.advice || '').trim(),
      }))
    }
  } catch (error) {
    console.warn('Gemini local tips fallback triggered:', safeDetails(error.details || error.message))
  }

  return [
    {
      category: 'Local Transportation',
      title: `Getting around ${dest}`,
      advice: `Use official public transit, metered taxis, or reputable ride-hailing apps in ${dest}. Confirm estimated fares before boarding private transport.`,
    },
    {
      category: 'Common Tourist Mistakes',
      title: 'Overpacking the daily schedule',
      advice: `Avoid booking back-to-back attractions across different parts of ${dest} without accounting for local traffic and midday rest.`,
    },
    {
      category: 'Local Customs & Etiquette',
      title: 'Respecting local culture',
      advice: `Dress modestly when visiting heritage or religious sites in ${dest}, and always ask permission before photographing local residents.`,
    },
    {
      category: 'Safety Precautions',
      title: 'Staying safe & prepared',
      advice: `Keep digital copies of your ID, emergency contacts, and hotel address offline, and stay aware of your belongings in crowded transit hubs.`,
    },
    {
      category: 'Currency & Payments',
      title: 'Managing payments wisely',
      advice: `Carry a mix of digital payment methods/cards and smaller cash denominations for local markets, street food, and transit in ${dest}.`,
    },
    {
      category: 'Useful Local Phrases',
      title: 'Connecting with locals',
      advice: `Learning polite greetings, "Thank you", "How much is this?", and "Could you help me?" in the local language goes a long way in ${dest}.`,
    },
    {
      category: 'Best Time to Visit Attractions',
      title: 'Timing major sights',
      advice: `Visit popular outdoor landmarks in ${dest} early in the morning (before 9:30 AM) or late afternoon to avoid peak crowds and midday heat.`,
    },
  ]
}

module.exports = {
  generateItinerary,
  generateActivityAlternatives,
  generateBudgetOptimization,
  generateLocalTravelTips,
  normalizeActivity,
  GeminiError,
  GEMINI_MODEL,
}
