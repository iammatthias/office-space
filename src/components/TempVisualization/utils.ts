import { EnvironmentalData } from "../../hooks/useEnvironmentalData";

const MINUTES_IN_DAY = 1440;

export const getColorForTemperature = (temp: number, minTemp: number, maxTemp: number): string => {
  // Normalize temperature to a value between 0 and 1
  const normalizedTemp = (temp - minTemp) / (maxTemp - minTemp);

  // Define color stops for red and blue scales
  const redScale = [
    { value: 0.0, color: "#FFE1D5" }, // 50
    { value: 0.1, color: "#FFCABB" }, // 100
    { value: 0.2, color: "#FDB2A2" }, // 150
    { value: 0.3, color: "#F89A8A" }, // 200
    { value: 0.4, color: "#E8705F" }, // 300
    { value: 0.5, color: "#D14D41" }, // 400
    { value: 0.6, color: "#C03E35" }, // 500
    { value: 0.7, color: "#AF3029" }, // 600
    { value: 0.8, color: "#942822" }, // 700
    { value: 0.9, color: "#6C201C" }, // 800
    { value: 0.95, color: "#551B18" }, // 850
    { value: 1.0, color: "#261312" }, // 950
  ];

  const blueScale = [
    { value: 0.0, color: "#E1ECEB" }, // 50
    { value: 0.1, color: "#C6DDE8" }, // 100
    { value: 0.2, color: "#ABCFE2" }, // 150
    { value: 0.3, color: "#92BFDB" }, // 200
    { value: 0.4, color: "#66A0C8" }, // 300
    { value: 0.5, color: "#4385BE" }, // 400
    { value: 0.6, color: "#3171B2" }, // 500
    { value: 0.7, color: "#205EA6" }, // 600
    { value: 0.8, color: "#1A4F8C" }, // 700
    { value: 0.9, color: "#163B66" }, // 800
    { value: 0.95, color: "#133051" }, // 850
    { value: 1.0, color: "#101A24" }, // 950
  ];

  // Choose the appropriate color scale based on whether we're showing cold or warm temperatures
  const scale = temp < (maxTemp + minTemp) / 2 ? blueScale : redScale;

  // Find the two closest color stops
  let lowerStop = scale[0];
  let upperStop = scale[scale.length - 1];

  for (let i = 0; i < scale.length - 1; i++) {
    if (normalizedTemp >= scale[i].value && normalizedTemp <= scale[i + 1].value) {
      lowerStop = scale[i];
      upperStop = scale[i + 1];
      break;
    }
  }

  // Calculate the position between the two stops
  const stopRange = upperStop.value - lowerStop.value;
  const stopPosition = (normalizedTemp - lowerStop.value) / stopRange;

  // Return the color at the exact position
  return lowerStop.color === upperStop.color
    ? lowerStop.color
    : interpolateHexColor(lowerStop.color, upperStop.color, stopPosition);
};

