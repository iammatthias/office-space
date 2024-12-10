import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";

// Type Definitions
export interface TimeRange {
  start: Date;
  end: Date;
}

export interface SummaryReading {
  date: number;
  [key: string]: number;
}

export interface SensorConfig {
  table: string; // Raw sensor data table
  dailySummary: string; // Precomputed daily summary table
  allTimeSummary: string; // Precomputed all-time summary table
  fields: string[];
}

export interface HistoricalReading {
  timestamp: string;
  sensorName: string;
  readings: Record<string, number>;
}

let db: Database;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, { data: any; timestamp: number }>();

export async function initDB() {
  db = await open({
    filename: "./db/sensor_data.db",
    driver: sqlite3.Database,
  });

  await db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA synchronous=NORMAL;
    PRAGMA cache_size=-2000;
    PRAGMA temp_store=MEMORY;
  `);

  console.log("Database connected successfully.");
}

export class EnvironmentService {
  private static readonly sensorConfig: Record<string, SensorConfig> = {
    Environmental: {
      table: "bme280_data",
      dailySummary: "bme280_daily_summary",
      allTimeSummary: "bme280_all_time_summary",
      fields: ["temperature", "humidity", "pressure"],
    },
    Light: {
      table: "tsl2591_data",
      dailySummary: "tsl2591_daily_summary",
      allTimeSummary: "tsl2591_all_time_summary",
      fields: ["light_intensity"],
    },
    UV: {
      table: "ltr390_data",
      dailySummary: "ltr390_daily_summary",
      allTimeSummary: "ltr390_all_time_summary",
      fields: ["uv_index"],
    },
    VOC: {
      table: "sgp40_data",
      dailySummary: "sgp40_daily_summary",
      allTimeSummary: "sgp40_all_time_summary",
      fields: ["voc_gas"],
    },
    Motion: {
      table: "motion_data",
      dailySummary: "motion_daily_summary",
      allTimeSummary: "motion_all_time_summary",
      fields: [
        "roll",
        "pitch",
        "yaw",
        "acceleration_x",
        "acceleration_y",
        "acceleration_z",
        "gyroscope_x",
        "gyroscope_y",
        "gyroscope_z",
        "magnetic_x",
        "magnetic_y",
        "magnetic_z",
      ],
    },
  };

  private static readonly sensorOrder = ["Environmental", "Light", "UV", "VOC", "Motion"];

  private static getFromCache(key: string): any | null {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
    return null;
  }

  private static setCache(key: string, data: any): void {
    cache.set(key, { data, timestamp: Date.now() });
  }

  private static sortBySensorOrder<T>(data: Record<string, T>): Record<string, T> {
    return Object.fromEntries(
      this.sensorOrder
        .filter((key) => key in data) // Ensure we only include valid sensor names
        .map((key) => [key, data[key]])
    );
  }

  /**
   * Fetch all historical data for a specific sensor.
   * This function is used to lazy load data for each sensor individually.
   */
  static async fetchRawHistoricalData(sensorName: string): Promise<HistoricalReading[]> {
    const config = this.sensorConfig[sensorName];
    if (!config) {
      throw new Error(`Sensor ${sensorName} not found`);
    }

    const fields = ["timestamp", ...config.fields];
    const query = `SELECT timestamp, ${fields.join(", ")} FROM ${config.table} ORDER BY timestamp ASC`;

    try {
      const data = await db.all(query);

      // Map the results to include the sensor name and readings
      return data.map((row) => {
        const { timestamp, ...readings } = row;
        return {
          timestamp,
          sensorName,
          readings,
        };
      });
    } catch (error) {
      console.error(`Error fetching data for sensor ${sensorName}:`, error);
      throw error;
    }
  }

  static async fetchLatestSummaries(): Promise<Record<string, SummaryReading>> {
    const cacheKey = "latest_all_time_summaries";
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const result: Record<string, SummaryReading> = {};
    await Promise.all(
      Object.entries(this.sensorConfig).map(async ([sensorName, config]) => {
        const sql = `SELECT * FROM ${config.allTimeSummary} LIMIT 1`;
        try {
          const summary = await db.get(sql);
          if (summary) {
            result[sensorName] = summary;
          }
        } catch (error) {
          console.error(`Error fetching all-time summary for ${sensorName}:`, error);
        }
      })
    );

    const sortedResult = this.sortBySensorOrder(result);
    this.setCache(cacheKey, sortedResult);
    return sortedResult;
  }

  static async fetchDailySummaries(): Promise<Record<string, SummaryReading[]>> {
    const cacheKey = "latest_daily_summaries";
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const result: Record<string, SummaryReading[]> = {};
    await Promise.all(
      Object.entries(this.sensorConfig).map(async ([sensorName, config]) => {
        const sql = `SELECT * FROM ${config.dailySummary} ORDER BY date DESC LIMIT 30`;
        try {
          const summaries = await db.all(sql);
          if (summaries) {
            result[sensorName] = summaries;
          }
        } catch (error) {
          console.error(`Error fetching daily summary for ${sensorName}:`, error);
        }
      })
    );

    const sortedResult = this.sortBySensorOrder(result);
    this.setCache(cacheKey, sortedResult);
    return sortedResult;
  }
}
