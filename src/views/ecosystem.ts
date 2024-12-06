import { EnvironmentalData } from "../types/environmental-data";

export const renderEcosystem = (data: EnvironmentalData): string => {
  // Guard against undefined data
  if (!data?.weather) {
    console.error("Missing or invalid data:", data);
    return "<div>Loading environmental data...</div>";
  }

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
                    <small>Feels like <span id="currentFeelsLike">${data.weather.feelsLike.toFixed(1)}°C</span></small>
                </div>
            </div>
            <div class="card">
                <div class="card-title">
                    <span>💧</span>
                    <span>Humidity</span>
                </div>
                <div class="card-content">${data.weather.humidity}%</div>
            </div>
            <div class="card">
                <div class="card-title">
                    <span>🌫️</span>
                    <span>Pressure</span>
                </div>
                <div class="card-content">${data.weather.pressure} hPa</div>
            </div>
        </div>

        <h2>Historical Trends</h2>
        <canvas id="trendsChart"></canvas>
    </div>

    <script>
        const data = ${JSON.stringify(data)};
        let isCelsius = true;

        const trendsCtx = document.getElementById("trendsChart").getContext("2d");
        const chart = new Chart(trendsCtx, {
            type: "line",
            data: {
                labels: data.historical.map(entry => new Date(entry.timestamp).toLocaleTimeString()),
                datasets: [{
                    label: "Temperature (°C)",
                    data: data.historical.map(entry => entry.temperature),
                    borderColor: "rgba(255, 99, 132, 1)",
                    borderWidth: 2,
                    fill: false,
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: { title: { display: true, text: "Time" } },
                    y: { title: { display: true, text: "Temperature (°C)" } }
                }
            }
        });

        document.getElementById("unitToggle").addEventListener("change", (e) => {
            isCelsius = e.target.value === "celsius";
            
            document.getElementById("currentTemp").textContent = isCelsius 
                ? \`\${data.weather.temperature.toFixed(1)}°C\`
                : \`\${data.weather.temperatureF.toFixed(1)}°F\`;
            
            document.getElementById("currentFeelsLike").textContent = isCelsius
                ? \`\${data.weather.feelsLike.toFixed(1)}°C\`
                : \`\${data.weather.feelsLikeF.toFixed(1)}°F\`;

            chart.data.datasets[0].data = data.historical.map(entry => 
                isCelsius ? entry.temperature : entry.temperatureF
            );
            chart.options.scales.y.title.text = \`Temperature (\${isCelsius ? "°C" : "°F"})\`;
            chart.update();
        });

        setInterval(async () => {
            try {
                const response = await fetch('/api/latest');
                const newData = await response.json();
                data.weather = newData.weather;
                data.historical = newData.historical;

                document.getElementById("currentTemp").textContent = isCelsius 
                    ? \`\${newData.weather.temperature.toFixed(1)}°C\`
                    : \`\${newData.weather.temperatureF.toFixed(1)}°F\`;
                
                document.getElementById("currentFeelsLike").textContent = isCelsius
                    ? \`\${newData.weather.feelsLike.toFixed(1)}°C\`
                    : \`\${newData.weather.feelsLikeF.toFixed(1)}°F\`;

                chart.data.labels = newData.historical.map(entry => 
                    new Date(entry.timestamp).toLocaleTimeString()
                );
                chart.data.datasets[0].data = newData.historical.map(entry => 
                    isCelsius ? entry.temperature : entry.temperatureF
                );
                chart.update();
            } catch (error) {
                console.error('Failed to fetch updated data:', error);
            }
        }, 30000);
    </script>`;
};
