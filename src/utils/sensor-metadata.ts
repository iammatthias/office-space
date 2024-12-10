// src/utils/sensor-metadata.ts

export interface MetricInfo {
  description: string;
  unit?: string;
}

export interface SensorInfo {
  name: string;
  model: string;
  description: string;
  metrics: Record<string, MetricInfo>;
}

export const sensorMetadata: Record<string, SensorInfo> = {
  Environmental: {
    name: "Environmental Sensor",
    model: "BME280",
    description: "High-precision environmental monitoring sensor",
    metrics: {
      temperature: {
        description: "Temperature",
        unit: "°C",
      },
      humidity: {
        description: "Relative Humidity",
        unit: "%",
      },
      pressure: {
        description: "Atmospheric Pressure",
        unit: "hPa",
      },
    },
  },
  Light: {
    name: "Light Sensor",
    model: "TSL2591",
    description: "High-dynamic range light sensor",
    metrics: {
      light_intensity: {
        description: "Light Intensity",
        unit: "lux",
      },
    },
  },
  UV: {
    name: "UV Light Sensor",
    model: "LTR390",
    description: "UV index and ambient light sensor",
    metrics: {
      uv_index: {
        description: "UV Index",
        unit: "UV",
      },
    },
  },
  VOC: {
    name: "Air Quality Sensor",
    model: "SGP40",
    description: "Volatile organic compounds sensor",
    metrics: {
      voc_gas: {
        description: "VOC Gas Level",
        unit: "ppb",
      },
    },
  },
  Motion: {
    name: "Motion Sensor",
    model: "ICM20948/MPU925x",
    description: "9-DOF motion tracking sensor",
    metrics: {
      roll: {
        description: "Roll",
        unit: "°",
      },
      pitch: {
        description: "Pitch",
        unit: "°",
      },
      yaw: {
        description: "Yaw",
        unit: "°",
      },
      acceleration_x: {
        description: "X Acceleration",
        unit: "g",
      },
      acceleration_y: {
        description: "Y Acceleration",
        unit: "g",
      },
      acceleration_z: {
        description: "Z Acceleration",
        unit: "g",
      },
      gyroscope_x: {
        description: "X Angular Velocity",
        unit: "°/s",
      },
      gyroscope_y: {
        description: "Y Angular Velocity",
        unit: "°/s",
      },
      gyroscope_z: {
        description: "Z Angular Velocity",
        unit: "°/s",
      },
      magnetic_x: {
        description: "X Magnetic Field",
        unit: "μT",
      },
      magnetic_y: {
        description: "Y Magnetic Field",
        unit: "μT",
      },
      magnetic_z: {
        description: "Z Magnetic Field",
        unit: "μT",
      },
    },
  },
};
