import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { initDB, EnvironmentService } from "./services/environment.service";
import { layout } from "./views/layout";
import { renderEcosystem } from "./views/ecosystem";

const app = new Hono();

app.use("*", async (c, next) => {
  await next();
});

// Route to fetch and display all sensors' latest data
app.get("/", async (c) => {
  try {
    const latestReadings = await EnvironmentService.fetchLatestReadings();
    const content = renderEcosystem(latestReadings);
    return c.html(layout(content));
  } catch (error) {
    console.error("Error fetching sensor data:", error);
    return c.html(layout("<p>Error fetching sensor data.</p>"));
  }
});

(async () => {
  await initDB();
  const port = 3000;
  serve({ fetch: app.fetch, port });
})();
