import Database from "better-sqlite3";

// Define the row structure for SQLite readings
type ReadingRow = {
  timestamp: string;
  temperature: number;
  humidity: number;
  pressure: number;
};

// Define the EnvironmentalData structure
type WeatherData = {
  temperature: number;
  feelsLike: number;
  humidity: number;
  pressure: number;
};

type HistoricalData = {
  timestamp: string;
  temperature: number;
  humidity: number;
  pressure: number;
};

// Initialize the database
const db = new Database("/home/pi/environment.db");

// Helper function: Calculate "feels like" temperature
const calculateFeelsLike = (temperature: number, humidity: number): number => {
  return temperature + 0.1 * humidity - 5; // Example formula
};

// Fetch the latest data
export const fetchLatestData = (): WeatherData => {
  const stmt = db.prepare(`
    SELECT timestamp, temperature, humidity, pressure
    FROM readings
    ORDER BY timestamp DESC
    LIMIT 1
  `);

  // Explicitly pass undefined since no parameters are required
  const result = stmt.get(undefined) as ReadingRow;

  if (!result) {
    throw new Error("No data found in the database");
  }

  return {
    temperature: result.temperature,
    feelsLike: calculateFeelsLike(result.temperature, result.humidity),
    humidity: result.humidity,
    pressure: result.pressure,
  };
};

// Fetch historical data
export const fetchHistoricalData = (): HistoricalData[] => {
  const stmt = db.prepare(`
    SELECT timestamp, temperature, humidity, pressure
    FROM readings
    ORDER BY timestamp DESC
    LIMIT 24
  `);

  // Explicitly pass undefined since no parameters are required
  const results = stmt.all(undefined) as ReadingRow[];

  return results.map((row) => ({
    timestamp: row.timestamp,
    temperature: row.temperature,
    humidity: row.humidity,
    pressure: row.pressure,
  }));
};
