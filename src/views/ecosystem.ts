import { sensorMetadata } from "../utils/sensor-metadata";

// Utility to assign icons to data points
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

export const renderEcosystem = (data: Record<string, any>): string => {
  const sensorGrids = Object.entries(data)
    .map(([sensorName, readings]) => {
      const sensorInfo = sensorMetadata[sensorName];
      const cards = Object.entries(readings)
        .map(([key, value]) => {
          const metricInfo = sensorInfo?.metrics[key];
          if (!metricInfo) return ""; // Skip if no metadata found

          return `
              <div class="card">
                <div class="card-icon">${getIcon(key)}</div>
                <div class="card-body">
                  <div class="card-value">
                    ${value}${metricInfo.unit ? ` ${metricInfo.unit}` : ""}
                  </div>
                  <div class="card-title">
                    <span>${metricInfo.description}</span>
                  </div>
                  
                </div>
              </div>
            `;
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
                
                <!-- <span class="sensor-manufacturer">Made by ${sensorInfo.manufacturer}</span> -->
              </div>`
                  : ""
              }
            </div>
            <div class="grid">
              ${cards}
            </div>
         
        `;
    })
    .join("");

  return `
      <h1>Latest Sensor Readings</h1>
      ${sensorGrids}
    `;
};
