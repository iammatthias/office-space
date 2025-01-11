import { useState, useRef, useCallback, useEffect } from "react";
import * as d3 from "d3";
import { supabase } from "../../lib/supabase";
import useResizeObserver from "../../lib/useResizeObserver";
import styles from "./VerticalTimeline.module.css";

interface DataPoint {
  timestamp: Date;
  value: number;
  sensorId: string;
  normalizedValue?: number;
  period: string;
}

interface TimelineProps {
  pageSize?: number;
  loadingBuffer?: number; // minimum ms between load requests
}

interface TooltipData {
  x: number;
  y: number;
  value: number;
  timestamp: Date;
  sensorId: string;
  color: string;
  unit: string;
  name: string;
}

interface SensorConfig {
  sensorId: string;
  name: string;
  color: string;
  unit: string;
  priority: number;
  range: [number, number];
}

interface RawDataRow {
  time: string;
  period: string;
  [key: string]: unknown;
}

interface ClosestLine {
  distance: number;
  config: SensorConfig;
  groupIndex: number;
}

const TIMELINE_CONFIG = {
  rowHeight: 120,
  leftMargin: 64,
  rightMargin: 16,
  minWidth: window.innerWidth < 768 ? 280 : 400,
  topMargin: 64,
  dateOffset: 24,
  mobileLeftMargin: 48,
  mobileChartOffset: 20,
  timeIndicatorOffset: 12,
};

const SENSOR_GROUPS = {
  environmental: {
    name: "Environmental",
    sensors: [
      {
        sensorId: "temp",
        name: "Temperature",
        color: "#ff6b6b",
        unit: "°C",
        priority: 1,
        range: [-40, 85] as [number, number],
      },
      {
        sensorId: "hum",
        name: "Humidity",
        color: "#4dabf7",
        unit: "%",
        priority: 1,
        range: [0, 100] as [number, number],
      },
      {
        sensorId: "pressure",
        name: "Pressure",
        color: "#51cf66",
        unit: "hPa",
        priority: 2,
        range: [300, 1100] as [number, number],
      },
      {
        sensorId: "lux",
        name: "Light",
        color: "#ffd43b",
        unit: "lux",
        priority: 2,
        range: [0, 88000] as [number, number],
      },
      {
        sensorId: "uv",
        name: "UV",
        color: "#845ef7",
        unit: "index",
        priority: 2,
        range: [0, 11] as [number, number],
      },
      {
        sensorId: "gas",
        name: "Gas",
        color: "#339af0",
        unit: "ppm",
        priority: 2,
        range: [0, 1000] as [number, number],
      },
    ],
  },
  motion: {
    name: "Motion",
    sensors: [
      {
        sensorId: "roll",
        name: "Roll",
        color: "#ff922b",
        unit: "°",
        priority: 2,
        range: [-180, 180] as [number, number],
      },
      {
        sensorId: "pitch",
        name: "Pitch",
        color: "#20c997",
        unit: "°",
        priority: 2,
        range: [-180, 180] as [number, number],
      },
      {
        sensorId: "yaw",
        name: "Yaw",
        color: "#f06595",
        unit: "°",
        priority: 2,
        range: [-180, 180] as [number, number],
      },
    ],
  },
  acceleration: {
    name: "Acceleration",
    sensors: [
      {
        sensorId: "accel_x",
        name: "X Axis",
        color: "#ae3ec9",
        unit: "g",
        priority: 3,
        range: [-16, 16] as [number, number],
      },
      {
        sensorId: "accel_y",
        name: "Y Axis",
        color: "#7950f2",
        unit: "g",
        priority: 3,
        range: [-16, 16] as [number, number],
      },
      {
        sensorId: "accel_z",
        name: "Z Axis",
        color: "#fd7e14",
        unit: "g",
        priority: 3,
        range: [-16, 16] as [number, number],
      },
    ],
  },
  gyroscope: {
    name: "Gyroscope",
    sensors: [
      {
        sensorId: "gyro_x",
        name: "X Axis",
        color: "#12b886",
        unit: "°/s",
        priority: 3,
        range: [-2000, 2000] as [number, number],
      },
      {
        sensorId: "gyro_y",
        name: "Y Axis",
        color: "#15aabf",
        unit: "°/s",
        priority: 3,
        range: [-2000, 2000] as [number, number],
      },
      {
        sensorId: "gyro_z",
        name: "Z Axis",
        color: "#1c7ed6",
        unit: "°/s",
        priority: 3,
        range: [-2000, 2000] as [number, number],
      },
    ],
  },
  magnetometer: {
    name: "Magnetometer",
    sensors: [
      {
        sensorId: "mag_x",
        name: "X Axis",
        color: "#e64980",
        unit: "µT",
        priority: 3,
        range: [-4900, 4900] as [number, number],
      },
      {
        sensorId: "mag_y",
        name: "Y Axis",
        color: "#f76707",
        unit: "µT",
        priority: 3,
        range: [-4900, 4900] as [number, number],
      },
      {
        sensorId: "mag_z",
        name: "Z Axis",
        color: "#2b8a3e",
        unit: "µT",
        priority: 3,
        range: [-4900, 4900] as [number, number],
      },
    ],
  },
};

