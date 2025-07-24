import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { setOGImageFromAPI } from "./lib/og-image.ts";

// Set the OG image from API on page load
setOGImageFromAPI().catch(console.error);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
