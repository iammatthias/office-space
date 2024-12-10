import { sensorMetadata } from "../utils/sensor-metadata";

interface DataSet {
  title: string;
  data: Record<string, any[]>;
}

const metricGroups = {
  environment: ["temperature", "humidity", "pressure", "altitude", "voc_gas"],
  light: ["light_intensity", "ir_light", "uv_index"],
  motion: ["acceleration_x", "acceleration_y", "acceleration_z", "gyroscope_x", "gyroscope_y", "gyroscope_z"],
  orientation: ["roll", "pitch", "yaw"],
  magnetic: ["magnetic_x", "magnetic_y", "magnetic_z"],
};

// Function to generate prefixed fields
const generatePrefixedMetrics = (metrics: string[]) => [
  ...metrics,
  ...metrics.map((metric) => `avg_${metric}`),
  ...metrics.map((metric) => `median_${metric}`),
];

export const renderEcosystem = (datasets: DataSet[]): string => {
  const datasetToggles = datasets
    .map(
      (dataset, index) => `
      <div class="toggle-option">
        <input type="radio" 
              id="dataset-${index}" 
              name="dataset-toggle" 
              value="${index}"
              ${index === 0 ? "checked" : ""}>
        <label for="dataset-${index}">${dataset.title}</label>
      </div>
    `
    )
    .join("");

  const datasetContainers = datasets
    .map((dataset, index) => {
      const sensorGrids = Object.entries(dataset.data)
        .map(([sensorName, readings]) => {
          const sensorInfo = sensorMetadata[sensorName];
          const values = readings[0] || {};

          const sensorContent = Object.entries(metricGroups)
            .map(([groupName, metrics]) => {
              const allMetrics = generatePrefixedMetrics(metrics);
              const groupMetrics = allMetrics.filter((metric) => values[metric] !== undefined);
              if (groupMetrics.length === 0) return "";

              const chartId = `${sensorName}-${groupName}-${index}`;
              const datasets = groupMetrics.map((metric) => ({
                label: sensorInfo?.metrics[metric]?.description || metric,
                data: [values[metric]],
                backgroundColor: `hsl(${Math.random() * 360}, 70%, 50%)`,
                borderColor: `hsl(${Math.random() * 360}, 70%, 50%)`,
                borderWidth: 1,
              }));

              return `
                <div class="sensor-group">
                  <h4>${groupName.charAt(0).toUpperCase() + groupName.slice(1)}</h4>
                  <div class="chart-wrapper">
                    <canvas id="${chartId}"></canvas>
                  </div>
                </div>
                <script>
                  (function() {
                    const chartId = '${chartId}';
                    const ctx = document.getElementById(chartId);
                    if (!ctx) return;

                    // Ensure global chart registry exists
                    if (!window.activeCharts) {
                      window.activeCharts = {};
                    }

                    // Destroy existing chart if it exists
                    if (window.activeCharts[chartId]) {
                      window.activeCharts[chartId].destroy();
                    }

                    // Create a new chart instance
                    window.activeCharts[chartId] = new Chart(ctx, {
                      type: 'bar',
                      data: {
                        labels: [''],
                        datasets: ${JSON.stringify(datasets)}
                      },
                      options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: {
                            position: 'right',
                            labels: {
                              boxWidth: 12,
                              font: { size: 10 }
                            }
                          }
                        },
                        scales: {
                          x: { grid: { color: 'rgba(128, 128, 128, 0.1)' } },
                          y: { beginAtZero: true }
                        }
                      }
                    });
                  })();
                </script>
              `;
            })
            .join("");

          return `
            <div class="sensor-section">
              <div class="sensor-header">
                <h3>${sensorInfo?.model || "Unknown Model"} - ${sensorInfo?.name || sensorName}</h3>
                ${
                  sensorInfo
                    ? `<div class="sensor-info"><p class="sensor-description">${sensorInfo.description}</p></div>`
                    : ""
                }
              </div>
              <div class="sensor-groups">
                ${sensorContent}
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <div class="dataset-container" id="dataset-container-${index}" 
            style="display: ${index === 0 ? "flex" : "none"}">
            ${sensorGrids}
        </div>
      `;
    })
    .join("");

  const toggleScript = `
    <script>
      document.querySelectorAll('input[name="dataset-toggle"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
          // Hide all containers
          document.querySelectorAll('.dataset-container').forEach(container => {
            container.style.display = 'none';
          });

          // Show the selected container
          const selectedContainer = document.getElementById('dataset-container-' + e.target.value);
          selectedContainer.style.display = 'flex';

          // Destroy all active charts to prevent canvas re-use errors
          if (window.activeCharts) {
            Object.values(window.activeCharts).forEach(chart => chart.destroy());
            window.activeCharts = {};
          }

          // Trigger all scripts for charts inside the container
          selectedContainer.querySelectorAll('script').forEach(script => {
            const newScript = document.createElement('script');
            newScript.innerHTML = script.innerHTML;
            script.parentNode.replaceChild(newScript, script);
          });
        });
      });
    </script>
  `;

  return `
    <div class="dataset-toggle">${datasetToggles}</div>
    ${datasetContainers}
    ${toggleScript}
  `;
};
