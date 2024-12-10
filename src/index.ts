import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { initDB, EnvironmentService } from "./services/environment.service";
import { layout } from "./views/layout";
import { renderEcosystem } from "./views/ecosystem";
import { renderHistorical } from "./views/historical";
import { marked } from "marked";
import { readFileSync } from "fs";
import { join } from "path";

const app = new Hono();

// Serve static files
app.use("/static/*", serveStatic({ root: "./" }));

// Home Route
app.get("/", async (c) => {
  try {
    // Load markdown content for the homepage
    const homeContent = readFileSync(join(__dirname, "content/home.md"), "utf-8");

    // Fetch precomputed all-time summaries and daily summaries
    const allTimeSummaries = await EnvironmentService.fetchLatestSummaries();
    const dailySummaries = await EnvironmentService.fetchDailySummaries();

    const datasets = [
      {
        title: "All-Time Summaries",
        data: Object.fromEntries(
          Object.entries(allTimeSummaries).map(([key, value]) => [
            key,
            [value], // Wrap single `SummaryReading` objects into an array
          ])
        ),
      },
      {
        title: "Daily Summaries (Last 30 Days)",
        data: Object.fromEntries(
          Object.entries(dailySummaries).map(([key, value]) => [
            key,
            value, // Ensure daily summaries are arrays already
          ])
        ),
      },
    ];

    // Render ecosystem view with fetched summaries
    const ecosystemContent = renderEcosystem(datasets);

    // Pass the list of sensor names to the historical data view for lazy loading
    const sensorNames = Object.keys(EnvironmentService["sensorConfig"]);
    const historicalContent = renderHistorical(sensorNames);

    // Combine all rendered content
    const finalContent = `
      ${marked.parse(homeContent)}
      ${ecosystemContent}
      ${historicalContent}
    `;

    return c.html(layout(finalContent));
  } catch (error) {
    console.error("Error fetching data:", error);
    return c.html(layout("<p>Error fetching data. Please try again later.</p>"));
  }
});

// API Route for Fetching Historical Data for a Specific Sensor
app.get("/api/historical-data/:sensorName", async (c) => {
  const { sensorName } = c.req.param(); // Get the sensor name from the URL parameters

  try {
    // Fetch historical data for the requested sensor
    const historicalData = await EnvironmentService.fetchRawHistoricalData(sensorName);

    // Respond with the data for the requested sensor
    return c.json(historicalData);
  } catch (error) {
    console.error(`Error fetching data for sensor ${sensorName}:`, error);
    return c.json({ error: `Failed to fetch data for sensor ${sensorName}` }, 500);
  }
});

// Initialize database and start server
(async () => {
  await initDB();
  const port = 3000;
  serve({ fetch: app.fetch, port });
  console.log(`Server is running at http://localhost:${port}`);
})();
