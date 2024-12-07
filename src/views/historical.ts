import { sensorMetadata } from "../utils/sensor-metadata";
import { HistoricalReading } from "../services/environment.service";

// Reuse the same icon utility
const getIcon = (key: string): string => {
  const icons: Record<string, string> = {
    temperature: "🌡️",
    humidity: "💧",
    pressure: "🌫️",
    altitude: "🏔️",
    light_lux: "💡",
    ir_light: "🔦",
    uv_index: "☀️",
    voc_ppm: "🧪",
    accelerometer_x: "📈",
    accelerometer_y: "📉",
    accelerometer_z: "📊",
    gyroscope_x: "🔄",
    gyroscope_y: "🔃",
    gyroscope_z: "🔁",
    magnetometer_x: "🧲",
    magnetometer_y: "🧲",
    magnetometer_z: "🧲",
    default: "🔹",
  };
  return icons[key] || icons["default"];
};

const createTimeSeriesChart = (data: HistoricalReading[], metric: string, metricInfo: any): string => {
  const chartPoints = data
    .filter((reading) => reading.readings[metric] !== undefined)
    .map((reading) => ({
      time: new Date(reading.timestamp).toLocaleString(),
      value: reading.readings[metric],
    }));

  return `
    <div class="card">
      <div class="card-body">
        <div class="card-title">
          <span>${metricInfo.description} ${metricInfo.unit ? `(${metricInfo.unit})` : ""}</span>
        </div>
        <div class="chart-wrapper">
          <canvas id="chart-${metric}"></canvas>
        </div>
        <script>
          new Chart(document.getElementById('chart-${metric}').getContext('2d'), {
            type: 'line',
            data: {
              labels: [${chartPoints.map((p) => `"${p.time}"`).join(",")}],
              datasets: [{
                label: '${metricInfo.description}',
                data: [${chartPoints.map((p) => p.value).join(",")}],
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.1,
                pointRadius: 0,
                borderWidth: 2
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: {
                intersect: false,
                mode: 'index'
              },
              plugins: {
                legend: {
                  display: false
                },
                tooltip: {
                  callbacks: {
                    label: function(context) {
                      return context.parsed.y + (${JSON.stringify(metricInfo.unit)} ? ' ' + ${JSON.stringify(
    metricInfo.unit
  )} : '');
                    }
                  }
                }
              },
              scales: {
                x: {
                  ticks: {
                    maxRotation: 0,
                    autoSkip: true,
                    maxTicksLimit: 8
                  }
                },
                y: {
                  beginAtZero: false,
                  title: {
                    display: true,
                    text: '${metricInfo.unit || ""}'
                  }
                }
              }
            }
          });
        </script>
      </div>
    </div>
  `;
};

export const renderHistoricalView = (data: HistoricalReading[], timeRange: { start: string; end: string }): string => {
  if (!data.length) {
    return `
      <h1>Historical Sensor Data</h1>
      <p>No data available for ${new Date(timeRange.start).toLocaleString()} to ${new Date(
      timeRange.end
    ).toLocaleString()}</p>
    `;
  }

  const sensorGrids = Object.entries(
    data.reduce<Record<string, HistoricalReading[]>>((acc, reading) => {
      if (!acc[reading.sensorName]) acc[reading.sensorName] = [];
      acc[reading.sensorName].push(reading);
      return acc;
    }, {})
  )
    .map(([sensorName, readings]) => {
      const sensorInfo = sensorMetadata[sensorName];
      if (!readings.length) return "";

      const charts = Object.keys(readings[0].readings)
        .map((metric) => {
          const metricInfo = sensorInfo?.metrics[metric];
          if (!metricInfo) return "";
          return createTimeSeriesChart(readings, metric, metricInfo);
        })
        .join("");

      return `
        <div class="sensor-header">
          <h2>${sensorInfo.model} - ${sensorInfo?.name || sensorName}</h2>
          ${
            sensorInfo
              ? `
            <div class="sensor-info">
              <p class="sensor-description">${sensorInfo.description}</p>
            </div>
          `
              : ""
          }
        </div>
        <div class="grid">
          ${charts}
        </div>
      `;
    })
    .join("");

  return `
    <h1>Historical Sensor Data</h1>
    <p>Data from ${new Date(timeRange.start).toLocaleString()} to ${new Date(timeRange.end).toLocaleString()}</p>
    ${sensorGrids}
  `;
};
