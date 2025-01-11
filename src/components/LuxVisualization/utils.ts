import { EnvironmentalData } from "../../hooks/useEnvironmentalData";

const MINUTES_IN_DAY = 1440;

export const getColorForLux = (lux: number, minLux: number, maxLux: number): string => {
  // Define our grayscale color stops
  const colorStops = [
    { value: 50, color: "#F2F0E5" },
    { value: 100, color: "#E6E4D9" },
    { value: 150, color: "#DAD8CE" },
    { value: 200, color: "#CECDC3" },
    { value: 300, color: "#B7B5AC" },
    { value: 400, color: "#9F9D96" },
    { value: 500, color: "#878580" },
    { value: 600, color: "#6F6E69" },
    { value: 700, color: "#575653" },
    { value: 800, color: "#403E3C" },
    { value: 850, color: "#343331" },
    { value: 900, color: "#282726" },
    { value: 950, color: "#1C1B1A" },
  ];

  // Normalize the lux value to a 0-1000 scale
  const normalizedLux = ((lux - minLux) / (maxLux - minLux)) * 1000;

  // Find the appropriate color stops
  for (let i = 0; i < colorStops.length - 1; i++) {
    const currentStop = colorStops[i];
    const nextStop = colorStops[i + 1];

    if (normalizedLux <= currentStop.value) return currentStop.color;
    if (normalizedLux > currentStop.value && normalizedLux <= nextStop.value) {
      // Calculate the interpolation factor between the two color stops
      return currentStop.color;
    }
  }

  return colorStops[colorStops.length - 1].color;
};

export const organizeDataByDay = (data: Array<{ time: Date; value: number }>) => {
  const days = new Map<string, Array<{ time: Date; value: number }>>();

  data.forEach((entry) => {
    const date = entry.time.toISOString().split("T")[0];
    if (!days.has(date)) {
      days.set(date, []);
    }
    days.get(date)?.push(entry);
  });

  return Array.from(days.values());
};

export const getLuxRange = (data: Array<{ time: Date; value: number }>) => {
  let min = Infinity;
  let max = -Infinity;

  data.forEach((entry) => {
    min = Math.min(min, entry.value);
    max = Math.max(max, entry.value);
  });

  return { min, max };
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
