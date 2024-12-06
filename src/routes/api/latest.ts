import { Hono } from "hono";
import { fetchLatestData, fetchHistoricalData } from "../../services/environment/environment.service";

const api = new Hono();

// Helper function to convert Celsius to Fahrenheit
const toFahrenheit = (celsius: number): number => (celsius * 9) / 5 + 32;

api.get("/", (c) => {
  try {
    const weather = fetchLatestData();
    const historical = fetchHistoricalData();

    // Add Fahrenheit data
    const response = {
      weather: {
        ...weather,
        temperatureF: toFahrenheit(weather.temperature),
        feelsLikeF: toFahrenheit(weather.feelsLike),
      },
      historical: historical.map((entry) => ({
        ...entry,
        temperatureF: toFahrenheit(entry.temperature),
      })),
    };

    return c.json(response);
  } catch (err) {
    // Explicitly cast error type
    const error = err instanceof Error ? err : new Error("Unknown error occurred");
    return c.json({ error: error.message }, 500);
  }
});

export default api;
