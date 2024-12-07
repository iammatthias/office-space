import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import { SensorMetadata, sensorMetadata } from "../utils/sensor-metadata";

let db: Database;

export async function initDB() {
  db = await open({
    filename: process.env.DB_PATH || "./environment.db",
    driver: sqlite3.Database,
  });
  console.log("Database connected successfully.");
}

export interface SensorDisplay {
  id: string;
  name: string;
  model: string;
  readings: Record<string, any>;
}

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface HistoricalReading {
  timestamp: string;
  sensorName: string;
  readings: Record<string, number>;
}

export interface SensorStatistics {
  min: number;
  max: number;
  avg: number;
  count: number;
}

export class EnvironmentService {
  //debug
  static async debugDatabaseContent() {
    // Check sensors table
    const sensors = await db.all("SELECT * FROM sensors");
    console.log("Sensors:", sensors);

    // Check readings
    const readings = await db.all("SELECT * FROM readings ORDER BY time DESC LIMIT 5");
    console.log("Recent readings:", readings);

    // Check each sensor's data table
    const sensorTables = ["bme280_data", "tsl25911fn_data", "icm20948_data", "ltr390_data", "sgp40_data"];
    for (const table of sensorTables) {
      const data = await db.all(`SELECT * FROM ${table} LIMIT 5`);
      console.log(`${table}:`, data);
    }

    // Check joined data
    const joinedExample = await db.all(`
      SELECT r.time, r.sensor_id, s.name, b.*
      FROM readings r
      JOIN sensors s ON r.sensor_id = s.id
      LEFT JOIN bme280_data b ON r.id = b.reading_id
      ORDER BY r.time DESC
      LIMIT 5
    `);
    console.log("Joined data example:", joinedExample);
  }

  // end debug

  static async getLatestDataTimestamp(): Promise<Date> {
    const result = await db.get(`
      SELECT time FROM readings 
      ORDER BY time DESC 
      LIMIT 1
    `);
    console.log("Latest timestamp from DB:", result?.time);
    return result?.time ? new Date(result.time) : new Date();
  }

  static async getEarliestDataTimestamp(): Promise<Date> {
    const result = await db.get(`
      SELECT MIN(time) as earliest_time
      FROM readings
    `);
    return result.earliest_time ? new Date(result.earliest_time) : new Date();
  }

  static async fetchLatestReadings() {
    const result: Record<string, any> = {};
    const sensors = await db.all("SELECT id, name FROM sensors");

    for (const sensor of sensors) {
      const { id: sensorId, name } = sensor;
      const reading = await db.get("SELECT id, time FROM readings WHERE sensor_id = ? ORDER BY time DESC LIMIT 1", [
        sensorId,
      ]);

      if (!reading) continue;

      let tableData = null;
      switch (name) {
        case "BME280":
          tableData = await db.get("SELECT * FROM bme280_data WHERE reading_id = ?", [reading.id]);
          break;
        case "TSL25911FN":
          tableData = await db.get("SELECT * FROM tsl25911fn_data WHERE reading_id = ?", [reading.id]);
          break;
        case "ICM20948":
          tableData = await db.get("SELECT * FROM icm20948_data WHERE reading_id = ?", [reading.id]);
          break;
        case "LTR390":
          tableData = await db.get("SELECT * FROM ltr390_data WHERE reading_id = ?", [reading.id]);
          break;
        case "SGP40":
          tableData = await db.get("SELECT * FROM sgp40_data WHERE reading_id = ?", [reading.id]);
          break;
      }

      if (tableData) {
        result[name] = {
          ...tableData,
          timestamp: reading.time,
        };
      }
    }

    return result;
  }

  static async getSensorData(): Promise<SensorDisplay[]> {
    try {
      const response = await fetch("/api/sensors");
      const data = await response.json();
      return data.map((sensor: any) => ({
        ...sensor,
        model: sensorMetadata[sensor.name]?.model || "Unknown Model",
      }));
    } catch (error) {
      console.error("Error fetching sensor data:", error);
      return [];
    }
  }

  static async fetchHistoricalData(timeRange: TimeRange, sensorNames?: string[]): Promise<HistoricalReading[]> {
    console.log("Fetching historical data:", {
      timeRange: {
        start: timeRange.start.toISOString(),
        end: timeRange.end.toISOString(),
      },
      sensorNames,
    });

    const result: HistoricalReading[] = [];

    // Format dates for SQLite
    const startStr = timeRange.start.toISOString().replace("T", " ").replace("Z", "");
    const endStr = timeRange.end.toISOString().replace("T", " ").replace("Z", "");

    let sensorQuery = "SELECT id, name FROM sensors";
    if (sensorNames?.length) {
      sensorQuery += ` WHERE name IN (${sensorNames.map((name) => `'${name}'`).join(",")})`;
    }

    const sensors = await db.all(sensorQuery);
    console.log("Found sensors:", sensors);

    for (const sensor of sensors) {
      // Get the appropriate table name and fields for this sensor type
      let sensorTableFields = "";
      switch (sensor.name) {
        case "BME280":
          sensorTableFields = "temperature, humidity, pressure, altitude";
          break;
        case "TSL25911FN":
          sensorTableFields = "light_lux, ir_light";
          break;
        case "ICM20948":
          sensorTableFields =
            "accelerometer_x, accelerometer_y, accelerometer_z, gyroscope_x, gyroscope_y, gyroscope_z, magnetometer_x, magnetometer_y, magnetometer_z";
          break;
        case "LTR390":
          sensorTableFields = "uv_index";
          break;
        case "SGP40":
          sensorTableFields = "voc_ppm";
          break;
        default:
          continue;
      }

      const query = `
        SELECT r.time, ${sensorTableFields}
        FROM readings r
        INNER JOIN ${sensor.name.toLowerCase()}_data sd ON sd.reading_id = r.id
        WHERE r.sensor_id = ?
        AND datetime(r.time) BETWEEN datetime(?) AND datetime(?)
        ORDER BY r.time ASC
      `;

      const readings = await db.all(query, [sensor.id, startStr, endStr]);
      console.log(`Found ${readings.length} readings for sensor ${sensor.name}`);

      readings.forEach((reading) => {
        const { time, ...metrics } = reading;
        result.push({
          timestamp: time,
          sensorName: sensor.name,
          readings: metrics as Record<string, number>,
        });
      });
    }

    console.log("Total historical readings:", result.length);
    return result;
  }

  static async getSensorStatistics(
    sensorName: string,
    timeRange: TimeRange
  ): Promise<Record<string, SensorStatistics>> {
    const { id: sensorId } = await db.get("SELECT id FROM sensors WHERE name = ?", [sensorName]);

    if (!sensorId) return {};

    const tableName = `${sensorName.toLowerCase()}_data`;
    const columns = await db.all(`PRAGMA table_info(${tableName})`);
    const metrics = columns.map((col) => col.name).filter((name) => name !== "reading_id");

    const stats: Record<string, SensorStatistics> = {};

    for (const metric of metrics) {
      const result = await db.get(
        `
        SELECT 
          MIN(${metric}) as min,
          MAX(${metric}) as max,
          AVG(${metric}) as avg,
          COUNT(${metric}) as count
        FROM ${tableName}
        JOIN readings ON ${tableName}.reading_id = readings.id
        WHERE readings.sensor_id = ?
        AND readings.time BETWEEN ? AND ?
      `,
        [sensorId, timeRange.start.toISOString(), timeRange.end.toISOString()]
      );

      stats[metric] = {
        min: result.min,
        max: result.max,
        avg: result.avg,
        count: result.count,
      };
    }

    return stats;
  }
}
