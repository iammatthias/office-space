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

interface SensorDisplay {
  id: string;
  name: string;
  model: string;
  readings: Record<string, any>;
}

export class EnvironmentService {
  // Fetch the latest readings from all sensor-specific tables
  static async fetchLatestReadings() {
    const result: Record<string, any> = {};

    // Fetch sensor information
    const sensors = await db.all("SELECT id, name FROM sensors");

    for (const sensor of sensors) {
      const { id: sensorId, name } = sensor;

      // Get the latest reading_id for this sensor
      const reading = await db.get("SELECT id FROM readings WHERE sensor_id = ? ORDER BY time DESC LIMIT 1", [
        sensorId,
      ]);

      if (!reading) continue; // Skip if no readings are found

      // Fetch data from the corresponding sensor table
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
        result[name] = tableData;
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
}