// Replace SENSOR_CONFIGS with a flattened version for backward compatibility
const SENSOR_CONFIGS = Object.values(SENSOR_GROUPS).flatMap((group) =>
  group.sensors.map((sensor) => ({
    ...sensor,
    groupName: group.name,
  }))
);

const LoadingSpinner = () => (
  <div className={styles.loadingSpinner}>
    <div className={styles.spinner} />
  </div>
);

const normalizeValue = (
  value: number,
  minVal: number,
  maxVal: number,
  sensorRange: [number, number],
  sensorId: string
): number => {
  // Handle null or undefined values as 0
  if (value == null) return 0;

  // Ensure the value is within the sensor's range
  const clampedValue = Math.max(sensorRange[0], Math.min(sensorRange[1], value));

  // Special handling for different sensor types
  if (sensorId.includes("gas")) {
    // Use logarithmic scale for gas readings (ppm)
    const logValue = Math.log10(Math.max(0.1, clampedValue));
    const logMin = Math.log10(Math.max(0.1, minVal));
    const logMax = Math.log10(maxVal);
    return Math.max(0, Math.min(100, ((logValue - logMin) / (logMax - logMin)) * 100));
  }

  if (sensorId.includes("lux")) {
    // Use logarithmic scale for light readings
    const logValue = Math.log10(Math.max(1, clampedValue));
    const logMin = Math.log10(Math.max(1, minVal));
    const logMax = Math.log10(maxVal);
    return Math.max(0, Math.min(100, ((logValue - logMin) / (logMax - logMin)) * 100));
  }

  if (sensorId.includes("uv")) {
    // Linear scale for UV index using actual data range
    const normalizedToRange = ((clampedValue - minVal) / (maxVal - minVal)) * 100;
    return Math.max(0, Math.min(100, normalizedToRange));
  }

  // For values that can be negative (like acceleration, gyro, magnetometer)
  if (
    sensorId.includes("accel") ||
    sensorId.includes("gyro") ||
    sensorId.includes("mag") ||
    sensorId.includes("roll") ||
    sensorId.includes("pitch") ||
    sensorId.includes("yaw")
  ) {
    // Use the actual data range for better visualization
    const dataRange = maxVal - minVal;
    const normalized = ((clampedValue - minVal) / dataRange) * 100;
    return Math.max(0, Math.min(100, normalized));
  }

  // For environmental sensors (temp, humidity, pressure)
  // Use actual data range while respecting sensor limits
  const normalizedToRange = ((clampedValue - minVal) / (maxVal - minVal)) * 100;
  return Math.max(0, Math.min(100, normalizedToRange));
};

/**
 * VerticalTimeline Component
 *
 * Displays multiple sensor readings over time in a vertically scrolling timeline.
 * Features:
 * - Interactive hover states with tooltips
 * - Infinite scrolling in both directions
 * - Dynamic data normalization
 * - Responsive layout
 */