// Helper function to interpolate between two hex colors
const interpolateHexColor = (color1: string, color2: string, factor: number): string => {
  // Convert hex to rgb
  const c1 = {
    r: parseInt(color1.slice(1, 3), 16),
    g: parseInt(color1.slice(3, 5), 16),
    b: parseInt(color1.slice(5, 7), 16),
  };
  const c2 = {
    r: parseInt(color2.slice(1, 3), 16),
    g: parseInt(color2.slice(3, 5), 16),
    b: parseInt(color2.slice(5, 7), 16),
  };

  // Interpolate
  const r = Math.round(c1.r + (c2.r - c1.r) * factor);
  const g = Math.round(c1.g + (c2.g - c1.g) * factor);
  const b = Math.round(c1.b + (c2.b - c1.b) * factor);

  // Convert back to hex
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

// Organize data by days
export const organizeDataByDay = (data: EnvironmentalData[]): EnvironmentalData[][] => {
  const days: { [key: string]: EnvironmentalData[] } = {};

  data.forEach((entry) => {
    const dateKey = entry.time.toISOString().split("T")[0];
    if (!days[dateKey]) {
      days[dateKey] = [];
    }
    days[dateKey].push(entry);
  });

  // Convert to array and sort by date
  return Object.values(days).sort((a, b) => a[0].time.getTime() - b[0].time.getTime());
};

// Add new helper function to calculate temperature range
export const getTemperatureRange = (data: EnvironmentalData[]): { min: number; max: number } => {
  if (!data.length) return { min: 0, max: 0 };

  return data.reduce(
    (acc, curr) => ({
      min: Math.min(acc.min, curr.value),
      max: Math.max(acc.max, curr.value),
    }),
    { min: Infinity, max: -Infinity }
  );
};

const interpolateData = (data: EnvironmentalData[]): EnvironmentalData[] => {
  if (data.length === 0) return [];

  // First, organize data by days for easier access
  const dayMap = new Map<string, Map<number, number>>();
  const sortedDates: string[] = [];

  // Create minute-based maps for each day
  data.forEach((entry) => {
    const dateKey = entry.time.toISOString().split("T")[0];
    const minutes = entry.time.getHours() * 60 + entry.time.getMinutes();

    if (!dayMap.has(dateKey)) {
      dayMap.set(dateKey, new Map());
      sortedDates.push(dateKey);
    }
    dayMap.get(dateKey)!.set(minutes, entry.value);
  });

  // Sort dates chronologically
  sortedDates.sort();

  const interpolated: EnvironmentalData[] = [];
  const firstDay = sortedDates[0];
  const lastDay = sortedDates[sortedDates.length - 1];

  // Process each day
  sortedDates.forEach((dateKey, dateIndex) => {
    const currentDayData = dayMap.get(dateKey)!;
    const prevDayData = dateIndex > 0 ? dayMap.get(sortedDates[dateIndex - 1])! : null;
    const nextDayData = dateIndex < sortedDates.length - 1 ? dayMap.get(sortedDates[dateIndex + 1])! : null;

    // For each minute in the day
    for (let minute = 0; minute < MINUTES_IN_DAY; minute++) {
      if (currentDayData.has(minute)) {
        // Use actual data if available
        interpolated.push({
          time: new Date(
            `${dateKey}T${Math.floor(minute / 60)
              .toString()
              .padStart(2, "0")}:${(minute % 60).toString().padStart(2, "0")}:00`
          ),
          value: currentDayData.get(minute)!,
        });
      } else {
        // Handle missing data
        let interpolatedValue: number | null = null;

        if (dateKey === firstDay && minute < Array.from(currentDayData.keys())[0]) {
          // For first day's missing morning data, use next day's data if available
          interpolatedValue = nextDayData?.get(minute) ?? null;
        } else if (dateKey === lastDay && minute > Math.max(...Array.from(currentDayData.keys()))) {
          // For last day's missing evening data, use previous day's data
          interpolatedValue = prevDayData?.get(minute) ?? null;
        } else {
          // For gaps in the middle, try to use the same time from previous day
          interpolatedValue = prevDayData?.get(minute) ?? nextDayData?.get(minute) ?? null;
        }

        if (interpolatedValue !== null) {
          interpolated.push({
            time: new Date(
              `${dateKey}T${Math.floor(minute / 60)
                .toString()
                .padStart(2, "0")}:${(minute % 60).toString().padStart(2, "0")}:00`
            ),
            value: interpolatedValue,
          });
        } else {
          // If still no value, use linear interpolation between nearest known values
          const knownMinutes = Array.from(currentDayData.keys()).sort((a, b) => a - b);
          const prevKnownMinute = knownMinutes.filter((m) => m < minute).pop();
          const nextKnownMinute = knownMinutes.find((m) => m > minute);

          if (prevKnownMinute !== undefined && nextKnownMinute !== undefined) {
            const prevValue = currentDayData.get(prevKnownMinute)!;
            const nextValue = currentDayData.get(nextKnownMinute)!;
            const ratio = (minute - prevKnownMinute) / (nextKnownMinute - prevKnownMinute);
            interpolatedValue = prevValue + (nextValue - prevValue) * ratio;

            interpolated.push({
              time: new Date(
                `${dateKey}T${Math.floor(minute / 60)
                  .toString()
                  .padStart(2, "0")}:${(minute % 60).toString().padStart(2, "0")}:00`
              ),
              value: interpolatedValue,
            });
          }
        }
      }
    }
  });

  return interpolated.sort((a, b) => a.time.getTime() - b.time.getTime());
};

// Export the interpolation function
export { interpolateData };
