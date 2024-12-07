import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { initDB, EnvironmentService } from "./services/environment.service";
import { layout } from "./views/layout";
import { renderEcosystem } from "./views/ecosystem";
import { renderHistoricalView } from "./views/historical";
import { marked } from "marked";
import { readFileSync } from "fs";
import { join } from "path";

const app = new Hono();

// Serve static files with a simpler configuration
app.use("/static/*", serveStatic({ root: "./" }));

app.use("*", async (c, next) => {
  await next();
});

// Route to fetch and display all sensors' latest data
app.get("/", async (c) => {
  try {
    // Read the home markdown content
    const home = readFileSync(join(__dirname, "content/home.md"), "utf-8");

    // Fetch latest readings
    const latestReadings = await EnvironmentService.fetchLatestReadings();
    const ecosystemContent = renderEcosystem(latestReadings);

    // Get the latest timestamp from the database
    const endDate = await EnvironmentService.getLatestDataTimestamp();
    const startDate = new Date(endDate);
    startDate.setHours(startDate.getHours() - 24);

    console.log("Using date range:", {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    });

    const historicalData = await EnvironmentService.fetchHistoricalData({
      start: startDate,
      end: endDate,
    });

    const historicalContent = renderHistoricalView(historicalData, {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    });

    // Combine all content
    const content = `
      ${marked.parse(home)}

        ${ecosystemContent}

        ${historicalContent}

    `;

    // Add Chart.js to the layout
    const layoutWithChartJs = (content: string) =>
      layout(`
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <style>
        .content-section {
          margin: 2rem 0;
          padding: 1rem;
          border-radius: 0.5rem;
          background: var(--background);
        }
        .content-section h2 {
          margin-bottom: 1rem;
        }
        .charts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 1rem;
          padding: 1rem;
        }
        .metric-chart {
          background: var(--background-light);
          padding: 1rem;
          border-radius: 0.5rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .metric-chart h3 {
          margin-bottom: 0.5rem;
        }
        .time-range {
          margin: 1rem 0;
          padding: 0.5rem;
          background: var(--background-light);
          border-radius: 0.25rem;
        }
      </style>
      ${content}
    `);

    return c.html(layoutWithChartJs(content));
  } catch (error) {
    console.error("Error fetching data:", error);
    return c.html(layout("<p>Error fetching data.</p>"));
  }
});

// API routes for supporting data
app.get("/api/timeranges", async (c) => {
  try {
    const latest = await EnvironmentService.getLatestDataTimestamp();
    const earliest = await EnvironmentService.getEarliestDataTimestamp();
    return c.json({
      earliest: earliest.toISOString(),
      latest: latest.toISOString(),
    });
  } catch (error) {
    console.error("Error fetching time ranges:", error);
    return c.json({ error: "Failed to fetch time ranges" }, 500);
  }
});

app.get("/api/stats/:sensor", async (c) => {
  try {
    const sensorName = c.req.param("sensor");
    const end = await EnvironmentService.getLatestDataTimestamp();
    const start = new Date(end);
    start.setHours(start.getHours() - 24);

    const stats = await EnvironmentService.getSensorStatistics(sensorName, { start, end });
    return c.json(stats);
  } catch (error) {
    console.error("Error fetching sensor statistics:", error);
    return c.json({ error: "Failed to fetch sensor statistics" }, 500);
  }
});

(async () => {
  await initDB();
  console.log("Debugging database content...");
  await EnvironmentService.debugDatabaseContent();
  const port = 3000;
  serve({ fetch: app.fetch, port });
})();
