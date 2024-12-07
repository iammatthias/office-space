export interface SensorMetadata {
  name: string;
  description: string;
  manufacturer: string;
  metrics: {
    [key: string]: {
      description: string;
      unit?: string;
    };
  };
}

export const sensorMetadata: Record<string, SensorMetadata> = {
  BME280: {
    name: "Environmental Sensor",
    manufacturer: "Bosch",
    description: "A precision sensor that measures key environmental conditions indoors and outdoors",
    metrics: {
      temperature: {
        description: "Air temperature around the sensor",
        unit: "°C",
      },
      humidity: {
        description: "Amount of water vapor in the air",
        unit: "%",
      },
      pressure: {
        description: "Atmospheric pressure, which can indicate weather changes",
        unit: "hPa",
      },
      altitude: {
        description: "Estimated altitude based on pressure readings",
        unit: "m",
      },
    },
  },
  TSL25911FN: {
    name: "Light Sensor",
    manufacturer: "AMS",
    description: "An advanced light sensor that measures ambient and infrared light levels",
    metrics: {
      light_lux: {
        description: "Ambient light intensity, similar to what human eyes perceive",
        unit: "lux",
      },
      ir_light: {
        description: "Infrared light levels, invisible to human eyes but important for plant growth",
        unit: "lux",
      },
    },
  },
  ICM20948: {
    name: "Motion Sensor",
    manufacturer: "TDK InvenSense",
    description: "A 9-axis motion tracking sensor that measures movement and orientation",
    metrics: {
      accelerometer_x: {
        description: "Forward/backward tilt movement",
        unit: "g",
      },
      accelerometer_y: {
        description: "Left/right tilt movement",
        unit: "g",
      },
      accelerometer_z: {
        description: "Up/down movement",
        unit: "g",
      },
      gyroscope_x: {
        description: "Rotation around forward axis",
        unit: "°/s",
      },
      gyroscope_y: {
        description: "Rotation around side axis",
        unit: "°/s",
      },
      gyroscope_z: {
        description: "Rotation around vertical axis",
        unit: "°/s",
      },
      magnetometer_x: {
        description: "Magnetic field strength in X axis",
        unit: "µT",
      },
      magnetometer_y: {
        description: "Magnetic field strength in Y axis",
        unit: "µT",
      },
      magnetometer_z: {
        description: "Magnetic field strength in Z axis",
        unit: "µT",
      },
    },
  },
  LTR390: {
    name: "UV Light Sensor",
    manufacturer: "Liteon",
    description: "An ultraviolet light sensor that measures UV exposure levels",
    metrics: {
      uv_index: {
        description: "UV radiation intensity on a scale of 1-11+",
        unit: "UV index",
      },
    },
  },
  SGP40: {
    name: "Air Quality Sensor",
    manufacturer: "Sensirion",
    description: "A gas sensor that detects volatile organic compounds in the air",
    metrics: {
      voc_ppm: {
        description: "Concentration of volatile organic compounds - indicates air quality",
        unit: "ppm",
      },
    },
  },
};
