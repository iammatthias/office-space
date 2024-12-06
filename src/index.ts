import { join } from "path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { marked } from "marked";
import { readFileSync } from "fs";
import { layout } from "./views/layout";
import { renderEcosystem } from "./views/ecosystem";
import fetch from "node-fetch";
import { EnvironmentalData } from "./types/environmental-data";

const app = new Hono();

// Home route
app.get("/", async (c) => {
  const home = readFileSync(join(__dirname, "content/home.md"), "utf-8");

  // Fetch environment data from the API
  const apiResponse = await fetch("http://localhost:3000/api/latest");
  const data = await apiResponse.json();

  return c.html(
    layout(`
      ${marked(home)}
      ${renderEcosystem(data as EnvironmentalData)}
    `)
  );
});

// Include the latest API route
import latestApi from "./routes/api/latest";
app.route("/api/latest", latestApi);

// Serve the app
serve(app, (info) => {
  console.log(`Office-Space Environment Monitor is live on http://localhost:${info.port}`);
});
