import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import * as d3 from "d3";
import { supabase } from "../../lib/supabase";
import useResizeObserver from "../../lib/useResizeObserver";
import styles from "./VerticalTimeline.module.css";
import { debounce } from "lodash";

interface DataPoint {
  timestamp: Date;
  value: number;
  sensorId: string;
  normalizedValue?: number;
}

interface TimelineProps {
  pageSize?: number;
  preloadThreshold?: number; // pixels from boundary to trigger preload
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
}

interface RawDataRow {
  hour: string;
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
  rightMargin: 40,
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
      { sensorId: "avg_temp", name: "Temperature", color: "#ff6b6b", unit: "°C", priority: 1 },
      { sensorId: "avg_hum", name: "Humidity", color: "#4dabf7", unit: "%", priority: 1 },
      { sensorId: "avg_pressure", name: "Pressure", color: "#51cf66", unit: "hPa", priority: 2 },
      { sensorId: "avg_lux", name: "Light", color: "#ffd43b", unit: "lux", priority: 2 },
      { sensorId: "avg_uv", name: "UV", color: "#845ef7", unit: "index", priority: 2 },
      { sensorId: "avg_gas", name: "Gas", color: "#339af0", unit: "Ω", priority: 2 },
    ],
  },
  motion: {
    name: "Motion",
    sensors: [
      { sensorId: "avg_roll", name: "Roll", color: "#ff922b", unit: "°", priority: 2 },
      { sensorId: "avg_pitch", name: "Pitch", color: "#20c997", unit: "°", priority: 2 },
      { sensorId: "avg_yaw", name: "Yaw", color: "#f06595", unit: "°", priority: 2 },
    ],
  },
  acceleration: {
    name: "Acceleration",
    sensors: [
      { sensorId: "avg_accel_x", name: "X Axis", color: "#ae3ec9", unit: "mg", priority: 3 },
      { sensorId: "avg_accel_y", name: "Y Axis", color: "#7950f2", unit: "mg", priority: 3 },
      { sensorId: "avg_accel_z", name: "Z Axis", color: "#fd7e14", unit: "mg", priority: 3 },
    ],
  },
  gyroscope: {
    name: "Gyroscope",
    sensors: [
      { sensorId: "avg_gyro_x", name: "X Axis", color: "#12b886", unit: "°/s", priority: 3 },
      { sensorId: "avg_gyro_y", name: "Y Axis", color: "#15aabf", unit: "°/s", priority: 3 },
      { sensorId: "avg_gyro_z", name: "Z Axis", color: "#1c7ed6", unit: "°/s", priority: 3 },
    ],
  },
  magnetometer: {
    name: "Magnetometer",
    sensors: [
      { sensorId: "avg_mag_x", name: "X Axis", color: "#e64980", unit: "µT", priority: 3 },
      { sensorId: "avg_mag_y", name: "Y Axis", color: "#f76707", unit: "µT", priority: 3 },
      { sensorId: "avg_mag_z", name: "Z Axis", color: "#2b8a3e", unit: "µT", priority: 3 },
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

const normalizeValue = (value: number, minVal: number, maxVal: number): number => {
  return ((value - minVal) / (maxVal - minVal)) * 100;
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
export const VerticalTimeline = ({ pageSize = 24, preloadThreshold = 400, loadingBuffer = 1000 }: TimelineProps) => {
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

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.setProperty("--min-width", `${TIMELINE_CONFIG.minWidth}px`);
    }
  }, []);

  // Simplified data fetching with cursor-based pagination
  const fetchSensorData = useCallback(
    async (beforeDate?: Date, afterDate?: Date, isPreload = false) => {
      try {
        // Implement loading buffer to prevent too frequent requests
        const now = Date.now();
        if (now - lastLoadTime.current < loadingBuffer && !isPreload) {
          return;
        }
        lastLoadTime.current = now;

        // Check if we already have data for this range
        const hasExistingData = Object.keys(dateRanges).length > 0;
        if (hasExistingData) {
          const ranges = Object.values(dateRanges);
          const earliest = new Date(Math.min(...ranges.map((r) => r.earliest.getTime())));
          const latest = new Date(Math.max(...ranges.map((r) => r.latest.getTime())));

          if (beforeDate && beforeDate >= earliest) return;
          if (afterDate && afterDate <= latest) return;
        }

        // Only set loading if we don't have any data yet or if it's not a preload
        if (!hasExistingData || !isPreload) {
          setIsLoading(true);
        }
        if (isPreload) {
          setIsPreloading(true);
        }

        // Build the select string for all sensors
        const selectColumns = SENSOR_CONFIGS.map((config) => config.sensorId).join(",");
        let query = supabase.from("hourly_aggregate").select(`hour,${selectColumns}`);

        // For initial load, get the earliest records starting from January 1st
        if (!hasExistingData) {
          const startDate = new Date("2024-01-01T00:00:00Z");
          query = query.gte("hour", startDate.toISOString()).order("hour", { ascending: true }).limit(pageSize);
        } else {
          query = query.limit(pageSize);

          if (beforeDate) {
            query = query.lt("hour", beforeDate.toISOString()).order("hour", { ascending: false });
          }
          if (afterDate) {
            query = query.gt("hour", afterDate.toISOString()).order("hour", { ascending: true });
          }
        }

        const { data: rawData, error: queryError } = await query;

        if (queryError) throw new Error(queryError.message);
        if (!rawData || rawData.length === 0) return;

        // Transform the data for each sensor
        const transformedData: Record<string, DataPoint[]> = {};
        const timestamps = (rawData as unknown as RawDataRow[]).map((row) => new Date(row.hour));
        const newEarliest = Math.min(...timestamps.map((d) => d.getTime()));
        const newLatest = Math.max(...timestamps.map((d) => d.getTime()));

        SENSOR_CONFIGS.forEach((config) => {
          transformedData[config.sensorId] = (rawData as unknown as RawDataRow[]).map((row) => ({
            timestamp: new Date(row.hour),
            value: Number(row[config.sensorId]),
            sensorId: config.sensorId,
          }));
        });

        // Update date ranges for all sensors
        setDateRanges((prev) => {
          const newRanges = { ...prev };
          SENSOR_CONFIGS.forEach((config) => {
            newRanges[config.sensorId] = {
              earliest: prev[config.sensorId]
                ? new Date(Math.min(prev[config.sensorId].earliest.getTime(), newEarliest))
                : new Date(newEarliest),
              latest: prev[config.sensorId]
                ? new Date(Math.max(prev[config.sensorId].latest.getTime(), newLatest))
                : new Date(newLatest),
            };
          });
          return newRanges;
        });

        // Merge and deduplicate data for all sensors
        setData((prev) => {
          const newData = { ...prev };
          SENSOR_CONFIGS.forEach((config) => {
            const existingData = prev[config.sensorId] || [];
            const mergedData = [...existingData, ...transformedData[config.sensorId]];

            // Deduplicate based on timestamp and sort in ascending order
            newData[config.sensorId] = Array.from(
              new Map(mergedData.map((item) => [item.timestamp.getTime(), item])).values()
            ).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
          });
          return newData;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch data");
      } finally {
        if (isPreload) {
          setIsPreloading(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [pageSize, dateRanges, loadingBuffer]
  );

  // Initial data load
  useEffect(() => {
    fetchSensorData();
  }, [fetchSensorData]);

  // Enhanced scroll handling with preloading
  const handleScroll = useCallback(
    (scrollTop: number, scrollHeight: number, clientHeight: number) => {
      // Clear any existing preload timer
      if (preloadTimer.current) {
        clearTimeout(preloadTimer.current);
      }

      const isNearTop = scrollTop < preloadThreshold;
      const isNearBottom = scrollHeight - (scrollTop + clientHeight) < preloadThreshold;
      const sensorData = Object.values(data)[0] || [];

      if (sensorData.length === 0) return;

      // Function to handle actual data loading
      const loadData = (isPreload = false) => {
        if (isNearTop) {
          const newestDate = sensorData[sensorData.length - 1].timestamp;
          fetchSensorData(undefined, newestDate, isPreload);
        } else if (isNearBottom) {
          const oldestDate = sensorData[0].timestamp;
          fetchSensorData(oldestDate, undefined, isPreload);
        }
      };

      if (isNearTop || isNearBottom) {
        // If very close to boundary, load immediately
        if (scrollTop < 100 || scrollHeight - (scrollTop + clientHeight) < 100) {
          loadData(false);
        } else {
          // Otherwise, preload after a short delay
          preloadTimer.current = setTimeout(() => {
            if (!isLoading && !isPreloading) {
              loadData(true);
            }
          }, 150);
        }
      }
    },
    [data, fetchSensorData, isLoading, isPreloading, preloadThreshold]
  );

  // Debounced scroll handler
  const debouncedScroll = useMemo(
    () =>
      debounce((scrollTop: number, scrollHeight: number, clientHeight: number) => {
        handleScroll(scrollTop, scrollHeight, clientHeight);
      }, 100),
    [handleScroll]
  );

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
        .nice();
      return acc;
    }, {});
  }, [dimensions?.width]);

  const scales = getScales();

  // Normalize data points
  const getNormalizedData = useCallback((points: DataPoint[]): DataPoint[] => {
    const values = points.map((d) => d.value);
    const minVal = d3.min(values) || 0;
    const maxVal = d3.max(values) || 100;

    return points.map((point) => ({
      ...point,
      normalizedValue: normalizeValue(point.value, minVal, maxVal),
    }));
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

      <div className={styles.scrollContainer} ref={containerRef} onClick={handleDeselect}>
        {isLoading && !data.length && (
          <div className={styles.loadingContainer}>
            <LoadingSpinner />
          </div>
        )}
        <div className={styles.timelineContent}>
          <div
            ref={scrollRef}
            className={styles.scrollContainer}
            onScroll={(e) => {
              const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
              debouncedScroll(scrollTop, scrollHeight, clientHeight);
            }}
          >
            <div
              className={styles.timelineContent}
              style={{
                height: `${
                  Math.max(...Object.values(data).map((points) => points.length - 1)) * TIMELINE_CONFIG.rowHeight + 30
                }px`,
                minWidth: `${TIMELINE_CONFIG.minWidth + TIMELINE_CONFIG.leftMargin + TIMELINE_CONFIG.rightMargin}px`,
                paddingTop: `${TIMELINE_CONFIG.topMargin}px`,
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
                    const showDate =
                      i === 0 ||
                      new Date(point.timestamp).toLocaleDateString() !==
                        new Date(arr[i - 1].timestamp).toLocaleDateString();

                    const yPos = i * TIMELINE_CONFIG.rowHeight + TIMELINE_CONFIG.topMargin;
                    const isMobile = window.innerWidth < 768;
                    const leftMargin = isMobile ? TIMELINE_CONFIG.mobileLeftMargin : TIMELINE_CONFIG.leftMargin;
                    const xOffset = leftMargin - TIMELINE_CONFIG.timeIndicatorOffset;

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
                              {i === 0 && point.timestamp.getFullYear()}
                            </text>
                            <text
                              x={xOffset}
                              y={yPos - TIMELINE_CONFIG.dateOffset}
                              className={styles.dateLabel}
                              textAnchor='end'
                              dominantBaseline='middle'
                            >
                              {point.timestamp
                                .toLocaleDateString([], {
                                  month: "short",
                                  day: "numeric",
                                })
                                .replace(",", "")}
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
                          {point.timestamp
                            .toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                              hour12: true,
                            })
                            .replace(":00", "")
                            .replace(" ", "")}
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
              <div className={styles.tooltipTime}>{tooltip.timestamp.toLocaleString()}</div>
            </div>
          )}

          {isLoading && (
            <div className={styles.loadingOverlay}>
              <LoadingSpinner />
            </div>
          )}
        </div>
      </div>
    </>
  );
};
