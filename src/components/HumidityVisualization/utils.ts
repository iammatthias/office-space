import { EnvironmentalData } from "../../hooks/useEnvironmentalData";

const HUMIDITY_COLORS = {
  50: "#DDF1E4",
  100: "#BFE8D9",
  150: "#A2DECE",
  200: "#87D3C3",
  300: "#5ABDAC",
  400: "#3AA99F",
  500: "#2F968D",
  600: "#24837B",
  700: "#1C6C66",
  800: "#164F4A",
  850: "#143F3C",
  900: "#122F2C",
  950: "#101F1D",
} as const;

export const getColorForHumidity = (humidity: number, min: number, max: number): string => {
  // Normalize the humidity value to a 0-1000 scale
  const normalizedValue = ((humidity - min) / (max - min)) * 1000;

  // Find the closest color stop
  const stops = Object.keys(HUMIDITY_COLORS)
    .map(Number)
    .sort((a, b) => a - b);
  const closestStop = stops.reduce((prev, curr) => {
    return Math.abs(curr - normalizedValue) < Math.abs(prev - normalizedValue) ? curr : prev;
  });

  return HUMIDITY_COLORS[closestStop as keyof typeof HUMIDITY_COLORS];
};

export const organizeDataByDay = (data: EnvironmentalData[]): EnvironmentalData[][] => {
  const dayMap = new Map<string, EnvironmentalData[]>();

  data.forEach((entry) => {
    const date = entry.time.toISOString().split("T")[0];
    if (!dayMap.has(date)) {
      dayMap.set(date, []);
    }
    dayMap.get(date)?.push(entry);
  });

  return Array.from(dayMap.values());
};

export const getHumidityRange = (data: EnvironmentalData[]) => {
  let min = Infinity;
  let max = -Infinity;

  data.forEach((entry) => {
    min = Math.min(min, entry.value);
    max = Math.max(max, entry.value);
  });

  return { min, max };
};
