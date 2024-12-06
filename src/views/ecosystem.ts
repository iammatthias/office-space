import Chart from "chart.js/auto"; // Ensure Chart.js is installed
import { EnvironmentalData } from "../types/environmental-data";

// Render Ecosystem Function
export const renderEcosystem = (data: EnvironmentalData): void => {
  const app = document.getElementById("app");
  if (!app) {
    console.error("App element not found!");
    return;
  }

  // Clear previous content if any
  app.innerHTML = `
    <div id="ecosystem">
      <!-- Unit Toggle -->
      <div style="margin-bottom: 1rem;">
        <label for="unitToggle">
          <strong>View in:</strong>
          <select id="unitToggle">
            <option value="celsius" selected>Celsius (°C)</option>
            <option value="fahrenheit">Fahrenheit (°F)</option>
          </select>
        </label>
      </div>

      <!-- Current State Cards -->
      <div class="grid">
        <div class="card">
          <div class="card-title">🌡️ Temperature</div>
          <div class="card-content">
            <span id="currentTemp">${data.weather.temperature.toFixed(1)}°C</span><br />
            <small>Feels like <span id="currentFeelsLike">${data.weather.feelsLike.toFixed(1)}°C</span></small>
          </div>
        </div>
        <div class="card">
          <div class="card-title">💧 Humidity</div>
          <div class="card-content">${data.weather.humidity}%</div>
        </div>
        <div class="card">
          <div class="card-title">🌫️ Pressure</div>
          <div class="card-content">${data.weather.pressure} hPa</div>
        </div>
      </div>

      <!-- Historical Trends Chart -->
      <div>
        <h2>Historical Trends</h2>
        <canvas id="trendsChart"></canvas>
      </div>
    </div>
  `;

  setupChartAndInteractivity(data);
};

// Function to set up Chart.js and interactivity
const setupChartAndInteractivity = (data: EnvironmentalData): void => {
  const unitToggle = document.getElementById("unitToggle") as HTMLSelectElement;
  const currentTemp = document.getElementById("currentTemp")!;
  const currentFeelsLike = document.getElementById("currentFeelsLike")!;
  const trendsCtx = (document.getElementById("trendsChart") as HTMLCanvasElement).getContext("2d")!;

  let isCelsius = true;

  // Initialize Chart.js
  const chart = new Chart(trendsCtx, {
    type: "line",
    data: {
      labels: data.historical.map((entry) => new Date(entry.timestamp).toLocaleTimeString()),
      datasets: [
        {
          label: `Temperature (${isCelsius ? "°C" : "°F"})`,
          data: data.historical.map((entry) => (isCelsius ? entry.temperature : entry.temperatureF)),
          borderColor: "rgba(255, 99, 132, 1)",
          borderWidth: 2,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        x: {
          title: {
            display: true,
            text: "Time",
          },
        },
        y: {
          title: {
            display: true,
            text: `Temperature (${isCelsius ? "°C" : "°F"})`,
          },
        },
      },
    },
  });

  // Update displayed temperatures and chart when toggling units
  unitToggle.addEventListener("change", () => {
    isCelsius = unitToggle.value === "celsius";

    // Update current state cards
    currentTemp.textContent = isCelsius
      ? `${data.weather.temperature.toFixed(1)}°C`
      : `${data.weather.temperatureF.toFixed(1)}°F`;
    currentFeelsLike.textContent = isCelsius
      ? `${data.weather.feelsLike.toFixed(1)}°C`
      : `${data.weather.feelsLikeF.toFixed(1)}°F`;

    // Update chart data and axis label
    chart.data.datasets[0].data = data.historical.map((entry) => (isCelsius ? entry.temperature : entry.temperatureF));
    chart.options.scales!.y!.title!.text = `Temperature (${isCelsius ? "°C" : "°F"})`;
    chart.update();
  });
};
