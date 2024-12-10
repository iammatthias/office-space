export const renderHistorical = (sensorNames: string[]): string => {
  // Function to create the chart for a specific sensor
  const createChart = (sensorName: string) => {
    return `
      <div class="historical-chart-container" id="sensor-${sensorName}-container">
        <h3>${sensorName} Sensor Readings</h3>
        <canvas id="chart-${sensorName}"></canvas>
      </div>
    `;
  };

  // Create HTML for each sensor
  const chartConfigs = sensorNames.map((sensorName) => createChart(sensorName)).join("");

  return `
    <h2>Historical Data</h2>
    ${chartConfigs}
    <script>
      // Automatically load sensor data when the page loads
      document.addEventListener('DOMContentLoaded', function() {
        ${sensorNames.map((sensorName) => `loadSensorData('${sensorName}');`).join("\n")}
      });

      async function loadSensorData(sensorName) {
        try {
          const response = await fetch('/api/historical-data/' + sensorName);
          const data = await response.json();
          renderChart(sensorName, data);
        } catch (error) {
          console.error('Error loading data for ' + sensorName, error);
        }
      }

      function renderChart(sensorName, data) {
        const ctx = document.getElementById('chart-' + sensorName).getContext('2d');
        
        // Create datasets for each field in readings (temperature, humidity, pressure, etc.)
        const datasets = Object.keys(data[0].readings).map((field) => {
          return {
            label: field,  // Use the field name as the label (e.g., temperature, humidity, etc.)
            data: data.map((sensorData) => ({
              x: sensorData.timestamp,  // Use the timestamp for the x-axis
              y: sensorData.readings[field],  // Get the value for the field
            })),
            borderWidth: 1,
            pointRadius: 0,
            pointHoverRadius: 0,
            tension: 0.4,
            borderColor: \`hsl(\${Math.random() * 360}, 70%, 50%)\`,
            backgroundColor: \`hsla(\${Math.random() * 360}, 70%, 50%, 0.1)\`,
            fill: false,
          };
        });

        // Create the chart with the datasets
        new Chart(ctx, {
          type: 'line',
          data: { datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { type: 'time', title: { display: true, text: 'Time' } },
              y: { beginAtZero: false, title: { display: true, text: 'Value' } },
            },
          },
        });
      }
    </script>
  `;
};
