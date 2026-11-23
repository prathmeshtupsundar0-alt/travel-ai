const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash'

class GeminiError extends Error {
  constructor(message, { statusCode = 502, type = 'gemini_error', details = 'The Gemini API could not complete the request.' } = {}) {
    super(message); this.name = 'GeminiError'; this.statusCode = statusCode; this.type = type; this.details = details
  }
}
const safeDetails = (value) => String(value || 'No additional details were provided by Gemini.').replace(/AIza[\w-]+/g, '[redacted API key]').slice(0, 500)

function parseItinerary(text) {
  if (!text || !text.trim()) throw new GeminiError('Gemini itinerary generation failed', { type: 'empty_response', details: 'Gemini returned an empty response.' })
  let itinerary
  try { itinerary = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()) } catch { throw new GeminiError('Gemini itinerary generation failed', { type: 'invalid_json', details: 'Gemini returned content that was not valid JSON.' }) }
  if (!itinerary || !Array.isArray(itinerary.days) || !itinerary.days.length) throw new GeminiError('Gemini itinerary generation failed', { type: 'invalid_structure', details: 'Gemini returned JSON without one or more itinerary days.' })
  const days = itinerary.days.map((entry, index) => ({ day: Number.isInteger(entry?.day) && entry.day > 0 ? entry.day : index + 1, title: typeof entry?.title === 'string' ? entry.title.trim() : `Day ${index + 1}`, activities: Array.isArray(entry?.activities) ? entry.activities.filter((activity) => activity && typeof activity === 'object').map((activity) => ({ time: typeof activity.time === 'string' ? activity.time.trim() : '', title: typeof (activity.title || activity.activity) === 'string' ? (activity.title || activity.activity).trim() : '', description: typeof activity.description === 'string' ? activity.description.trim() : '', estimatedCost: Number.isFinite(Number(activity.estimatedCost)) && Number(activity.estimatedCost) >= 0 ? Number(activity.estimatedCost) : 0 })).filter((activity) => activity.title) : [], estimatedDayCost: Number.isFinite(Number(entry?.estimatedDayCost)) && Number(entry.estimatedDayCost) >= 0 ? Number(entry.estimatedDayCost) : 0 }))
  if (days.some((day) => day.activities.length === 0)) throw new GeminiError('Gemini itinerary generation failed', { type: 'invalid_structure', details: 'Gemini returned an itinerary day without activities.' })
  return { summary: typeof itinerary.summary === 'string' ? itinerary.summary.trim() : '', days, tips: Array.isArray(itinerary.tips) ? itinerary.tips.filter((tip) => typeof tip === 'string').map((tip) => tip.trim()).filter(Boolean) : [] }
}

async function generateItinerary(trip) {
  if (!process.env.GEMINI_API_KEY) throw new GeminiError('Gemini itinerary generation failed', { statusCode: 503, type: 'configuration_error', details: 'GEMINI_API_KEY is not configured on the server.' })
  const prompt = `Create a realistic travel itinerary as JSON only. Currency must be INR and all prices are estimates, never bookings or live prices. Destination: ${trip.destination}; starting location: ${trip.startLocation}; days: ${trip.days}; travelers: ${trip.travelers}; total budget: INR ${trip.budget}; preference: ${trip.preference}. Return exactly {"summary":"", "days":[{"day":1,"title":"","activities":[{"time":"","title":"","description":"","estimatedCost":0}],"estimatedDayCost":0}],"tips":[""]}. Include food, accommodation, local transport and activity estimates across the plan. Keep total reasonable within budget.`
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`
  console.info('Gemini request started', { tripId: String(trip._id), apiKeyConfigured: true, model: GEMINI_MODEL })
  let response
  try { response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }) }) } catch (error) { console.error('Gemini request failed', { tripId: String(trip._id), type: error.name, message: safeDetails(error.message) }); throw new GeminiError('Gemini itinerary generation failed', { statusCode: 503, type: 'network_error', details: 'The server could not reach Gemini. Please try again shortly.' }) }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) { const details = safeDetails(body?.error?.message); console.error('Gemini request failed', { tripId: String(trip._id), status: response.status, type: body?.error?.status || 'api_error', message: details }); throw new GeminiError('Gemini itinerary generation failed', { statusCode: response.status >= 400 && response.status < 500 ? 502 : 503, type: body?.error?.status || 'api_error', details }) }
  try { const itinerary = parseItinerary(body.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('')); console.info('Gemini itinerary generated', { tripId: String(trip._id), model: GEMINI_MODEL, days: itinerary.days.length }); return itinerary } catch (error) { console.error('Gemini response validation failed', { tripId: String(trip._id), type: error.type || error.name, message: safeDetails(error.details || error.message) }); throw error }
}
module.exports = { generateItinerary, GEMINI_MODEL }
