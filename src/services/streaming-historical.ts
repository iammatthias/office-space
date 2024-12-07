import { sensorMetadata } from "../utils/sensor-metadata";
import { HistoricalReading } from "../services/environment.service";

const createTimeSeriesChart = (data: HistoricalReading[], metric: string): string => {
  const chartPoints = data
    .filter((reading) => reading.readings[metric] !== undefined)
    .map((reading) => ({
      time: new Date(reading.timestamp).toLocaleString(),
      value: reading.readings[metric],
    }));

  return `
    <div class="chart-container">
      <canvas id="chart-${metric}" width="800" height="400"></canvas>
      <script>
        new Chart(document.getElementById('chart-${metric}').getContext('2d'), {
          type: 'line',
          data: {
            labels: [${chartPoints.map((p) => `"${p.time}"`).join(",")}],
            datasets: [{
              label: '${metric}',
              data: [${chartPoints.map((p) => p.value).join(",")}],
              borderColor: 'rgb(75, 192, 192)',
              tension: 0.1
            }]
          },
          options: {
            responsive: true,
            scales: {
              y: {
                beginAtZero: false
              }
            }
          }
        });
      </script>
    </div>
  `;
};

export const renderHistoricalView = (data: HistoricalReading[], timeRange: { start: string; end: string }): string => {
  console.log("Rendering historical view with data:", data);

  if (!data || data.length === 0) {
    return `
        <div class="historical-view">
          <h1>Historical Sensor Data</h1>
          <div class="time-range">
            <p>Showing data from ${new Date(timeRange.start).toLocaleString()} to ${new Date(
      timeRange.end
    ).toLocaleString()}</p>
          </div>
          <p>No data available for this time range.</p>
        </div>
      `;
  }

  // Group data by sensor with explicit typing
  const sensorGroups = data.reduce<Record<string, HistoricalReading[]>>((acc, reading) => {
    if (!acc[reading.sensorName]) {
      acc[reading.sensorName] = [];
    }
    acc[reading.sensorName].push(reading);
    return acc;
  }, {});

  console.log("Sensor groups:", Object.keys(sensorGroups));

  const sensorCharts = Object.entries(sensorGroups)
    .map(([sensorName, readings]) => {
      console.log(`Processing sensor ${sensorName} with ${readings.length} readings`);
      const sensorInfo = sensorMetadata[sensorName];
      if (!readings.length) return "";

      const metrics = Object.keys(readings[0].readings);
      console.log(`Found metrics for ${sensorName}:`, metrics);

      const charts = metrics
        .map((metric) => {
          const metricInfo = sensorInfo?.metrics[metric];
          if (!metricInfo) {
            console.log(`No metric info found for ${metric}`);
            return "";
          }

          return `
              <div class="metric-chart">
                <h3>${metricInfo.description} (${metricInfo.unit || "no unit"})</h3>
                ${createTimeSeriesChart(readings, metric)}
              </div>
            `;
        })
        .join("");

      return `
          <div class="sensor-section">
            <h2>${sensorInfo?.model || sensorName}</h2>
            <div class="charts-grid">
              ${charts}
            </div>
          </div>
        `;
    })
    .join("");

  return `
      <div class="historical-view">
        <h1>Historical Sensor Data</h1>
        <div class="time-range">
          <p>Showing data from ${new Date(timeRange.start).toLocaleString()} to ${new Date(
    timeRange.end
  ).toLocaleString()}</p>
        </div>
        ${sensorCharts}
      </div>
    `;
};
