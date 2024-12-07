import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { initDB, EnvironmentService } from "./services/environment.service";
import { layout } from "./views/layout";
import { renderEcosystem } from "./views/ecosystem";
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
    const home = readFileSync(join(__dirname, "content/home.md"), "utf-8");
    const latestReadings = await EnvironmentService.fetchLatestReadings();
    const content = renderEcosystem(latestReadings);
    return c.html(layout(`${marked.parse(home)}${content}`));
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
