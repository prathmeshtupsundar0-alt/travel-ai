
const BASE_TIMEOUT = 15000;
const MAX_RETRIES = 2;

// In-memory cache
const geoCache = new Map();
const weatherCache = new Map();
const pendingRequests = new Map();

const GEO_CACHE_TTL = 24 * 60 * 60 * 1000;
const WEATHER_CACHE_TTL = 10 * 60 * 1000;

async function fetchWithRetry(url) {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(BASE_TIMEOUT),
        headers: {
          Accept: 'application/json'
        }
      });

      // Never repeatedly retry rate-limit errors
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');

        throw new Error(
          `Weather API rate limit reached (${new URL(url).hostname}). Retry after: ${retryAfter || 'unknown'}`
        );
      }

      if (response.status >= 500 && attempt < MAX_RETRIES) {
        throw new Error(`Weather API server error: ${response.status}`);
      }

      if (!response.ok) {
        throw new Error(
          `Weather API HTTP error: ${response.status} (${new URL(url).hostname})`
        );
      }

      return await response.json();

    } catch (error) {
      lastError = error;

      if (error.message.includes('rate limit')) {
        throw error;
      }

      console.error(
        `Weather request attempt ${attempt + 1} failed:`,
        error.message
      );

      if (attempt < MAX_RETRIES) {
        await new Promise(resolve =>
          setTimeout(resolve, 1000 * (attempt + 1))
        );
      }
    }
  }

  throw lastError;
}

async function getCached(key, cache, ttl, fetchFunction) {
  const cached = cache.get(key);

  if (cached && Date.now() - cached.time < ttl) {
    return cached.data;
  }

  if (pendingRequests.has(key)) {
    return pendingRequests.get(key);
  }

  const request = (async () => {
    try {
      const data = await fetchFunction();

      cache.set(key, {
        data,
        time: Date.now()
      });

      return data;
    } finally {
      pendingRequests.delete(key);
    }
  })();

  pendingRequests.set(key, request);

  return request;
}

async function getWeather(destination) {
  if (!destination || !destination.trim()) {
    throw new Error('A valid destination is required.');
  }

  try {
    const city = destination.trim().toLowerCase();

    // Step 1: Geocoding with cache
    const place = await getCached(
      `geo:${city}`,
      geoCache,
      GEO_CACHE_TTL,
      async () => {
        const url = new URL(
          'https://geocoding-api.open-meteo.com/v1/search'
        );

        url.search = new URLSearchParams({
          name: destination.trim(),
          count: '1',
          language: 'en',
          format: 'json'
        }).toString();

        const geo = await fetchWithRetry(url.toString());

        return geo?.results?.[0] || null;
      }
    );

    if (!place) {
      throw new Error('Destination could not be located.');
    }

    // Step 2: Current weather with cache
    const weatherKey =
      `weather:${place.latitude}:${place.longitude}`;

    const data = await getCached(
      weatherKey,
      weatherCache,
      WEATHER_CACHE_TTL,
      async () => {
        const url = new URL(
          'https://api.open-meteo.com/v1/forecast'
        );

        url.search = new URLSearchParams({
          latitude: String(place.latitude),
          longitude: String(place.longitude),
          current: 'temperature_2m,weather_code'
        }).toString();

        return await fetchWithRetry(url.toString());
      }
    );

    if (!data?.current) {
      throw new Error('Weather data is unavailable.');
    }

    return {
      location: place.name,
      temperature: data.current.temperature_2m,
      weatherCode: data.current.weather_code,
      unit: '°C',
      fetchedAt: new Date()
    };

  } catch (error) {
    console.error('Weather Service Error:', error.message);
    throw error;
  }
}

module.exports = { getWeather };
