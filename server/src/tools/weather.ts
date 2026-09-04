import type { ToolDefinition } from '../types.js';

interface GeocodingResult {
  results?: Array<{
    name: string;
    latitude: number;
    longitude: number;
    country?: string;
    admin1?: string;
  }>;
}

interface WeatherResponse {
  current?: {
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    is_day: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  daily?: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
  };
}

const WEATHER_CODES: Record<number, string> = {
  0: '☀️ Clear sky',
  1: '🌤️ Mainly clear',
  2: '⛅ Partly cloudy',
  3: '☁️ Overcast',
  45: '🌫️ Fog',
  48: '🌫️ Depositing rime fog',
  51: '🌦️ Light drizzle',
  53: '🌦️ Moderate drizzle',
  55: '🌧️ Dense drizzle',
  61: '🌧️ Slight rain',
  63: '🌧️ Moderate rain',
  65: '🌧️ Heavy rain',
  71: '🌨️ Slight snow fall',
  73: '🌨️ Moderate snow fall',
  75: '❄️ Heavy snow fall',
  80: '🌦️ Slight rain showers',
  81: '🌧️ Moderate rain showers',
  82: '⛈️ Violent rain showers',
  95: '⛈️ Thunderstorm',
  96: '⛈️ Thunderstorm with slight hail',
  99: '⛈️ Thunderstorm with heavy hail',
};

async function getWeatherHandler(args: Record<string, unknown>): Promise<string> {
  const city = (args['city'] as string)?.trim() || 'London';

  try {
    // 1. Geocode city name to lat/long
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
    const geoRes = await fetch(geoUrl);
    if (!geoRes.ok) return `❌ Failed to lookup location for "${city}".`;
    
    const geoData = (await geoRes.json()) as GeocodingResult;
    if (!geoData.results || geoData.results.length === 0) {
      return `❌ Could not find coordinates for city: "${city}".`;
    }

    const loc = geoData.results[0];
    const { latitude, longitude, name, country, admin1 } = loc;

    // 2. Fetch current weather and 3-day forecast
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3`;
    const weatherRes = await fetch(weatherUrl);
    if (!weatherRes.ok) return `❌ Weather service unavailable for ${name}.`;

    const wData = (await weatherRes.json()) as WeatherResponse;
    const cur = wData.current;
    if (!cur) return `❌ No current weather data available for ${name}.`;

    const condition = WEATHER_CODES[cur.weather_code] || '⛅ Clear/Variable';
    const locString = [name, admin1, country].filter(Boolean).join(', ');

    let report = `🌤️ Weather Report for **${locString}**:\n` +
      `- Condition: **${condition}**\n` +
      `- Temperature: **${cur.temperature_2m}°C** (Feels like ${cur.apparent_temperature}°C)\n` +
      `- Humidity: **${cur.relative_humidity_2m}%**\n` +
      `- Wind Speed: **${cur.wind_speed_10m} km/h**\n` +
      `- Precipitation: **${cur.precipitation} mm**\n`;

    if (wData.daily && wData.daily.time) {
      report += `\n📅 **3-Day Forecast:**\n`;
      for (let i = 0; i < wData.daily.time.length; i++) {
        const date = wData.daily.time[i];
        const min = wData.daily.temperature_2m_min[i];
        const max = wData.daily.temperature_2m_max[i];
        const code = wData.daily.weather_code[i];
        const dayDesc = WEATHER_CODES[code] || 'Variable';
        report += `  • ${date}: ${dayDesc} (${min}°C – ${max}°C)\n`;
      }
    }

    return report;
  } catch (err) {
    return `❌ Error fetching weather: ${(err as Error).message}`;
  }
}

export const weatherTools: ToolDefinition[] = [
  {
    name: 'get_weather',
    description: 'Fetch real-time weather conditions and 3-day forecast for any global city or location (temperature, humidity, wind, conditions).',
    parameters: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: 'The city name (e.g. "San Francisco", "London", "Tokyo", "Chennai", "New York")',
        },
      },
      required: ['city'],
    },
    execute: getWeatherHandler,
  },
];
