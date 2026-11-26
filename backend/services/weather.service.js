const BASE_TIMEOUT = 15000
const MAX_RETRIES = 2

const geoCache = new Map()
const weatherCache = new Map()
const pendingRequests = new Map()

const GEO_CACHE_TTL = 24 * 60 * 60 * 1000
const WEATHER_CACHE_TTL = 10 * 60 * 1000

const WMO_LABELS = {
  0: { label: 'Clear sky', isRainOrExtreme: false },
  1: { label: 'Mainly clear', isRainOrExtreme: false },
  2: { label: 'Partly cloudy', isRainOrExtreme: false },
  3: { label: 'Overcast', isRainOrExtreme: false },
  45: { label: 'Foggy', isRainOrExtreme: false },
  48: { label: 'Depositing rime fog', isRainOrExtreme: false },
  51: { label: 'Light drizzle', isRainOrExtreme: true },
  53: { label: 'Moderate drizzle', isRainOrExtreme: true },
  55: { label: 'Dense drizzle', isRainOrExtreme: true },
  56: { label: 'Light freezing drizzle', isRainOrExtreme: true },
  57: { label: 'Dense freezing drizzle', isRainOrExtreme: true },
  61: { label: 'Slight rain', isRainOrExtreme: true },
  63: { label: 'Moderate rain', isRainOrExtreme: true },
  65: { label: 'Heavy rain', isRainOrExtreme: true },
  66: { label: 'Light freezing rain', isRainOrExtreme: true },
  67: { label: 'Heavy freezing rain', isRainOrExtreme: true },
  71: { label: 'Slight snowfall', isRainOrExtreme: true },
  73: { label: 'Moderate snowfall', isRainOrExtreme: true },
  75: { label: 'Heavy snowfall', isRainOrExtreme: true },
  77: { label: 'Snow grains', isRainOrExtreme: true },
  80: { label: 'Slight rain showers', isRainOrExtreme: true },
  81: { label: 'Moderate rain showers', isRainOrExtreme: true },
  82: { label: 'Violent rain showers', isRainOrExtreme: true },
  85: { label: 'Slight snow showers', isRainOrExtreme: true },
  86: { label: 'Heavy snow showers', isRainOrExtreme: true },
  95: { label: 'Thunderstorm', isRainOrExtreme: true },
  96: { label: 'Thunderstorm with slight hail', isRainOrExtreme: true },
  99: { label: 'Thunderstorm with heavy hail', isRainOrExtreme: true },
}

function describeWeather(code, temperature, precipProb = 0) {
  const numCode = Number(code)
  const entry = WMO_LABELS[numCode] || { label: `Weather code ${numCode}`, isRainOrExtreme: numCode >= 51 }
  const temp = Number(temperature)
  const extremeTemp = Number.isFinite(temp) && (temp >= 38 || temp <= 0)
  const highPrecip = Number(precipProb) >= 55
  const isRainOrExtreme = Boolean(entry.isRainOrExtreme || extremeTemp || highPrecip)
  let advisory = null
  if (entry.isRainOrExtreme || highPrecip) {
    advisory = `${entry.label}${highPrecip ? ` (${precipProb}% precipitation chance)` : ''} — consider indoor alternatives for outdoor activities.`
  } else if (extremeTemp) {
    advisory = temp >= 38
      ? `Extreme heat (${temp}°C) — schedule outdoor sightseeing for early morning/evening or consider indoor venues.`
      : `Freezing conditions (${temp}°C) — dress warmly and consider indoor breaks.`
  }
  return {
    conditionLabel: entry.label,
    isRainOrExtreme,
    advisory,
  }
}

async function fetchWithRetry(url) {
  let lastError
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(BASE_TIMEOUT),
        headers: { Accept: 'application/json' },
      })
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after')
        throw new Error(`Weather API rate limit reached (${new URL(url).hostname}). Retry after: ${retryAfter || 'unknown'}`)
      }
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        throw new Error(`Weather API server error: ${response.status}`)
      }
      if (!response.ok) {
        throw new Error(`Weather API HTTP error: ${response.status} (${new URL(url).hostname})`)
      }
      return await response.json()
    } catch (error) {
      lastError = error
      if (error.message.includes('rate limit')) throw error
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)))
      }
    }
  }
  throw lastError
}

async function getCached(key, cache, ttl, fetchFunction) {
  const cached = cache.get(key)
  if (cached && Date.now() - cached.time < ttl) return cached.data
  if (pendingRequests.has(key)) return pendingRequests.get(key)
  const request = (async () => {
    try {
      const data = await fetchFunction()
      cache.set(key, { data, time: Date.now() })
      return data
    } finally {
      pendingRequests.delete(key)
    }
  })()
  pendingRequests.set(key, request)
  return request
}

async function getWeather(destination) {
  if (!destination || !destination.trim()) {
    throw new Error('A valid destination is required.')
  }
  const city = destination.trim().toLowerCase()
  const place = await getCached(`geo:${city}`, geoCache, GEO_CACHE_TTL, async () => {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
    url.search = new URLSearchParams({
      name: destination.trim(),
      count: '1',
      language: 'en',
      format: 'json',
    }).toString()
    const geo = await fetchWithRetry(url.toString())
    return geo?.results?.[0] || null
  })

  if (!place) {
    throw new Error('Destination could not be located for weather.')
  }

  const weatherKey = `weather:${place.latitude}:${place.longitude}`
  const data = await getCached(weatherKey, weatherCache, WEATHER_CACHE_TTL, async () => {
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.search = new URLSearchParams({
      latitude: String(place.latitude),
      longitude: String(place.longitude),
      current: 'temperature_2m,weather_code',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      timezone: 'auto',
    }).toString()
    return await fetchWithRetry(url.toString())
  })

  if (!data?.current) {
    throw new Error('Weather provider is currently unavailable.')
  }

  const currentMeta = describeWeather(data.current.weather_code, data.current.temperature_2m)
  const dailyForecast = Array.isArray(data.daily?.time)
    ? data.daily.time.map((dateStr, idx) => {
        const code = data.daily.weather_code?.[idx] ?? 0
        const tempMax = data.daily.temperature_2m_max?.[idx] ?? null
        const tempMin = data.daily.temperature_2m_min?.[idx] ?? null
        const precipProb = data.daily.precipitation_probability_max?.[idx] ?? 0
        const meta = describeWeather(code, tempMax, precipProb)
        return {
          date: dateStr,
          weatherCode: code,
          tempMax,
          tempMin,
          precipitationProbability: precipProb,
          conditionLabel: meta.conditionLabel,
          isRainOrExtreme: meta.isRainOrExtreme,
          advisory: meta.advisory,
        }
      })
    : []

  return {
    location: place.name,
    country: place.country || '',
    temperature: data.current.temperature_2m,
    weatherCode: data.current.weather_code,
    conditionLabel: currentMeta.conditionLabel,
    isRainOrExtreme: currentMeta.isRainOrExtreme,
    advisory: currentMeta.advisory,
    unit: '°C',
    dailyForecast,
    supportedForecastDays: dailyForecast.length,
    forecastWindowStart: dailyForecast[0]?.date || null,
    forecastWindowEnd: dailyForecast[dailyForecast.length - 1]?.date || null,
    fetchedAt: new Date(),
  }
}

module.exports = { getWeather, describeWeather }