export const VerticalTimeline = ({ pageSize = 24, loadingBuffer = 1000 }: TimelineProps) => {
  // State management
  const [data, setData] = useState<Record<string, DataPoint[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredSensor, setHoveredSensor] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [dateRanges, setDateRanges] = useState<Record<string, { earliest: Date; latest: Date }>>({});
  const [isLegendExpanded, setIsLegendExpanded] = useState(false);
  const [isPreloading, setIsPreloading] = useState(false);
  const [selectedSensor, setSelectedSensor] = useState<string | null>(null);
  const lastLoadTime = useRef<number>(0);
  const preloadTimer = useRef<NodeJS.Timeout>();

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dimensions = useResizeObserver(containerRef);

  // Add refs for top and bottom observers
  const bottomTriggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.setProperty("--min-width", `${TIMELINE_CONFIG.minWidth}px`);
    }
  }, []);

  // Simplified data fetching with cursor-based pagination
  const fetchSensorData = useCallback(
    async (afterDate?: Date, isPreload = false) => {
      try {
        if (!isPreload) {
          setIsLoading(true);
        } else {
          setIsPreloading(true);
        }

        const now = Date.now();
        if (now - lastLoadTime.current < loadingBuffer && !isPreload) {
          return;
        }
        lastLoadTime.current = now;

        const selectColumns = SENSOR_CONFIGS.map((config) => config.sensorId).join(",");
        let query = supabase
          .from("daynight_data")
          .select(`time,period,${selectColumns}`)
          .order("time", { ascending: true });

        // Initial load gets oldest data first
        if (!Object.keys(dateRanges).length) {
          query = query.limit(pageSize);
        } else if (afterDate) {
          // Get newer data (scrolling down)
          query = query.gt("time", afterDate.toISOString()).limit(pageSize);
        }

        const { data: rawData, error: queryError } = await query;

        if (queryError) {
          console.error("Query error:", queryError);
          throw new Error(queryError.message);
        }

        if (!rawData || rawData.length === 0) {
          console.warn("No data received from query");
          return;
        }

        console.log("Raw data sample:", rawData[0]);
        console.log("Total rows received:", rawData.length);
        console.log("Available columns:", Object.keys(rawData[0]));

        const typedRawData = rawData as unknown[] as RawDataRow[];
        const timestamps = typedRawData.map((row) => new Date(row.time));
        const newEarliest = Math.min(...timestamps.map((d) => d.getTime()));
        const newLatest = Math.max(...timestamps.map((d) => d.getTime()));

        // Log timestamp range for debugging
        console.log("Time range:", {
          earliest: new Date(newEarliest).toISOString(),
          latest: new Date(newLatest).toISOString(),
        });

        const transformedData: Record<string, DataPoint[]> = {};
        SENSOR_CONFIGS.forEach((config) => {
          const sensorData = typedRawData
            .map((row) => {
              const value = row[config.sensorId];
              const period = row.period;
              if (!period) {
                console.debug(`Missing period for sensor ${config.sensorId} at time ${row.time}`);
                return null;
              }
              return {
                timestamp: new Date(row.time),
                value: value === null || value === undefined ? 0 : Number(value),
                sensorId: config.sensorId,
                period: period as string,
              };
            })
            .filter((point): point is DataPoint => point !== null);

          transformedData[config.sensorId] = sensorData;

          // Log data points count for each sensor
          console.debug(`Sensor ${config.sensorId} has ${sensorData.length} data points`);
        });

        setDateRanges((prev) => {
          const newRanges = { ...prev };
          SENSOR_CONFIGS.forEach((config) => {
            if (!newRanges[config.sensorId]) {
              newRanges[config.sensorId] = {
                earliest: new Date(newEarliest),
                latest: new Date(newLatest),
              };
            } else if (afterDate) {
              const newLatestDate = new Date(Math.max(newLatest, prev[config.sensorId].latest.getTime()));
              newRanges[config.sensorId].latest = newLatestDate;
            }
          });
          return newRanges;
        });

        setData((prev) => {
          const newData = { ...prev };
          SENSOR_CONFIGS.forEach((config) => {
            const existingData = prev[config.sensorId] || [];
            const newSensorData = transformedData[config.sensorId];

            // Create a Map using timestamp as key to ensure uniqueness
            const dataMap = new Map(existingData.map((point) => [point.timestamp.getTime(), point]));

            // Add new data points
            newSensorData.forEach((point: DataPoint) => {
              const timestamp = point.timestamp.getTime();
              if (!dataMap.has(timestamp)) {
                dataMap.set(timestamp, point);
              }
            });

            // Convert back to array and sort by timestamp in ascending order (oldest first)
            newData[config.sensorId] = Array.from(dataMap.values()).sort(
              (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
            );
          });
          return newData;
        });

        // Only setup preload if we actually got new data
        if (typedRawData.length === pageSize && !isPreload) {
          const latestTimestamp = new Date(Math.max(...timestamps.map((d) => d.getTime())));

          if (preloadTimer.current) {
            clearTimeout(preloadTimer.current);
          }

          preloadTimer.current = setTimeout(() => {
            fetchSensorData(latestTimestamp, true);
          }, 100);
        }
      } catch (err) {
        console.error("Error fetching data:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch data");
      } finally {
        if (isPreload) {
          setIsPreloading(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [pageSize, loadingBuffer, data, dateRanges]
  );

  // Initial data load
  useEffect(() => {
    fetchSensorData();
  }, [fetchSensorData]);

  // Setup intersection observer for bottom loading
  useEffect(() => {
    let observer: IntersectionObserver | null = null;

    const loadData = () => {
      const sensorData = Object.values(data)[0] || [];
      if (sensorData.length === 0) return;

      const newestDate = sensorData[sensorData.length - 1].timestamp;
      console.log("Intersection observer triggering load after:", newestDate.toISOString());
      fetchSensorData(newestDate, false);
    };

    const bottomObserverCallback: IntersectionObserverCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !isLoading && !isPreloading) {
          console.log("Intersection observer triggered");
          loadData();
        }
      });
    };

    // Create observer with options optimized for scroll detection
    observer = new IntersectionObserver(bottomObserverCallback, {
      root: null,
      threshold: 0,
      rootMargin: "0px 0px 50px 0px",
    });

    // Ensure the trigger element exists before observing
    const triggerElement = bottomTriggerRef.current;
    if (triggerElement) {
      observer.observe(triggerElement);
      console.log("Observer attached to trigger element");
    }

    // Cleanup function
    return () => {
      if (observer) {
        observer.disconnect();
      }
    };
  }, [data, isLoading, isPreloading, fetchSensorData]);

  // D3 scale creation (memoized)
  const getScales = useCallback(() => {
    if (!dimensions?.width) return {};

    const isMobile = window.innerWidth < 768;
    const leftMargin = isMobile ? TIMELINE_CONFIG.mobileLeftMargin : TIMELINE_CONFIG.leftMargin;
    const rightMargin = isMobile ? 20 : TIMELINE_CONFIG.rightMargin;
    const chartOffset = isMobile ? TIMELINE_CONFIG.mobileChartOffset : 0;

    const chartWidth = Math.max(dimensions.width - leftMargin - rightMargin - chartOffset, TIMELINE_CONFIG.minWidth);

    return SENSOR_CONFIGS.reduce<Record<string, d3.ScaleLinear<number, number>>>((acc, config) => {
      acc[config.sensorId] = d3
        .scaleLinear()
        .domain([0, 100])
        .range([leftMargin + chartOffset, leftMargin + chartOffset + chartWidth])
        .clamp(true); // Ensure values are clamped to the range
      return acc;
    }, {});
  }, [dimensions?.width]);

  const scales = getScales();

  // Normalize data points
  const getNormalizedData = useCallback((points: DataPoint[]): DataPoint[] => {
    const sensorConfig = SENSOR_CONFIGS.find((config) => config.sensorId === points[0]?.sensorId);
    if (!sensorConfig || !sensorConfig.range) return points;

    // Calculate actual min/max from data
    const values = points.map((d) => d.value).filter((v) => v != null);
    const minVal = Math.max(sensorConfig.range[0], Math.min(...values));
    const maxVal = Math.min(sensorConfig.range[1], Math.max(...values));

    return points.map((point) => {
      const normalizedValue = normalizeValue(point.value, minVal, maxVal, sensorConfig.range, point.sensorId);

      // Only warn if value is out of bounds in development
      if (process.env.NODE_ENV === "development" && (normalizedValue < 0 || normalizedValue > 100)) {
        console.warn(
          `Normalized value out of bounds for ${point.sensorId}:`,
          `raw=${point.value}`,
          `normalized=${normalizedValue}`,
          `range=[${minVal}, ${maxVal}]`,
          `sensor range=[${sensorConfig.range[0]}, ${sensorConfig.range[1]}]`
        );
      }

      return {
        ...point,
        normalizedValue,
      };
    });
  }, []);

  // Line generator
  const createLine = useCallback(
    (sensorId: string, normalizedPoints: DataPoint[]) => {
      const scale = scales[sensorId];
      if (!scale || normalizedPoints.length === 0) return "";

      const lineGenerator = d3
        .line<DataPoint>()
        .x((d) => scale(d.normalizedValue || 0))
        .y((_, i) => i * TIMELINE_CONFIG.rowHeight + TIMELINE_CONFIG.topMargin)
        .curve(d3.curveCatmullRom.alpha(0.5));

      return lineGenerator(normalizedPoints) || "";
    },
    [scales]
  );

  // Add handler for managing sensor selection
  const handleSensorSelection = useCallback(
    (sensorId: string | null) => {
      if (sensorId === null) {
        // Handle deselection
        setSelectedSensor(null);
        setHoveredSensor(null);
        setTooltip(null);
      } else if (sensorId === selectedSensor) {
        // Deselect if clicking the same sensor
        setSelectedSensor(null);
        setHoveredSensor(null);
        setTooltip(null);
      } else {
        // Select new sensor and update hover states
        setSelectedSensor(sensorId);
        setHoveredSensor(sensorId);
      }
    },
    [selectedSensor]
  );

  // Add handler for managing hover states
  const handleSensorHover = useCallback(
    (sensorId: string | null) => {
      // Only update hover states if no sensor is selected
      if (!selectedSensor) {
        setHoveredSensor(sensorId);
      }
    },
    [selectedSensor]
  );

  // Add handler for deselection
  const handleDeselect = useCallback(() => {
    if (selectedSensor) {
      setSelectedSensor(null);
      setHoveredSensor(null);
      setTooltip(null);
    }
  }, [selectedSensor]);

  // Add helper function to find closest sensor
  const findClosestSensor = useCallback(
    (mouseX: number, mouseY: number): { sensorId: string; groupIndex: number } | null => {
      let closestLine: ClosestLine | null = null;
      let minLineDistance = Infinity;

      SENSOR_CONFIGS.forEach((config, groupIndex) => {
        // Remove the filter for selected sensor to allow finding any closest line
        const points = data[config.sensorId] || [];
        if (points.length === 0) return;

        const normalizedPoints: DataPoint[] = getNormalizedData(points);
        const scale = scales[config.sensorId];
        if (!scale) return;

        // Find the two points that vertically bracket the mouse position
        const mouseIndex = Math.floor((mouseY - TIMELINE_CONFIG.topMargin) / TIMELINE_CONFIG.rowHeight);
        if (mouseIndex < 0 || mouseIndex >= normalizedPoints.length - 1) return;

        const p1 = {
          x: scale(normalizedPoints[mouseIndex].normalizedValue || 0),
          y: mouseIndex * TIMELINE_CONFIG.rowHeight + TIMELINE_CONFIG.topMargin,
        };
        const p2 = {
          x: scale(normalizedPoints[mouseIndex + 1].normalizedValue || 0),
          y: (mouseIndex + 1) * TIMELINE_CONFIG.rowHeight + TIMELINE_CONFIG.topMargin,
        };

        // Calculate distance from mouse to line segment
        const lineLength = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
        if (lineLength === 0) return;

        const t = Math.max(
          0,
          Math.min(1, ((mouseX - p1.x) * (p2.x - p1.x) + (mouseY - p1.y) * (p2.y - p1.y)) / (lineLength * lineLength))
        );
        const projectionX = p1.x + t * (p2.x - p1.x);
        const projectionY = p1.y + t * (p2.y - p1.y);
        const distance = Math.sqrt((mouseX - projectionX) ** 2 + (mouseY - projectionY) ** 2);

        if (distance < minLineDistance) {
          minLineDistance = distance;
          closestLine = {
            distance,
            config,
            groupIndex,
          } satisfies ClosestLine;
        }
      });

      if (closestLine && (closestLine as ClosestLine).distance < 50) {
        return {
          sensorId: (closestLine as ClosestLine).config.sensorId,
          groupIndex: (closestLine as ClosestLine).groupIndex,
        };
      }

      return null;
    },
    [data, scales, getNormalizedData] // Remove selectedSensor from dependencies
  );

  // Update click handlers to use findClosestSensor
  const handleSvgClick = useCallback(
    (event: React.MouseEvent<SVGElement>) => {
      const svgElement = event.currentTarget;
      const [mouseX, mouseY] = d3.pointer(event, svgElement);
      const closest = findClosestSensor(mouseX, mouseY);

      if (closest) {
        event.stopPropagation();
        handleSensorSelection(closest.sensorId);
      } else if (selectedSensor) {
        handleDeselect();
      }
    },
    [findClosestSensor, handleSensorSelection, handleDeselect, selectedSensor]
  );

  // Update handleMouseMove to use findClosestSensor
  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!dimensions) return;

      const svgElement = event.currentTarget;
      const [mouseX, mouseY] = d3.pointer(event, svgElement);
      const closest = findClosestSensor(mouseX, mouseY);

      if (closest) {
        const { sensorId } = closest;
        const config = SENSOR_CONFIGS.find((c) => c.sensorId === sensorId);
        if (!config) return;

        const points = data[sensorId] || [];
        const normalizedPoints: DataPoint[] = getNormalizedData(points);
        const scale = scales[sensorId];
        if (!scale || normalizedPoints.length === 0) return;

        // Find closest point for tooltip
        const mouseIndex = Math.floor((mouseY - TIMELINE_CONFIG.topMargin) / TIMELINE_CONFIG.rowHeight);
        if (mouseIndex >= 0 && mouseIndex < normalizedPoints.length) {
          const point = normalizedPoints[mouseIndex];
          const tooltipWidth = 180;
          const tooltipHeight = 80;
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;

          let tooltipX = event.clientX + 10;
          let tooltipY = event.clientY - tooltipHeight / 2;

          if (tooltipX + tooltipWidth > viewportWidth - 20) {
            tooltipX = event.clientX - tooltipWidth - 10;
          }
          if (tooltipY + tooltipHeight > viewportHeight - 20) {
            tooltipY = viewportHeight - tooltipHeight - 20;
          }
          if (tooltipY < 20) {
            tooltipY = 20;
          }

          // Only show tooltip if no sensor is selected or if hovering over the selected sensor
          if (!selectedSensor || selectedSensor === sensorId) {
            setTooltip({
              x: tooltipX,
              y: tooltipY,
              value: point.value,
              timestamp: point.timestamp,
              sensorId,
              color: config.color,
              unit: config.unit,
              name: config.name,
            });

            // Only update hover states if no sensor is selected
            if (!selectedSensor) {
              setHoveredSensor(sensorId);
            }
          }
        }
      } else {
        // Clear tooltip and hover states if not near any line and no sensor is selected
        if (!selectedSensor) {
          setTooltip(null);
          setHoveredSensor(null);
        }
      }
    },
    [dimensions, scales, data, getNormalizedData, selectedSensor, findClosestSensor]
  );

  // Add effect to handle clicks outside the component
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectedSensor && containerRef.current && !containerRef.current.contains(event.target as Node)) {
        handleDeselect();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [selectedSensor, handleDeselect]);

  if (isLoading && Object.keys(data).length === 0) {
    return (
      <div ref={containerRef} className={styles.loadingContainer}>
        <LoadingSpinner />
      </div>
    );
  }

  if (error && Object.keys(data).length === 0) {
    return (
      <div ref={containerRef} className={styles.errorContainer}>
        Error: {error}
      </div>
    );
  }

  return (
    <>
      <div className={`${styles.legend} ${isLegendExpanded ? styles.legendExpanded : ""}`}>
        <div className={styles.legendHeader} onClick={() => setIsLegendExpanded(!isLegendExpanded)}>
          <span className={styles.legendTitle}>Sensors</span>
          <span className={styles.legendToggle}>{isLegendExpanded ? "−" : "+"}</span>
        </div>
        <div className={styles.legendContent}>
          {Object.entries(SENSOR_GROUPS).map(([groupId, group]) => (
            <div key={groupId} className={styles.legendGroup}>
              <div className={styles.legendGroupHeader}>{group.name}</div>
              {group.sensors.map((config) => (
                <div
                  key={config.sensorId}
                  className={`${styles.legendItem} ${
                    hoveredSensor === config.sensorId || selectedSensor === config.sensorId
                      ? styles.legendItemActive
                      : ""
                  }`}
                  onClick={() => handleSensorSelection(config.sensorId)}
                  onMouseEnter={() => handleSensorHover(config.sensorId)}
                  onMouseLeave={() => handleSensorHover(null)}
                >
                  <div className={styles.legendColor} style={{ backgroundColor: config.color }} />
                  <span>{config.name}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.scrollContainer} ref={scrollRef}>
        {isLoading && Object.keys(data).length === 0 && (
          <div className={styles.loadingContainer}>
            <LoadingSpinner />
          </div>
        )}
        <div className={styles.scrollContent} ref={containerRef}>
          <div
            className={styles.timelineContent}
            style={{
              height: `${
                Math.max(...Object.values(data).map((points) => points.length - 1)) * TIMELINE_CONFIG.rowHeight +
                TIMELINE_CONFIG.topMargin
              }px`,
              minWidth: `${TIMELINE_CONFIG.minWidth + TIMELINE_CONFIG.leftMargin + TIMELINE_CONFIG.rightMargin}px`,
              paddingTop: `${TIMELINE_CONFIG.topMargin}px`,
              position: "relative",
            }}
          >
            <svg
              width='100%'
              height='100%'
              onMouseMove={handleMouseMove}
              onClick={handleSvgClick}
              onMouseLeave={() => {
                setTooltip(null);
                if (!selectedSensor) {
                  setHoveredSensor(null);
                }
              }}
              className={styles.timelineSvg}
            >
              {/* Time indicators */}
              <g className={styles.timeIndicators}>
                {Object.values(data)[0]?.map((point, i, arr) => {
                  const date = point.timestamp;
                  const prevDate = i > 0 ? arr[i - 1].timestamp : null;
                  const periodEmoji = point.period.toLowerCase() === "day" ? "☀️" : "🌙";

                  const showDate = i === 0 || date.getDate() !== prevDate?.getDate();

                  const yPos = i * TIMELINE_CONFIG.rowHeight + TIMELINE_CONFIG.topMargin;
                  const isMobile = window.innerWidth < 768;
                  const leftMargin = isMobile ? TIMELINE_CONFIG.mobileLeftMargin : TIMELINE_CONFIG.leftMargin;
                  const xOffset = leftMargin - TIMELINE_CONFIG.timeIndicatorOffset;

                  const monthNames = [
                    "Jan",
                    "Feb",
                    "Mar",
                    "Apr",
                    "May",
                    "Jun",
                    "Jul",
                    "Aug",
                    "Sep",
                    "Oct",
                    "Nov",
                    "Dec",
                  ];

                  return (
                    <g key={i}>
                      {showDate && (
                        <>
                          <text
                            x={xOffset}
                            y={yPos - TIMELINE_CONFIG.dateOffset - (i === 0 ? 12 : 0)}
                            className={`${styles.dateLabel} ${i === 0 ? styles.yearLabel : ""}`}
                            textAnchor='end'
                            dominantBaseline='middle'
                          >
                            {i === 0 && date.getFullYear()}
                          </text>
                          <text
                            x={xOffset}
                            y={yPos - TIMELINE_CONFIG.dateOffset}
                            className={styles.dateLabel}
                            textAnchor='end'
                            dominantBaseline='middle'
                          >
                            {`${monthNames[date.getMonth()]} ${date.getDate()}`}
                          </text>
                        </>
                      )}
                      <text
                        x={xOffset}
                        y={yPos}
                        className={styles.timeLabel}
                        textAnchor='end'
                        dominantBaseline='middle'
                      >
                        {`${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(
                          2,
                          "0"
                        )} ${periodEmoji}`}
                      </text>
                    </g>
                  );
                })}
              </g>

              {Object.values(SENSOR_GROUPS).flatMap((group) =>
                group.sensors.map((config) => {
                  const points = data[config.sensorId] || [];
                  if (points.length === 0) return null;

                  const normalizedPoints = getNormalizedData(points);
                  const isActive = selectedSensor
                    ? selectedSensor === config.sensorId
                    : hoveredSensor === config.sensorId;

                  // Adjust opacity based on priority when not active
                  const baseOpacity = isActive ? 1 : Math.max(0.1, 1 - config.priority * 0.25);

                  return (
                    <g
                      key={config.sensorId}
                      className={styles.sensorGroup}
                      onMouseEnter={() => handleSensorHover(config.sensorId)}
                      onMouseLeave={() => handleSensorHover(null)}
                    >
                      <path
                        d={createLine(config.sensorId, normalizedPoints)}
                        stroke={config.color}
                        style={{ opacity: baseOpacity }}
                        className={`${styles.sensorLine} ${isActive ? styles.sensorLineActive : ""}`}
                        onMouseEnter={() => handleSensorHover(config.sensorId)}
                      />
                      {(isActive || config.priority === 1) &&
                        normalizedPoints.map((point, i) => (
                          <circle
                            key={i}
                            cx={scales[config.sensorId](point.normalizedValue || 0)}
                            cy={i * TIMELINE_CONFIG.rowHeight + TIMELINE_CONFIG.topMargin}
                            r={isActive ? 5 : 3}
                            style={{
                              fill: config.color,
                              opacity: baseOpacity,
                            }}
                            className={`${styles.dataPoint} ${isActive ? styles.dataPointActive : ""}`}
                            onMouseEnter={() => handleSensorHover(config.sensorId)}
                          />
                        ))}
                    </g>
                  );
                })
              )}
            </svg>
          </div>
          <div ref={bottomTriggerRef} className={styles.scrollTrigger} />
        </div>

        {tooltip && (
          <div
            className={styles.tooltip}
            style={{
              left: tooltip.x,
              top: tooltip.y,
              borderColor: tooltip.color,
            }}
          >
            <div className={styles.tooltipTitle} style={{ color: tooltip.color }}>
              {tooltip.name}
            </div>
            <div className={styles.tooltipValue}>
              {tooltip.value.toFixed(2)} {tooltip.unit}
            </div>
            <div className={styles.tooltipTime}>
              {`${tooltip.timestamp.getFullYear()}-${String(tooltip.timestamp.getMonth() + 1).padStart(
                2,
                "0"
              )}-${String(tooltip.timestamp.getDate()).padStart(2, "0")} ${String(
                tooltip.timestamp.getHours()
              ).padStart(2, "0")}:${String(tooltip.timestamp.getMinutes()).padStart(2, "0")}`}
            </div>
          </div>
        )}

        {isLoading && (
          <div className={styles.loadingOverlay}>
            <LoadingSpinner />
          </div>
        )}
      </div>
    </>
  );
};
