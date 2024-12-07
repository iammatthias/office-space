import { join } from "path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { marked } from "marked";
import { readFileSync } from "fs";
import { layout } from "./views/layout";
import { renderEcosystem } from "./views/ecosystem";
import { getEnvironmentData } from "./services/environment/environment.service";

const app = new Hono();

// Home route
app.get("/", async (c) => {
  const home = readFileSync(join(__dirname, "content/home.md"), "utf-8");
  const data = await getEnvironmentData();

  return c.html(
    layout(`
      ${marked(home)}
      ${renderEcosystem(data)}
    `)
  );
});

// Serve the app
serve(app, (info) => {
  console.log(`Office-Space Environment Monitor is live on http://localhost:${info.port}`);
});
