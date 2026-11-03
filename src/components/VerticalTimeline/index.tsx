import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { loadDayNight, loadHourly } from "../../lib/archive";

interface DataPoint {
  timestamp: Date;
  value: number;
  sensorId: string;
  normalizedValue: number;
  _metadata?: {
    date: string;
    period: "day" | "night";
    time_start?: string;
    time_end?: string;
  };
}

interface SensorConfig {
  sensorId: string;
  name: string;
  color: string;
  unit: string;
  range: [number, number];
}

// Flexoki color palette - https://github.com/kepano/flexoki
const FLEXOKI = {
  red: {
    400: "#DA705C",
    500: "#CB6120",
    600: "#BC5215",
  },
  orange: {
    400: "#DA702C",
    500: "#CB6120",
    600: "#BC5215",
  },
  yellow: {
    400: "#D0A215",
    500: "#BE9207",
    600: "#AD8301",
  },
  green: {
    400: "#879A39",
    500: "#768D21",
    600: "#66800B",
  },
  cyan: {
    400: "#3AA99F",
    500: "#2F968D",
    600: "#24837B",
  },
  blue: {
    400: "#4385BE",
    500: "#3171B2",
    600: "#205EA6",
  },
  purple: {
    400: "#8B7EC8",
    500: "#735EB5",
    600: "#5E409D",
  },
  magenta: {
    400: "#CE5D97",
    500: "#B74583",
    600: "#A02F6F",
  },
};

const SENSOR_CONFIGS: SensorConfig[] = [
  { sensorId: "temp", name: "Temperature", color: FLEXOKI.red[500], unit: "°C", range: [-40, 85] },
  { sensorId: "hum", name: "Humidity", color: FLEXOKI.cyan[500], unit: "%", range: [0, 100] },
  { sensorId: "pressure", name: "Pressure", color: FLEXOKI.blue[500], unit: "hPa", range: [300, 1100] },
  { sensorId: "lux", name: "Light", color: FLEXOKI.yellow[500], unit: "lux", range: [0, 88000] },
  { sensorId: "uv", name: "UV", color: FLEXOKI.purple[500], unit: "index", range: [0, 11] },
  { sensorId: "gas", name: "Gas", color: FLEXOKI.orange[500], unit: "ppm", range: [0, 1000] },
];

/**
 * Decimates data points using Largest-Triangle-Three-Buckets (LTTB) algorithm
 * to reduce data while preserving visual features like peaks and valleys.
 */
const decimateData = (data: DataPoint[], threshold: number): DataPoint[] => {
  if (data.length <= threshold) {
    return data;
  }

  if (threshold < 3) {
    const step = Math.floor(data.length / Math.max(1, threshold));
    return data.filter((_, i) => i % step === 0 || i === data.length - 1);
  }

  const bucketSize = (data.length - 2) / (threshold - 2);
  const sampled: DataPoint[] = [data[0]];

  let a = 0;

  for (let i = 0; i < threshold - 2; i++) {
    const rangeStart = Math.floor((i + 1) * bucketSize) + 1;
    const rangeEnd = Math.floor((i + 2) * bucketSize) + 1;
    const rangeEndClamped = Math.min(rangeEnd, data.length);

    let avgX = 0;
    let avgY = 0;
    let pointCount = 0;

    for (let j = rangeStart; j < rangeEndClamped; j++) {
      avgX += data[j].timestamp.getTime();
      avgY += data[j].normalizedValue;
      pointCount++;
    }
    if (pointCount > 0) {
      avgX /= pointCount;
      avgY /= pointCount;
    }

    let maxArea = -1;
    let maxAreaPoint = rangeStart;
    const ax = data[a].timestamp.getTime();
    const ay = data[a].normalizedValue;

    for (let j = rangeStart; j < rangeEndClamped; j++) {
      const bx = avgX;
      const by = avgY;
      const cx = data[j].timestamp.getTime();
      const cy = data[j].normalizedValue;

      const area = Math.abs((ax - cx) * (by - ay) - (ax - bx) * (cy - ay));
      if (area > maxArea) {
        maxArea = area;
        maxAreaPoint = j;
      }
    }

    sampled.push(data[maxAreaPoint]);
    a = maxAreaPoint;
  }

  sampled.push(data[data.length - 1]);
  return sampled;
};

const normalizeValue = (value: number, sensorRange: [number, number], sensorId: string): number => {
  if (value == null || isNaN(value) || !isFinite(value)) {
    return 0;
  }

  const [min, max] = sensorRange;

  if (min >= max || !isFinite(min) || !isFinite(max)) {
    return 0;
  }

  const clampedValue = Math.max(min, Math.min(max, value));

  if (sensorId.includes("gas") || sensorId.includes("lux")) {
    const positiveMin = Math.max(0.1, min);
    const positiveValue = Math.max(0.1, clampedValue);
    const positiveMax = Math.max(positiveMin + 0.1, max);

    const logValue = Math.log10(positiveValue);
    const logMin = Math.log10(positiveMin);
    const logMax = Math.log10(positiveMax);

    if (logMax === logMin) {
      return 50;
    }

    const normalized = ((logValue - logMin) / (logMax - logMin)) * 100;
    return Math.max(0, Math.min(100, normalized));
  }

  const normalized = ((clampedValue - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, normalized));
};

