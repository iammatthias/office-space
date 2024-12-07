import { Pool } from "pg";

const pool = new Pool({
  user: "pi",
  host: "/var/run/postgresql",
  database: "environment",
});

export async function getEnvironmentData() {
  try {
    const latest = await pool.query(`
      SELECT * FROM readings 
      ORDER BY time DESC 
      LIMIT 1
    `);

    const historical = await pool.query(`
      SELECT time, temperature, humidity, pressure, altitude
      FROM readings
      WHERE time >= NOW() - INTERVAL '24 hours'
      ORDER BY time DESC
    `);

    return {
      weather: latest.rows[0],
      historical: historical.rows,
    };
  } catch (err) {
    console.error("Database error:", err);
    throw err;
  }
}
