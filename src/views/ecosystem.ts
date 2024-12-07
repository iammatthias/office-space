import { EnvironmentalData, HistoricalDataPoint } from "../types/environmental-data";

// Utility functions
const calculateFeelsLike = (temperature: number, humidity: number): number => {
  return temperature + 0.1 * humidity - 5;
};

const toFahrenheit = (celsius: number): number => {
  return (celsius * 9) / 5 + 32;
};

export const renderEcosystem = (data: EnvironmentalData): string => {
  // Pre-calculate values for initial render
  const feelsLike = calculateFeelsLike(data.weather.temperature, data.weather.humidity);
  const temperatureF = toFahrenheit(data.weather.temperature);
  const feelsLikeF = toFahrenheit(feelsLike);

  // Transform historical data with Fahrenheit values
  const historicalWithF: HistoricalDataPoint[] = data.historical.map((entry) => ({
    ...entry,
    temperatureF: toFahrenheit(entry.temperature),
  }));

  return `
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

    <div id="ecosystem">
        <div style="margin-bottom: 1rem;">
            <label>
                <strong>View in:</strong>
                <select id="unitToggle">
                    <option value="celsius" selected>Celsius (°C)</option>
                    <option value="fahrenheit">Fahrenheit (°F)</option>
                </select>
            </label>
        </div>

        <div class="grid">
            <div class="card">
                <div class="card-title">
                    <span>🌡️</span>
                    <span>Temperature</span>
                </div>
                <div class="card-content">
                    <span id="currentTemp">${data.weather.temperature.toFixed(1)}°C</span><br />
                    <small>Feels like <span id="currentFeelsLike">${feelsLike.toFixed(1)}°C</span></small>
                </div>
            </div>
            <div class="card">
                <div class="card-title">
                    <span>💧</span>
                    <span>Humidity</span>
                </div>
                <div class="card-content">${data.weather.humidity.toFixed(1)}%</div>
            </div>
            <div class="card">
                <div class="card-title">
                    <span>🌫️</span>
                    <span>Pressure</span>
                </div>
                <div class="card-content">${data.weather.pressure.toFixed(1)} hPa</div>
            </div>
        </div>

        <h2>Historical Trends</h2>
        <canvas id="trendsChart"></canvas>
    </div>

    <script>
        const data = ${JSON.stringify({
          weather: {
            ...data.weather,
            temperatureF,
            feelsLikeF,
            feelsLike,
          },
          historical: historicalWithF,
        })};
        let isCelsius = true;

        const trendsCtx = document.getElementById("trendsChart").getContext("2d");
        const chart = new Chart(trendsCtx, {
            type: "line",
            data: {
                labels: data.historical.map((entry: HistoricalDataPoint) => 
                    new Date(entry.time).toLocaleTimeString()
                ),
                datasets: [{
                    label: "Temperature (°C)",
                    data: data.historical.map((entry: HistoricalDataPoint) => entry.temperature),
                    borderColor: "rgba(255, 99, 132, 1)",
                    borderWidth: 2,
                    fill: false,
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: { 
                        title: { display: true, text: "Time" },
                        reverse: true
                    },
                    y: { 
                        title: { display: true, text: "Temperature (°C)" }
                    }
                }
            }
        });

        document.getElementById("unitToggle")?.addEventListener("change", (e) => {
            isCelsius = (e.target as HTMLSelectElement).value === "celsius";
            
            document.getElementById("currentTemp")!.textContent = isCelsius 
                ? \`\${data.weather.temperature.toFixed(1)}°C\`
                : \`\${data.weather.temperatureF!.toFixed(1)}°F\`;
            
            document.getElementById("currentFeelsLike")!.textContent = isCelsius
                ? \`\${data.weather.feelsLike!.toFixed(1)}°C\`
                : \`\${data.weather.feelsLikeF!.toFixed(1)}°F\`;

            chart.data.datasets[0].data = data.historical.map((entry: HistoricalDataPoint) => 
                isCelsius ? entry.temperature : entry.temperatureF!
            );
            chart.options.scales.y.title.text = \`Temperature (\${isCelsius ? "°C" : "°F"})\`;
            chart.update();
        });

        // Auto-refresh every 30 seconds
        setInterval(async () => {
            try {
                const response = await fetch(window.location.href);
                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const newData = JSON.parse(doc.getElementById('ecosystem')!.querySelector('script')!.textContent!);

                data.weather = newData.weather;
                data.historical = newData.historical;

                document.getElementById("currentTemp")!.textContent = isCelsius 
                    ? \`\${data.weather.temperature.toFixed(1)}°C\`
                    : \`\${data.weather.temperatureF!.toFixed(1)}°F\`;
                
                document.getElementById("currentFeelsLike")!.textContent = isCelsius
                    ? \`\${data.weather.feelsLike!.toFixed(1)}°C\`
                    : \`\${data.weather.feelsLikeF!.toFixed(1)}°F\`;

                chart.data.labels = data.historical.map((entry: HistoricalDataPoint) => 
                    new Date(entry.time).toLocaleTimeString()
                );
                chart.data.datasets[0].data = data.historical.map((entry: HistoricalDataPoint) => 
                    isCelsius ? entry.temperature : entry.temperatureF!
                );
                chart.update();
            } catch (error) {
                console.error('Failed to refresh data:', error);
            }
        }, 30000);
    </script>`;
};