export const VerticalTimeline = () => {
  // Initialize state from URL params
  const getInitialSensorsFromURL = (): Set<string> => {
    const params = new URLSearchParams(window.location.search);
    const sensorsParam = params.get("sensors");
    if (sensorsParam) {
      const sensorIds = sensorsParam.split(",").filter((id) => SENSOR_CONFIGS.some((c) => c.sensorId === id));
      if (sensorIds.length > 0) {
        return new Set(sensorIds);
      }
    }
    return new Set(SENSOR_CONFIGS.map((c) => c.sensorId));
  };

  const getInitialDaysFromURL = (): number | null => {
    const params = new URLSearchParams(window.location.search);
    const daysParam = params.get("days");
    if (daysParam === "all") return null;
    const days = parseInt(daysParam || "");
    if (!isNaN(days) && days > 0) return days;
    return 7; // Default to 7 days
  };

  const [data, setData] = useState<Record<string, DataPoint[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadedPages, setLoadedPages] = useState(0);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [selectedSensors, setSelectedSensors] = useState<Set<string>>(getInitialSensorsFromURL());
  const [timeRange, setTimeRange] = useState<{ start: Date; end: Date } | null>(null);
  const [viewStartDate, setViewStartDate] = useState<Date | null>(null);
  const [viewEndDate, setViewEndDate] = useState<Date | null>(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const initialDays = getInitialDaysFromURL();

  // Update URL params when state changes
  const updateURLParams = useCallback((sensors: Set<string>, days: number | null) => {
    const params = new URLSearchParams();

    // Only add sensors param if not all sensors are selected
    if (sensors.size !== SENSOR_CONFIGS.length) {
      params.set("sensors", Array.from(sensors).join(","));
    }

    // Add days param
    if (days === null) {
      params.set("days", "all");
    } else if (days !== 7) {
      // Only add if not default
      params.set("days", days.toString());
    }

    // Update URL with query params (format: /timeline?sensors=temp&days=30)
    const queryString = params.toString();
    const newURL = queryString ? `/timeline?${queryString}` : "/timeline";
    window.history.replaceState({}, "", newURL);
  }, []);

  // Fetch a single page of daily day/night data for lazy loading
  const fetchDataPage = useCallback(
    async (
      startTime: Date | undefined,
      endTime: Date | undefined,
      page: number,
      pageSize: number = 1000
    ) => {
      const start = startTime?.toISOString().split("T")[0];
      const end = endTime?.toISOString().split("T")[0];
      const rows = (await loadDayNight())
        .filter((row) => (!start || row.date >= start) && (!end || row.date <= end))
        .sort((a, b) => b.date.localeCompare(a.date) || b.period.localeCompare(a.period));

      const offset = page * pageSize;
      const data = rows.slice(offset, offset + pageSize);
      return { data, totalCount: rows.length, hasMore: offset + pageSize < rows.length };
    },
    []
  );

  // Fetch hourly data for a specific date and period (for hover details)
  const fetchHourlyDataForHover = useCallback(async (date: Date, period: "day" | "night"): Promise<DataPoint[]> => {
    try {
      // Calculate the time range for this date/period
      // Day: 6 AM - 6 PM
      // Night: 6 PM (previous day) - 6 AM (current day)
      const dayStart = new Date(date);
      dayStart.setHours(6, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(18, 0, 0, 0);

      let startTime: Date;
      let endTime: Date;

      if (period === "day") {
        startTime = dayStart;
        endTime = dayEnd;
      } else {
        // Night spans from 6 PM previous day to 6 AM current day
        startTime = new Date(dayStart);
        startTime.setDate(startTime.getDate() - 1);
        startTime.setHours(18, 0, 0, 0);
        endTime = dayStart;
      }

      const rawData = (await loadHourly()).filter((row) => {
        const t = new Date(row.time).getTime();
        return t >= startTime.getTime() && t <= endTime.getTime();
      });

      if (!rawData || rawData.length === 0) {
        return [];
      }

      // Process hourly data into DataPoint format
      const processedPoints: DataPoint[] = [];

      SENSOR_CONFIGS.forEach((config) => {
        rawData.forEach((row: any) => {
          const value = Number(row[config.sensorId as keyof typeof row]);
          if (value != null && !isNaN(value)) {
            let timestamp: Date;
            const timeValue = row.time;

            if (typeof timeValue === "string") {
              timestamp = new Date(timeValue);
              if (isNaN(timestamp.getTime())) {
                timestamp = new Date(timeValue + "Z");
              }
            } else {
              timestamp = new Date(timeValue);
            }

            processedPoints.push({
              timestamp,
              value,
              sensorId: config.sensorId,
              normalizedValue: normalizeValue(value, config.range, config.sensorId),
            });
          }
        });
      });

      return processedPoints.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    } catch (err) {
      return [];
    }
  }, []);

  // Process raw daily day/night data into DataPoint format
  const processRawData = useCallback((rawData: any[]): Record<string, DataPoint[]> => {
    const processedData: Record<string, DataPoint[]> = {};

    SENSOR_CONFIGS.forEach((config) => {
      processedData[config.sensorId] = rawData
        .filter((row: any) => row[config.sensorId as keyof typeof row] != null)
        .map((row: any) => {
          // Parse date and create timestamp
          // Use time_start if available, otherwise construct from date + period
          let timestamp: Date;

          if (row.time_start) {
            const timeValue = row.time_start;
            if (typeof timeValue === "string") {
              timestamp = new Date(timeValue);
              if (isNaN(timestamp.getTime())) {
                timestamp = new Date(timeValue + "Z");
              }
            } else {
              timestamp = new Date(timeValue);
            }
          } else {
            // Construct timestamp from date + period
            const dateStr = row.date;
            const period = row.period;

            if (dateStr) {
              timestamp = new Date(dateStr);
              // Set to middle of the period for display
              if (period === "day") {
                timestamp.setHours(12, 0, 0, 0); // Noon
              } else {
                timestamp.setHours(0, 0, 0, 0); // Midnight
              }
            } else {
              timestamp = new Date();
            }
          }

          // Ensure we have a valid timestamp
          if (isNaN(timestamp.getTime())) {
            timestamp = new Date();
          }

          return {
            timestamp,
            value: Number(row[config.sensorId as keyof typeof row]) || 0,
            sensorId: config.sensorId,
            normalizedValue: normalizeValue(
              Number(row[config.sensorId as keyof typeof row]),
              config.range,
              config.sensorId
            ),
            // Store additional metadata for hover
            _metadata: {
              date: row.date,
              period: row.period,
              time_start: row.time_start,
              time_end: row.time_end,
            },
          };
        })
        // Reverse to get chronological order (oldest first) since query is descending
        .reverse()
        // Sort by timestamp to ensure proper order
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    });

    return processedData;
  }, []);

  // Load initial page of data on mount
  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      setError(null);
      setLoadedPages(0);

      try {
        // Daily data has 2 rows per day (day + night), so we can use larger page size
        // Use recent view for initial load (fast, optimized for last 90 days)
        const pageSize = 2000; // ~1000 days worth of data
        const result = await fetchDataPage(undefined, undefined, 0, pageSize);

        if (result.data && result.data.length > 0) {
          const processedData = processRawData(result.data);

          // Calculate total pages from count
          const total = result.totalCount || result.data.length;
          const pages = Math.ceil(total / pageSize);
          setTotalPages(pages);

          const totalPoints = Object.values(processedData).reduce((sum, points) => sum + points.length, 0);
          if (totalPoints === 0) {
            setError("No sensor data found in the database");
          } else {
            setData(processedData);
            setLoadedPages(1);

            // Calculate time range from initial data
            // For the initial range, we'll use the database query to get the actual min/max
            // This gives us the true range even if we haven't loaded all pages yet
            const allTimestamps = Object.values(processedData)
              .flat()
              .map((p: DataPoint) => p.timestamp);

            if (allTimestamps.length > 0) {
              // Get the range from the first page (most recent data)
              const firstPageEnd = new Date(Math.max(...allTimestamps.map((t: Date) => t.getTime())));
              const firstPageStart = new Date(Math.min(...allTimestamps.map((t: Date) => t.getTime())));

              // For initial load with recent view, we only have ~90 days of data
              // Just use the range from the first page - no need to query for earliest date
              // SQL query already excludes current day, so use the data as-is
              const fullStart = firstPageStart;
              const fullEnd = new Date(firstPageEnd);
              fullEnd.setHours(23, 59, 59, 999); // End of the most recent day (already excludes today via SQL)

              setTimeRange({ start: fullStart, end: fullEnd });
              if (!viewStartDate || !viewEndDate) {
                // Default to 7 day view ending at the most recent available data
                const defaultEnd = new Date(fullEnd);
                const defaultStart = new Date(defaultEnd);
                defaultStart.setDate(defaultStart.getDate() - 7);
                setViewStartDate(defaultStart);
                setViewEndDate(defaultEnd);
              }
            }

            // Don't load remaining pages for initial load with recent view
            // Only load more if user explicitly requests "All" (which uses full view)
            // The recent view only has ~90 days, so we likely won't have multiple pages
            // If we do, load them but still use recent view
            if (pages > 1) {
              loadRemainingPages(pages, pageSize);
            }
          }
        } else {
          setError("Failed to fetch sensor data - query returned no results. Check if the table has data.");
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to load sensor data";
        setError(`Failed to load sensor data: ${errorMessage}`);
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Load remaining pages in the background
  const loadRemainingPages = useCallback(
    async (totalPages: number, pageSize: number) => {
      setIsLoadingMore(true);

      try {
        for (let page = 1; page < totalPages; page++) {
          const result = await fetchDataPage(undefined, undefined, page, pageSize);

          if (result.data && result.data.length > 0) {
            const newProcessedData = processRawData(result.data);

            // Merge new data with existing data
            setData((prevData) => {
              const merged: Record<string, DataPoint[]> = {};

              SENSOR_CONFIGS.forEach((config) => {
                const existing = prevData[config.sensorId] || [];
                const newPoints = newProcessedData[config.sensorId] || [];

                // Combine and deduplicate by timestamp
                const combined: DataPoint[] = [...existing, ...newPoints];
                const unique = combined.reduce((acc, point: DataPoint) => {
                  const key = point.timestamp.getTime();
                  if (!acc.has(key)) {
                    acc.set(key, point);
                  }
                  return acc;
                }, new Map<number, DataPoint>());

                // Sort chronologically
                merged[config.sensorId] = Array.from(unique.values()).sort(
                  (a: DataPoint, b: DataPoint) => a.timestamp.getTime() - b.timestamp.getTime()
                );
              });

              return merged;
            });

            setLoadedPages((prev) => prev + 1);

            // Update time range as we load more data
            const allTimestamps = Object.values(newProcessedData)
              .flat()
              .map((p: DataPoint) => p.timestamp);

            if (allTimestamps.length > 0) {
              const newStart = new Date(Math.min(...allTimestamps.map((t) => t.getTime())));
              const newEnd = new Date(Math.max(...allTimestamps.map((t) => t.getTime())));
              // SQL query already excludes current day, use data as-is
              newEnd.setHours(23, 59, 59, 999);

              setTimeRange((prev) => {
                if (!prev) return { start: newStart, end: newEnd };

                const overallStart = prev.start < newStart ? prev.start : newStart;
                const overallEnd = prev.end > newEnd ? prev.end : newEnd;

                return { start: overallStart, end: overallEnd };
              });
            }
          }
        }
      } catch (err) {
        // Silent error handling - pages load in background
      } finally {
        setIsLoadingMore(false);
      }
    },
    [fetchDataPage, processRawData]
  );

  // Handle window resize for responsive chart
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Prepare data for vertical timeline visualization
  const timelineData = useMemo(() => {
    if (!data || Object.keys(data).length === 0) {
      return {
        sensorLines: [] as Array<{ sensorId: string; points: DataPoint[]; config: SensorConfig }>,
        timeRange: null,
        chartDimensions: null,
      };
    }

    const sensorLines: Array<{ sensorId: string; points: DataPoint[]; config: SensorConfig }> = [];

    // First pass: collect all points for each sensor to calculate actual min/max
    const sensorRanges: Record<string, { min: number; max: number }> = {};
    SENSOR_CONFIGS.forEach((config) => {
      if (!selectedSensors.has(config.sensorId)) return;

      // Only use day/night aggregated data points (those with _metadata)
      // Exclude any hourly hover data that might have been mixed in
      let sensorPoints = (data[config.sensorId] || []).filter((p) => p._metadata !== undefined);

      // Filter by date range if set
      if (viewStartDate && viewEndDate) {
        const startTime = viewStartDate.getTime();
        const endTime = viewEndDate.getTime();

        sensorPoints = sensorPoints.filter((point) => {
          const ts = point.timestamp.getTime();
          // Include points that are within the range (inclusive on both ends)
          // Add 1 day buffer to endTime to include the entire end day
          const endTimeWithBuffer = endTime + 24 * 60 * 60 * 1000;
          return ts >= startTime && ts <= endTimeWithBuffer;
        });
      }

      if (sensorPoints.length === 0) return;

      // Calculate actual min/max from data
      const values = sensorPoints.map((p) => p.value).filter((v) => isFinite(v) && !isNaN(v));
      if (values.length > 0) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        sensorRanges[config.sensorId] = { min, max };
      }
    });

    // Second pass: process each sensor with proper normalization
    SENSOR_CONFIGS.forEach((config) => {
      if (!selectedSensors.has(config.sensorId)) return;

      // Only use day/night aggregated data points (those with _metadata)
      // Exclude any hourly hover data that might have been mixed in
      let sensorPoints = (data[config.sensorId] || []).filter((p) => p._metadata !== undefined);

      // Filter by date range if set
      if (viewStartDate && viewEndDate) {
        const startTime = viewStartDate.getTime();
        const endTime = viewEndDate.getTime();

        sensorPoints = sensorPoints.filter((point) => {
          const ts = point.timestamp.getTime();
          // Include points that are within the range (inclusive on both ends)
          // Add 1 day buffer to endTime to include the entire end day
          const endTimeWithBuffer = endTime + 24 * 60 * 60 * 1000;
          return ts >= startTime && ts <= endTimeWithBuffer;
        });
      }

      // Sort chronologically
      sensorPoints.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      // Re-normalize using actual data range
      // Normalize to 5-95 scale (with padding) so lines never hit edges
      // This keeps a 5% margin on each side for clean visualization
      const range = sensorRanges[config.sensorId];
      if (range) {
        const actualMin = range.min;
        const actualMax = range.max;
        const rangeSize = actualMax - actualMin;

        // Padding: normalize to 10-90% to keep lines away from edges but use more chart width
        // Bezier control points extend curves slightly, so we use 10% margins
        const minPadding = 10;
        const maxPadding = 90;
        const paddingRange = maxPadding - minPadding;

        if (rangeSize > 0 && isFinite(actualMin) && isFinite(actualMax)) {
          sensorPoints = sensorPoints.map((point) => {
            // Ensure value is within the actual data range
            const clampedValue = Math.max(actualMin, Math.min(actualMax, point.value));

            let normalizedValue: number;
            if (config.sensorId.includes("gas") || config.sensorId.includes("lux")) {
              // Log scale for gas and lux - handle edge cases carefully
              const positiveMin = Math.max(0.001, actualMin); // Avoid log(0)
              const positiveValue = Math.max(0.001, clampedValue);
              const positiveMax = Math.max(positiveMin * 1.001, actualMax); // Ensure max > min

              const logValue = Math.log10(positiveValue);
              const logMin = Math.log10(positiveMin);
              const logMax = Math.log10(positiveMax);

              if (logMax <= logMin || !isFinite(logValue) || !isFinite(logMin) || !isFinite(logMax)) {
                // Fallback to linear if log scale fails
                const linearNormalized = (clampedValue - actualMin) / rangeSize;
                normalizedValue = minPadding + linearNormalized * paddingRange;
              } else {
                const logNormalized = (logValue - logMin) / (logMax - logMin);
                normalizedValue = minPadding + logNormalized * paddingRange;
              }
            } else {
              // Linear scale - simple and reliable
              const linearNormalized = (clampedValue - actualMin) / rangeSize;
              normalizedValue = minPadding + linearNormalized * paddingRange;
            }

            // Ensure normalized value is always strictly within padding bounds (10-90)
            const finalNormalized = Math.max(
              minPadding,
              Math.min(maxPadding, isFinite(normalizedValue) ? normalizedValue : 50)
            );

            return {
              ...point,
              normalizedValue: finalNormalized,
            };
          });
        } else {
          // If range is invalid, set all to middle value (within padding range)
          sensorPoints = sensorPoints.map((point) => ({
            ...point,
            normalizedValue: 50,
          }));
        }
      } else {
        // No range calculated, set to middle (within padding range)
        sensorPoints = sensorPoints.map((point) => ({
          ...point,
          normalizedValue: 50,
        }));
      }

      // Decimate for performance - reduce granularity significantly
      const viewportHeight = window.innerHeight || 800;
      // Use more points for smoother curves - approximately 1 point per 3 pixels
      const maxPoints = Math.max(300, Math.floor(viewportHeight / 3));
      const decimatedPoints = decimateData(sensorPoints, maxPoints);

      sensorLines.push({
        sensorId: config.sensorId,
        points: decimatedPoints,
        config,
      });
    });

    // Calculate time range - use actual data range for positioning, view dates only for filtering
    let timeStart: number | null = null;
    let timeEnd: number | null = null;
    let timeRange: number | null = null;

    // Always use actual day/night data range for timeStart/timeEnd to ensure proper positioning
    // Only use points from day/night data, not hourly hover data
    // Filter to ensure we only use day/night aggregated points (those with _metadata)
    const dayNightPoints = sensorLines.flatMap((line) =>
      line.points
        .filter((p) => p._metadata !== undefined)
        .map((p) => p.timestamp.getTime())
    );

    if (dayNightPoints.length > 0) {
      timeStart = Math.min(...dayNightPoints);
      timeEnd = Math.max(...dayNightPoints); // Points already filtered to exclude current day
      timeRange = timeEnd - timeStart;
    } else if (viewStartDate && viewEndDate) {
      // Fallback to view dates if no data points available
      timeStart = viewStartDate.getTime();
      timeEnd = viewEndDate.getTime();
      timeRange = timeEnd - timeStart;
    }

    // Chart dimensions - height is unbounded, based on data
    // Minimal padding following Tufte principles - no top/bottom padding to maximize data display
    const isMobile = windowWidth < 768;
    const chartPadding = isMobile
      ? { top: 0, right: 20, bottom: 0, left: 60 }
      : { top: 0, right: 30, bottom: 0, left: 80 };

    // Responsive width: full viewport width
    const chartWidth = isMobile
      ? Math.max(320, windowWidth)
      : Math.min(windowWidth, Math.max(800, windowWidth));

    // Calculate chart height based on days, not hours
    // Use a fixed pixel height per day for consistent sizing across all time frames
    const pixelsPerDay = 100; // 100 pixels per day - keeps days same size across all time frames

    let chartHeight: number;
    if (timeRange && sensorLines.length > 0) {
      // Calculate based on actual day/night data range only (not hourly hover data)
      // Filter to only use day/night aggregated points
      let actualDataStart = Infinity;
      let actualDataEnd = -Infinity;

      sensorLines.forEach((line) => {
        // Only consider day/night points (those with _metadata)
        const dayNightPoints = line.points.filter((p) => p._metadata !== undefined);
        if (dayNightPoints.length > 0) {
          // Points are sorted chronologically
          const lineStart = dayNightPoints[0].timestamp.getTime();
          const lineEnd = dayNightPoints[dayNightPoints.length - 1].timestamp.getTime();
          actualDataStart = Math.min(actualDataStart, lineStart);
          actualDataEnd = Math.max(actualDataEnd, lineEnd);
        }
      });

      // Use the actual day/night data range if we have data points
      const dataRange = actualDataStart < actualDataEnd ? actualDataEnd - actualDataStart : timeRange;
      const daysInRange = dataRange / (1000 * 60 * 60 * 24);

      // No buffer - let data extend to full height
      chartHeight = Math.max(600, daysInRange * pixelsPerDay);
    } else if (timeRange) {
      // Fallback: use timeRange if we don't have sensor lines yet
      const daysInRange = timeRange / (1000 * 60 * 60 * 24);
      chartHeight = Math.max(600, daysInRange * pixelsPerDay);
    } else {
      // Fallback to viewport height if no time range
      chartHeight = 600;
    }

    // Calculate plot width ensuring it fits within available space
    const plotWidth = Math.max(0, chartWidth - chartPadding.left - chartPadding.right);

    return {
      sensorLines,
      timeRange,
      timeStart,
      timeEnd,
      chartDimensions: {
        width: chartWidth,
        height: chartHeight,
        padding: chartPadding,
        plotWidth: plotWidth,
        plotHeight: chartHeight - chartPadding.top - chartPadding.bottom,
      },
    };
  }, [data, selectedSensors, viewStartDate, viewEndDate, windowWidth]);

  // Helper function to evaluate a cubic bezier curve at parameter t (0 to 1)
  const evaluateBezier = (
    p0: { x: number; y: number },
    cp1: { x: number; y: number },
    cp2: { x: number; y: number },
    p3: { x: number; y: number },
    t: number
  ): { x: number; y: number } => {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const t2 = t * t;
    const t3 = t2 * t;

    return {
      x: mt3 * p0.x + 3 * mt2 * t * cp1.x + 3 * mt * t2 * cp2.x + t3 * p3.x,
      y: mt3 * p0.y + 3 * mt2 * t * cp1.y + 3 * mt * t2 * cp2.y + t3 * p3.y,
    };
  };

  // Helper function to find point on bezier curve at a given Y coordinate
  // Uses binary search to find the t parameter that yields the target Y
  const findPointOnBezierAtY = (
    p0: { x: number; y: number },
    cp1: { x: number; y: number },
    cp2: { x: number; y: number },
    p3: { x: number; y: number },
    targetY: number,
    tolerance: number = 0.1
  ): { x: number; y: number } | null => {
    // Binary search for t value that gives us targetY
    let low = 0;
    let high = 1;
    let bestT = 0.5;
    let bestDiff = Infinity;

    for (let i = 0; i < 20; i++) {
      const t = (low + high) / 2;
      const point = evaluateBezier(p0, cp1, cp2, p3, t);
      const diff = Math.abs(point.y - targetY);

      if (diff < bestDiff) {
        bestDiff = diff;
        bestT = t;
      }

      if (diff < tolerance) {
        return point;
      }

      if (point.y < targetY) {
        low = t;
      } else {
        high = t;
      }
    }

    // Return best approximation
    return evaluateBezier(p0, cp1, cp2, p3, bestT);
  };

  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverState, setHoverState] = useState<{
    x: number;
    y: number;
    timestamp: Date;
    sensors: Array<{ sensorId: string; value: number; normalizedValue: number; config: SensorConfig }>;
    hoveredSensorId: string | null; // Track which sensor line is being hovered
    hourlyData?: DataPoint[]; // Hourly data for the hovered point
  } | null>(null);
  const [hoverHourlyData, setHoverHourlyData] = useState<Record<string, DataPoint[]>>({});

  // Handle mouse move for tooltip - detect which line is closest
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!timelineData.chartDimensions || !svgRef.current) return;

      const svg = svgRef.current;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const { padding, plotWidth, plotHeight } = timelineData.chartDimensions;
      const { timeStart, timeEnd, timeRange } = timelineData;

      // Check if within plot area
      if (
        x < padding.left ||
        x > padding.left + plotWidth ||
        y < padding.top ||
        y > padding.top + plotHeight ||
        !timeStart ||
        !timeEnd ||
        !timeRange
      ) {
        setHoverState(null);
        return;
      }

      // Calculate timestamp from Y position
      const plotY = y - padding.top;
      const timeRatio = 1 - plotY / plotHeight; // Invert so top is newest
      const hoverTimestamp = timeStart + timeRange * timeRatio;

      // Find the closest sensor line to the mouse X position
      let closestLine: { line: (typeof timelineData.sensorLines)[0]; distance: number } | null = null;

      for (const line of timelineData.sensorLines) {
        // Find the point on this line closest to the hover timestamp
        let closestPoint: DataPoint | null = null;
        let minTimeDistance = Infinity;

        for (const point of line.points) {
          const timeDistance = Math.abs(point.timestamp.getTime() - hoverTimestamp);
          if (timeDistance < minTimeDistance) {
            minTimeDistance = timeDistance;
            closestPoint = point;
          }
        }

        if (closestPoint) {
          // Calculate the X position of this point on the chart
          const pointX = padding.left + (plotWidth * closestPoint.normalizedValue) / 100;
          // Calculate distance from mouse X to this point's X
          const xDistance = Math.abs(x - pointX);

          if (!closestLine || xDistance < closestLine.distance) {
            closestLine = { line, distance: xDistance };
          }
        }
      }

      // Only show data for the closest sensor line
      const sensors: Array<{ sensorId: string; value: number; normalizedValue: number; config: SensorConfig }> = [];
      let closestPoint: DataPoint | null = null;

      if (closestLine) {
        // Find closest point to hover timestamp for the hovered line
        let minDistance = Infinity;

        for (const point of closestLine.line.points) {
          const distance = Math.abs(point.timestamp.getTime() - hoverTimestamp);
          if (distance < minDistance) {
            minDistance = distance;
            closestPoint = point;
          }
        }

        if (closestPoint) {
          sensors.push({
            sensorId: closestLine.line.sensorId,
            value: closestPoint.value,
            normalizedValue: closestPoint.normalizedValue,
            config: closestLine.line.config,
          });

          // If this is a day/night point with metadata, fetch hourly data on hover
          if (
            closestPoint._metadata &&
            !hoverHourlyData[`${closestPoint._metadata.date}-${closestPoint._metadata.period}`]
          ) {
            const metadata = closestPoint._metadata;
            const date = new Date(metadata.date);
            fetchHourlyDataForHover(date, metadata.period).then((hourlyPoints) => {
              if (hourlyPoints.length > 0) {
                setHoverHourlyData((prev) => ({
                  ...prev,
                  [`${metadata.date}-${metadata.period}`]: hourlyPoints,
                }));
              }
            });
          }
        }
      }

      // Get hourly data if available for the hovered point
      let hourlyDataForHover: DataPoint[] | undefined;
      if (closestPoint?._metadata) {
        const key = `${closestPoint._metadata.date}-${closestPoint._metadata.period}`;
        hourlyDataForHover = hoverHourlyData[key];
      }

      setHoverState({
        x: e.clientX,
        y: e.clientY,
        timestamp: new Date(hoverTimestamp),
        sensors,
        hoveredSensorId: closestLine?.line.sensorId || null,
        hourlyData: hourlyDataForHover,
      });
    },
    [timelineData, fetchHourlyDataForHover, hoverHourlyData]
  );

  const handleMouseLeave = useCallback(() => {
    setHoverState(null);
  }, []);

  // Helper to get current days value for URL
  const getCurrentDaysValue = useCallback((): number | null => {
    if (!viewStartDate || !viewEndDate || !timeRange) return null;
    const daysDiff = Math.round((viewEndDate.getTime() - viewStartDate.getTime()) / (1000 * 60 * 60 * 24));
    // Check if it matches common presets
    if (Math.abs(daysDiff - 7) < 1) return 7;
    if (Math.abs(daysDiff - 30) < 1) return 30;
    if (Math.abs(daysDiff - 90) < 1) return 90;
    // Check if showing all data
    if (!viewStartDate && !viewEndDate) return null;
    return daysDiff;
  }, [viewStartDate, viewEndDate, timeRange]);

  // Toggle sensor visibility
  const toggleSensor = useCallback(
    (sensorId: string) => {
      setSelectedSensors((prev) => {
        const next = new Set(prev);
        if (next.has(sensorId)) {
          next.delete(sensorId);
        } else {
          next.add(sensorId);
        }

        // Update URL with new sensor selection
        const currentDays = getCurrentDaysValue();
        updateURLParams(next, currentDays);

        return next;
      });
    },
    [updateURLParams, getCurrentDaysValue]
  );

  // Date range controls
  const setDateRange = useCallback(
    (days: number) => {
      if (!timeRange) return;

      // Use the latest available data point as the end
      const dataEnd = new Date(timeRange.end);
      const dataStart = new Date(timeRange.start);

      // Calculate start date N days before end
      const calculatedStart = new Date(dataEnd.getTime() - days * 24 * 60 * 60 * 1000);

      // Clamp start to actual data range (don't go before available data)
      const start = calculatedStart < dataStart ? dataStart : calculatedStart;
      const end = dataEnd;

      setViewStartDate(start);
      setViewEndDate(end);

      // Update URL
      updateURLParams(selectedSensors, days);
    },
    [timeRange, selectedSensors, updateURLParams]
  );

  // Apply initial days from URL after data is loaded
  useEffect(() => {
    if (!isLoading && timeRange && initialDays !== null && !viewStartDate && !viewEndDate) {
      setDateRange(initialDays);
    }
  }, [isLoading, timeRange, initialDays, viewStartDate, viewEndDate, setDateRange]);

  const showAllTime = useCallback(async () => {
    // Clear view dates to show all available data (not limited to 90 days)
    setViewStartDate(null);
    setViewEndDate(null);

    // Update URL
    updateURLParams(selectedSensors, null);

    // Reload data using the full view (not the recent view)
    // This will fetch all available data in pages
    setIsLoading(true);
    setIsLoadingMore(false);
    setLoadedPages(0);
    setData({});

    try {
      const pageSize = 1000; // Smaller page size for full view to avoid timeouts

      // Start with first page of full view
      const result = await fetchDataPage(undefined, undefined, 0, pageSize);

      if (result.data && result.data.length > 0) {
        const processedData = processRawData(result.data);
        const total = result.totalCount || result.data.length;
        const pages = Math.ceil(total / pageSize);
        setTotalPages(pages);

        setData(processedData);
        setLoadedPages(1);

        // Calculate time range
        const allTimestamps = Object.values(processedData)
          .flat()
          .map((p: DataPoint) => p.timestamp);

        if (allTimestamps.length > 0) {
          const firstPageEnd = new Date(Math.max(...allTimestamps.map((t: Date) => t.getTime())));
          const firstPageStart = new Date(Math.min(...allTimestamps.map((t: Date) => t.getTime())));

          // SQL query already excludes current day, use data as-is
          const fullEnd = new Date(firstPageEnd);
          fullEnd.setHours(23, 59, 59, 999);

          // For full view, we'll set start to the first page start
          // More pages will extend it backward as they load
          setTimeRange({ start: firstPageStart, end: fullEnd });
        }

        // Load remaining pages in background
        if (pages > 1) {
          loadRemainingPages(pages, pageSize);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load all data";
      setError(`Failed to load all data: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [fetchDataPage, processRawData, loadRemainingPages, selectedSensors, updateURLParams]);

  // Helper functions for active states
  const isDateRangeActive = useCallback(
    (days: number) => {
      if (!timeRange || !viewStartDate || !viewEndDate) return false;
      const now = timeRange.end;
      const expectedStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const startDiff = Math.abs(viewStartDate.getTime() - expectedStart.getTime());
      const endDiff = Math.abs(viewEndDate.getTime() - now.getTime());
      // Allow 1 hour tolerance for rounding
      return startDiff < 60 * 60 * 1000 && endDiff < 60 * 60 * 1000;
    },
    [timeRange, viewStartDate, viewEndDate]
  );

  const isAllTimeActive = useCallback(() => {
    // All is active when view dates are null (showing all available data)
    return !viewStartDate && !viewEndDate;
  }, [viewStartDate, viewEndDate]);

  if (isLoading) {
    return (
      <section>
        <div>Loading timeline data...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section>
        <div>{error}</div>
      </section>
    );
  }

  if (!timelineData.chartDimensions || timelineData.sensorLines.length === 0) {
    return (
      <section>
        <header>
          <h1>Sensor Timeline</h1>
        </header>
        <div>
          {error || "No data available"}
          <div style={{ marginTop: "1rem", fontSize: "0.875rem", opacity: 0.8 }}>
            Check the browser console for detailed error messages.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section>
      {/* Fixed controls at top */}
      <header>
        <div>
          <h1>Environmental Timeline</h1>
          {viewStartDate && viewEndDate && (
            <div>
              <span>
                {viewStartDate.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}{" "}
                –{" "}
                {viewEndDate.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
              {isLoadingMore && totalPages && (
                <span style={{ marginLeft: "0.75rem" }}>
                  ({loadedPages}/{totalPages})
                </span>
              )}
            </div>
          )}
        </div>

        <nav>
          <div>
            <label>Time Range</label>
            <div>
              <button
                onClick={() => setDateRange(7)}
                aria-pressed={isDateRangeActive(7)}
              >
                7d
              </button>
              <button
                onClick={() => setDateRange(30)}
                aria-pressed={isDateRangeActive(30)}
              >
                30d
              </button>
              <button
                onClick={() => setDateRange(90)}
                aria-pressed={isDateRangeActive(90)}
              >
                90d
              </button>
              <button
                onClick={showAllTime}
                aria-pressed={isAllTimeActive()}
              >
                All
              </button>
            </div>
          </div>

          <div>
            <label>Sensors</label>
            <div>
              {SENSOR_CONFIGS.map((config) => {
                const isActive = selectedSensors.has(config.sensorId);
                return (
                  <button
                    key={config.sensorId}
                    onClick={() => toggleSensor(config.sensorId)}
                    aria-pressed={isActive}
                    title={`${isActive ? "Hide" : "Show"} ${config.name}`}
                  >
                    <div
                      style={{
                        backgroundColor: config.color,
                        opacity: isActive ? 1 : 0.3,
                      }}
                    />
                    <span>{config.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </nav>
      </header>

      {/* Chart content */}
      <div>
        {timelineData.chartDimensions && (
          <div>
            <svg
              ref={svgRef}
              width={timelineData.chartDimensions.width}
              height={timelineData.chartDimensions.height}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              viewBox={`0 0 ${timelineData.chartDimensions.width} ${timelineData.chartDimensions.height}`}
              preserveAspectRatio='xMidYMid meet'
            >
              <defs>
                {/* Clip path to prevent overflow */}
                <clipPath id='chartClip'>
                  <rect
                    x='0'
                    y='0'
                    width={timelineData.chartDimensions.width}
                    height={timelineData.chartDimensions.height}
                  />
                </clipPath>
              </defs>

              {/* Clip all chart content to prevent overflow */}
              <g clipPath='url(#chartClip)'>
                {/* Day/Night banding background */}
                {timelineData.timeStart &&
                  timelineData.timeEnd &&
                  timelineData.timeRange &&
                  (() => {
                    const bands: Array<{ y: number; height: number; isDay: boolean }> = [];
                    const startTime = timelineData.timeStart!;
                    const endTime = timelineData.timeEnd!;
                    const timeRange = timelineData.timeRange!;
                    const padding = timelineData.chartDimensions.padding;
                    const plotHeight = timelineData.chartDimensions.plotHeight;

                    // Calculate Y position helper (time goes from newest at top to oldest at bottom)
                    const getY = (time: number) => {
                      const timeRatio = 1 - (time - startTime) / timeRange;
                      return padding.top + plotHeight * Math.max(0, Math.min(1, timeRatio));
                    };

                    // Use the actual data range or view range
                    const rangeStart = Math.max(startTime, viewStartDate?.getTime() || startTime);
                    const rangeEnd = Math.min(
                      endTime,
                      viewEndDate?.getTime() || endTime
                    );

                    // Iterate day by day, creating day and night bands
                    let currentDay = new Date(rangeStart);
                    currentDay.setHours(0, 0, 0, 0);

                    while (currentDay.getTime() < rangeEnd) {
                      const dayStart = new Date(currentDay);
                      dayStart.setHours(6, 0, 0, 0); // 6 AM - start of day period

                      const dayEnd = new Date(currentDay);
                      dayEnd.setHours(18, 0, 0, 0); // 6 PM - end of day period

                      const nightStart = new Date(currentDay);
                      if (currentDay.getTime() < dayStart.getTime()) {
                        // Before 6 AM - this is the night period from previous day
                        nightStart.setDate(nightStart.getDate() - 1);
                        nightStart.setHours(18, 0, 0, 0); // Started at 6 PM yesterday
                      } else {
                        nightStart.setHours(18, 0, 0, 0); // Starts at 6 PM today
                      }

                      const nightEnd = new Date(currentDay);
                      nightEnd.setDate(nightEnd.getDate() + 1);
                      nightEnd.setHours(6, 0, 0, 0); // Ends at 6 AM next day

                      // Create day band (6 AM - 6 PM)
                      const dayBandStart = Math.max(rangeStart, dayStart.getTime());
                      const dayBandEnd = Math.min(rangeEnd, dayEnd.getTime());
                      if (dayBandStart < dayBandEnd) {
                        const y = getY(dayBandEnd);
                        const height = getY(dayBandStart) - y;
                        if (height > 0) {
                          bands.push({ y, height, isDay: true });
                        }
                      }

                      // Create night band (6 PM - 6 AM next day)
                      const nightBandStart = Math.max(rangeStart, nightStart.getTime());
                      const nightBandEnd = Math.min(rangeEnd, nightEnd.getTime());
                      if (nightBandStart < nightBandEnd) {
                        const y = getY(nightBandEnd);
                        const height = getY(nightBandStart) - y;
                        if (height > 0) {
                          bands.push({ y, height, isDay: false });
                        }
                      }

                      // Move to next day
                      currentDay.setDate(currentDay.getDate() + 1);
                    }

                    // Very minimal day/night banding - almost invisible
                    return bands.map((band, idx) => (
                      <rect
                        key={`band-${idx}`}
                        x={padding.left}
                        y={band.y}
                        width={timelineData.chartDimensions.plotWidth}
                        height={band.height}
                        fill={band.isDay ? "transparent" : "rgba(0, 0, 0, 0.005)"}
                      />
                    ));
                  })()}

                {/* No grid - Tufte principle: remove non-data ink */}

                {/* Y-axis (time) - vertical */}
                {timelineData.timeStart && timelineData.timeEnd && timelineData.timeRange && (
                  <>
                    {/* Y-axis line - minimal */}
                    <line
                      x1={timelineData.chartDimensions.padding.left}
                      y1={timelineData.chartDimensions.padding.top}
                      x2={timelineData.chartDimensions.padding.left}
                      y2={timelineData.chartDimensions.padding.top + timelineData.chartDimensions.plotHeight}
                      stroke='var(--text-secondary)'
                      strokeWidth='0.5'
                      opacity='0.2'
                    />

                    {/* Calculate day boundaries for delimiters */}
                    {(() => {
                      const days: Array<{ date: Date; y: number }> = [];
                      const startTime = timelineData.timeStart!;
                      const endTime = timelineData.timeEnd!;
                      const timeRange = timelineData.timeRange!;

                      // Use viewStartDate and viewEndDate to determine which days to show
                      // This ensures we show all days in the selected range, not just days with data
                      const rangeStart = viewStartDate ? new Date(viewStartDate) : new Date(startTime);
                      const rangeEnd = viewEndDate ? new Date(viewEndDate) : new Date(endTime);

                      // Start from midnight of the start date
                      let currentDay = new Date(rangeStart);
                      currentDay.setHours(0, 0, 0, 0);

                      // If start date is not at midnight, we still want to show that day
                      // So we start from the midnight of that day
                      if (currentDay.getTime() < rangeStart.getTime()) {
                        // Start date is later in the day, show that day boundary
                        const startDayMidnight = new Date(rangeStart);
                        startDayMidnight.setHours(0, 0, 0, 0);
                        currentDay = startDayMidnight;
                      }

                      // Include all days from start to end (inclusive)
                      const endDayMidnight = new Date(rangeEnd);
                      endDayMidnight.setHours(0, 0, 0, 0);
                      const finalEndTime = endDayMidnight.getTime() + 24 * 60 * 60 * 1000; // End of end day

                      while (currentDay.getTime() <= finalEndTime) {
                        const dayTime = currentDay.getTime();

                        // Calculate Y position based on the actual chart time range
                        // Clamp to chart bounds
                        let timeRatio: number;
                        if (dayTime < startTime) {
                          // Before chart start, clamp to top
                          timeRatio = 1;
                        } else if (dayTime > endTime) {
                          // After chart end, clamp to bottom
                          timeRatio = 0;
                        } else {
                          // Within chart range
                          timeRatio = 1 - (dayTime - startTime) / timeRange;
                        }

                        const y =
                          timelineData.chartDimensions.padding.top +
                          timelineData.chartDimensions.plotHeight * timeRatio;

                        // Clamp Y to chart bounds
                        const clampedY = Math.max(
                          timelineData.chartDimensions.padding.top,
                          Math.min(
                            timelineData.chartDimensions.padding.top + timelineData.chartDimensions.plotHeight,
                            y
                          )
                        );

                        days.push({ date: new Date(currentDay), y: clampedY });

                        // Move to next day
                        currentDay.setDate(currentDay.getDate() + 1);
                        currentDay.setHours(0, 0, 0, 0);
                      }

                      return days;
                    })().map((day) => (
                      <g key={`day-${day.date.getTime()}`}>
                        {/* Day delimiter - minimal line */}
                        <line
                          x1={timelineData.chartDimensions.padding.left}
                          y1={day.y}
                          x2={timelineData.chartDimensions.padding.left + timelineData.chartDimensions.plotWidth}
                          y2={day.y}
                          stroke='var(--text-secondary)'
                          strokeWidth='0.5'
                          opacity='0.15'
                        />
                        {/* Day label - aligned right at axis */}
                        <text
                          x={timelineData.chartDimensions.padding.left - 6}
                          y={day.y - 4}
                          textAnchor='end'
                          fill='var(--text-secondary)'
                          fontSize='10'
                          fontWeight='400'
                          opacity='0.6'
                        >
                          {day.date.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: day.date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
                          })}
                        </text>
                      </g>
                    ))}
                  </>
                )}

                {/* X-axis lines - minimal */}
                <line
                  x1={timelineData.chartDimensions.padding.left}
                  y1={timelineData.chartDimensions.padding.top + timelineData.chartDimensions.plotHeight}
                  x2={timelineData.chartDimensions.padding.left + timelineData.chartDimensions.plotWidth}
                  y2={timelineData.chartDimensions.padding.top + timelineData.chartDimensions.plotHeight}
                  stroke='var(--text-secondary)'
                  strokeWidth='0.5'
                  opacity='0.15'
                />
                <line
                  x1={timelineData.chartDimensions.padding.left}
                  y1={timelineData.chartDimensions.padding.top}
                  x2={timelineData.chartDimensions.padding.left + timelineData.chartDimensions.plotWidth}
                  y2={timelineData.chartDimensions.padding.top}
                  stroke='var(--text-secondary)'
                  strokeWidth='0.5'
                  opacity='0.15'
                />

                {/* Sensor lines */}
                {timelineData.sensorLines.map((line) => {
                  if (!timelineData.timeStart || !timelineData.timeEnd || !timelineData.timeRange) return null;
                  if (line.points.length < 2) return null;

                  // Convert points to SVG coordinates, ensuring they're sorted by time (Y coordinate)
                  // Also find min/max normalized values to extend lines to edges
                  let minNormalized = Infinity;
                  let maxNormalized = -Infinity;

                  const svgPoints = line.points
                    .map((point) => {
                      const timeRatio =
                        1 - (point.timestamp.getTime() - timelineData.timeStart!) / timelineData.timeRange!;
                      const y =
                        timelineData.chartDimensions.padding.top + timelineData.chartDimensions.plotHeight * timeRatio;

                      // normalizedValue should already be 10-90 (with padding), clamp to be safe
                      const clampedNormalized = Math.max(10, Math.min(90, point.normalizedValue));

                      // Calculate X position - map from 10-90 normalized range to plot width
                      // Direct mapping: 10% normalized = 10% from left edge of plot
                      const plotLeft = timelineData.chartDimensions.padding.left;
                      const normalizedRatio = clampedNormalized / 100; // Convert 10-90% to 0.1-0.9 ratio
                      const x = plotLeft + timelineData.chartDimensions.plotWidth * normalizedRatio;

                      minNormalized = Math.min(minNormalized, clampedNormalized);
                      maxNormalized = Math.max(maxNormalized, clampedNormalized);

                      return { x, y, timestamp: point.timestamp.getTime(), normalizedValue: clampedNormalized };
                    })
                    .sort((a, b) => a.timestamp - b.timestamp); // Ensure chronological order

                  // Don't extend lines vertically - this causes flat edges
                  // Lines should only use actual data points
                  // Use the points directly for rendering
                  const finalSvgPoints = svgPoints.map(({ x, y }) => ({ x, y })); // Remove timestamp after processing

                  // Store bezier segments for hover calculation
                  type BezierSegment = {
                    p0: { x: number; y: number };
                    cp1: { x: number; y: number };
                    cp2: { x: number; y: number };
                    p3: { x: number; y: number };
                    startY: number;
                    endY: number;
                  };

                  const bezierSegments: BezierSegment[] = [];

                  // Create perfectly smooth curve using improved Catmull-Rom with tension control
                  // Ensures C1 continuity (no sharp angles) and strict X bounds
                  const createSmoothPath = (points: Array<{ x: number; y: number }>): string => {
                    if (points.length === 0) return "";
                    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
                    if (points.length === 2) {
                      // For 2 points, use a simple smooth bezier with clamped control points
                      const p1 = points[0];
                      const p2 = points[1];
                      const dx = p2.x - p1.x;
                      const dy = p2.y - p1.y;
                      let cp1x = p1.x + dx / 3;
                      let cp1y = p1.y + dy / 3;
                      let cp2x = p2.x - dx / 3;
                      let cp2y = p2.y - dy / 3;

                      // Strictly clamp control points to match data normalization bounds (30% margin)
                      const plotLeft = timelineData.chartDimensions.padding.left;
                      const plotRight = plotLeft + timelineData.chartDimensions.plotWidth;
                      const controlMarginPercent = 0.3; // Match data normalization (30%)
                      const innerLeft = plotLeft + timelineData.chartDimensions.plotWidth * controlMarginPercent;
                      const innerRight = plotRight - timelineData.chartDimensions.plotWidth * controlMarginPercent;
                      cp1x = Math.max(innerLeft, Math.min(innerRight, cp1x));
                      cp2x = Math.max(innerLeft, Math.min(innerRight, cp2x));

                      bezierSegments.push({
                        p0: p1,
                        cp1: { x: cp1x, y: cp1y },
                        cp2: { x: cp2x, y: cp2y },
                        p3: p2,
                        startY: Math.min(p1.y, p2.y),
                        endY: Math.max(p1.y, p2.y),
                      });

                      return `M ${p1.x} ${p1.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
                    }

                    let path = `M ${points[0].x} ${points[0].y}`;
                    bezierSegments.length = 0;

                    const plotLeft = timelineData.chartDimensions.padding.left;
                    const plotRight = plotLeft + timelineData.chartDimensions.plotWidth;

                    // Calculate inner bounds for bezier control points
                    // Data points are normalized to 10-90% of plot width
                    // Control points need to stay within bounds to prevent curve extension beyond edges
                    const controlMarginPercent = 0.10; // Match data normalization margin (10%)
                    const innerLeft = plotLeft + timelineData.chartDimensions.plotWidth * controlMarginPercent;
                    const innerRight = plotRight - timelineData.chartDimensions.plotWidth * controlMarginPercent;

                    // Use tension-controlled Catmull-Rom spline for smoother curves
                    // Lower tension = smoother, less aggressive curves
                    const tension = 0.5; // Adjust for smoothness (0.3-0.7 range works well)

                    for (let i = 0; i < points.length - 1; i++) {
                      const p0 = i > 0 ? points[i - 1] : points[i];
                      const p1 = points[i];
                      const p2 = points[i + 1];
                      const p3 = i < points.length - 2 ? points[i + 2] : points[i + 1];

                      // Clamp all input points to data bounds (10-90% of plot width)
                      // This matches the normalization bounds
                      const dataMarginPercent = 0.10;
                      const dataLeft = plotLeft + timelineData.chartDimensions.plotWidth * dataMarginPercent;
                      const dataRight = plotRight - timelineData.chartDimensions.plotWidth * dataMarginPercent;
                      const clampedP1 = { x: Math.max(dataLeft, Math.min(dataRight, p1.x)), y: p1.y };
                      const clampedP2 = { x: Math.max(dataLeft, Math.min(dataRight, p2.x)), y: p2.y };

                      // Improved Catmull-Rom with tension control
                      // Use tension to make curves smoother and less sharp
                      const t = tension;
                      const clampedP0 = i > 0 ? Math.max(dataLeft, Math.min(dataRight, p0.x)) : clampedP1.x;
                      const clampedP3 =
                        i < points.length - 2 ? Math.max(dataLeft, Math.min(dataRight, p3.x)) : clampedP2.x;

                      const dx1 = (clampedP2.x - clampedP0) * t;
                      const dy1 = (clampedP2.y - (i > 0 ? p0.y : clampedP1.y)) * t;
                      const dx2 = (clampedP3 - clampedP1.x) * t;
                      const dy2 = ((i < points.length - 2 ? p3.y : clampedP2.y) - clampedP1.y) * t;

                      // Control points for smooth cubic bezier
                      let cp1x = clampedP1.x + dx1 / 3;
                      let cp1y = clampedP1.y + dy1 / 3;
                      let cp2x = clampedP2.x - dx2 / 3;
                      let cp2y = clampedP2.y - dy2 / 3;

                      // CRITICAL: Strictly clamp all X coordinates to inner bounds
                      // innerLeft and innerRight are already calculated above
                      cp1x = Math.max(innerLeft, Math.min(innerRight, cp1x));
                      cp2x = Math.max(innerLeft, Math.min(innerRight, cp2x));

                      // Points are already clamped to inner bounds, use them directly
                      const finalP1 = clampedP1;
                      const finalP2 = clampedP2;

                      // Ensure Y progression is monotonic (time flows forward)
                      const yDelta = finalP2.y - finalP1.y;

                      if (yDelta !== 0) {
                        // Keep control points between p1.y and p2.y for smooth, monotonic curves
                        const minY = Math.min(finalP1.y, finalP2.y);
                        const maxY = Math.max(finalP1.y, finalP2.y);

                        // Constrain Y values more strictly to prevent backtracking
                        cp1y = Math.max(minY, Math.min(maxY, cp1y));
                        cp2y = Math.max(minY, Math.min(maxY, cp2y));

                        // Ensure progression order to prevent loops or sharp angles
                        if (yDelta > 0) {
                          // Moving down (forward in time) - ensure smooth progression
                          if (cp2y < cp1y) {
                            // If control points are reversed, smooth them out
                            const midY = (finalP1.y + finalP2.y) / 2;
                            cp1y = Math.min(cp1y, midY);
                            cp2y = Math.max(cp2y, midY);
                          }
                          // Ensure cp1 and cp2 are between p1 and p2
                          if (cp1y > finalP2.y) cp1y = finalP1.y + yDelta * 0.3;
                          if (cp2y < finalP1.y) cp2y = finalP1.y + yDelta * 0.7;
                        }
                      } else {
                        // Horizontal segment - keep Y constant
                        cp1y = finalP1.y;
                        cp2y = finalP2.y;
                      }

                      const cp1 = { x: cp1x, y: cp1y };
                      const cp2 = { x: cp2x, y: cp2y };

                      // Store segment for hover calculation
                      bezierSegments.push({
                        p0: finalP1,
                        cp1,
                        cp2,
                        p3: finalP2,
                        startY: Math.min(finalP1.y, finalP2.y, cp1y, cp2y),
                        endY: Math.max(finalP1.y, finalP2.y, cp1y, cp2y),
                      });

                      // Use cubic bezier for perfectly smooth curves
                      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${finalP2.x} ${finalP2.y}`;
                    }

                    return path;
                  };

                  const isHovered = hoverState?.hoveredSensorId === line.sensorId;
                  const pathData = createSmoothPath(finalSvgPoints);

                  // Store bezier segments in a ref or attach to the line object for hover calculation
                  // We'll use a closure to access segments when rendering hover indicators
                  (line as any)._bezierSegments = bezierSegments;

                  return (
                    <path
                      key={line.sensorId}
                      d={pathData}
                      fill='none'
                      stroke={line.config.color}
                      strokeWidth={isHovered ? "2" : "1.5"}
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      opacity={hoverState && !isHovered ? 0.2 : 0.85}
                      style={{
                        cursor: "pointer",
                        transition: "opacity 0.15s, stroke-width 0.15s",
                      }}
                    />
                  );
                })}

                {/* Hover indicator line */}
                {hoverState &&
                  timelineData.chartDimensions &&
                  timelineData.timeStart &&
                  timelineData.timeEnd &&
                  timelineData.timeRange && (
                    <>
                      {(() => {
                        // Calculate min/max X positions of all visible sensor lines at this Y position
                        // to constrain the hover line to only extend as far as the data lines
                        const targetY =
                          timelineData.chartDimensions.padding.top +
                          (1 - (hoverState.timestamp.getTime() - timelineData.timeStart) / timelineData.timeRange) *
                            timelineData.chartDimensions.plotHeight;

                        let minX = timelineData.chartDimensions.padding.left + timelineData.chartDimensions.plotWidth;
                        let maxX = timelineData.chartDimensions.padding.left;

                        timelineData.sensorLines.forEach((line) => {
                          const bezierSegments = (line as any)._bezierSegments as Array<{
                            p0: { x: number; y: number };
                            cp1: { x: number; y: number };
                            cp2: { x: number; y: number };
                            p3: { x: number; y: number };
                            startY: number;
                            endY: number;
                          }>;

                          if (bezierSegments && bezierSegments.length > 0) {
                            for (const segment of bezierSegments) {
                              if (targetY >= segment.startY && targetY <= segment.endY) {
                                const pointOnCurve = findPointOnBezierAtY(
                                  segment.p0,
                                  segment.cp1,
                                  segment.cp2,
                                  segment.p3,
                                  targetY
                                );
                                if (pointOnCurve) {
                                  minX = Math.min(minX, pointOnCurve.x);
                                  maxX = Math.max(maxX, pointOnCurve.x);
                                }
                                break;
                              }
                            }
                          }
                        });

                        // If we found valid X positions, use them; otherwise use full width
                        const hoverLineX1 = minX < maxX ? minX : timelineData.chartDimensions.padding.left;
                        const hoverLineX2 =
                          minX < maxX
                            ? maxX
                            : timelineData.chartDimensions.padding.left + timelineData.chartDimensions.plotWidth;

                        return (
                          <line
                            x1={hoverLineX1}
                            y1={targetY}
                            x2={hoverLineX2}
                            y2={targetY}
                            stroke='var(--text-primary)'
                            strokeWidth='0.5'
                            opacity='0.3'
                            style={{ pointerEvents: "none" }}
                          />
                        );
                      })()}
                      {hoverState.sensors.map((sensor) => {
                        if (!timelineData.timeStart || !timelineData.timeRange) return null;

                        // Find the line for this sensor
                        const line = timelineData.sensorLines.find((l) => l.sensorId === sensor.sensorId);
                        if (!line) return null;

                        // Calculate target Y position based on timestamp
                        const targetY =
                          timelineData.chartDimensions.padding.top +
                          (1 - (hoverState.timestamp.getTime() - timelineData.timeStart) / timelineData.timeRange) *
                            timelineData.chartDimensions.plotHeight;

                        // Get bezier segments for this line
                        const bezierSegments = (line as any)._bezierSegments as Array<{
                          p0: { x: number; y: number };
                          cp1: { x: number; y: number };
                          cp2: { x: number; y: number };
                          p3: { x: number; y: number };
                          startY: number;
                          endY: number;
                        }>;

                        let pointOnCurve: { x: number; y: number } | null = null;

                        if (bezierSegments && bezierSegments.length > 0) {
                          // Find which segment contains the target Y
                          for (const segment of bezierSegments) {
                            if (targetY >= segment.startY && targetY <= segment.endY) {
                              // Found the segment, find point on curve at this Y
                              pointOnCurve = findPointOnBezierAtY(
                                segment.p0,
                                segment.cp1,
                                segment.cp2,
                                segment.p3,
                                targetY
                              );
                              if (pointOnCurve) break;
                            }
                          }
                        }

                        // Fallback to original calculation if curve evaluation failed
                        if (!pointOnCurve) {
                          const x =
                            timelineData.chartDimensions.padding.left +
                            (timelineData.chartDimensions.plotWidth * sensor.normalizedValue) / 100;
                          pointOnCurve = { x, y: targetY };
                        }

                        return (
                          <circle
                            key={sensor.sensorId}
                            cx={pointOnCurve.x}
                            cy={pointOnCurve.y}
                            r='4'
                            fill={sensor.config.color}
                            stroke='var(--background-color)'
                            strokeWidth='1'
                            style={{ pointerEvents: "none" }}
                          />
                        );
                      })}
                    </>
                  )}
              </g>
              {/* End clip group */}
            </svg>

            {/* Tooltip */}
            {hoverState && (
              <aside
                style={{
                  position: "fixed",
                  left: hoverState.x + 10,
                  top: hoverState.y - 10,
                  pointerEvents: "none",
                  zIndex: 1000,
                }}
              >
                <div>
                  {hoverState.timestamp.toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
                {hoverState.sensors.map((sensor) => (
                  <div key={sensor.sensorId}>
                    <div style={{ color: sensor.config.color }}>
                      <span
                        style={{
                          display: "inline-block",
                          width: "6px",
                          height: "6px",
                          backgroundColor: sensor.config.color,
                          marginRight: "6px",
                        }}
                      ></span>
                      {sensor.config.name}
                    </div>
                    <div>
                      {sensor.value.toFixed(2)} {sensor.config.unit}
                    </div>
                  </div>
                ))}
              </aside>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
