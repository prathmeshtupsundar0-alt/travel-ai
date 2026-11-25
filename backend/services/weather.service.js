
const BASE_TIMEOUT = 15000;
const MAX_RETRIES = 2;

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

      if (!response.ok) {
        throw new Error(`Weather API HTTP error: ${response.status}`);
      }

      return await response.json();

    } catch (error) {
      lastError = error;

      console.error(`Weather API attempt ${attempt + 1} failed:`, error.message);

      if (attempt < MAX_RETRIES) {
        await new Promise(resolve =>
          setTimeout(resolve, 1000 * (attempt + 1))
        );
      }
    }
  }

  throw lastError;
}

async function getWeather(destination) {
  if (!destination || !destination.trim()) {
    throw new Error('A valid destination is required.');
  }

  try {
    // Step 1: Find destination coordinates
    const geoUrl = new URL(
      'https://geocoding-api.open-meteo.com/v1/search'
    );

    geoUrl.search = new URLSearchParams({
      name: destination.trim(),
      count: '1',
      language: 'en',
      format: 'json'
    }).toString();

    const geo = await fetchWithRetry(geoUrl.toString());
    const place = geo?.results?.[0];

    if (!place) {
      throw new Error('Destination could not be located for weather.');
    }

    // Step 2: Fetch current weather
    const weatherUrl = new URL(
      'https://api.open-meteo.com/v1/forecast'
    );

    weatherUrl.search = new URLSearchParams({
      latitude: String(place.latitude),
      longitude: String(place.longitude),
      current: 'temperature_2m,weather_code'
    }).toString();

    const data = await fetchWithRetry(weatherUrl.toString());

    if (!data?.current) {
      throw new Error('Weather data is unavailable.');
    }

    // Step 3: Return weather response
    return {
      location: place.name,
      temperature: data.current.temperature_2m,
      weatherCode: data.current.weather_code,
      unit: '°C',
      fetchedAt: new Date()
    };

  } catch (error) {
    console.error('Weather Service Error:', error);

    throw new Error(
      `Weather provider is currently unavailable: ${error.message}`
    );
  }
}

module.exports = { getWeather };
