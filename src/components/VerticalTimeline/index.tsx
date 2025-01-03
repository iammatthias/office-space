import { useState, useRef, useCallback, useEffect } from "react";
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
  initialDays?: number;
}

interface TooltipData {
  x: number;
  y: number;
  value: number;
  timestamp: Date;
  sensorId: string;
  color: string;
  unit: string;
}

/**
 * Represents the closest data point match when comparing
 * mouse position to all points on the chart.
 */
interface ClosestMatch {
  distance: number;
  dataPoint: DataPoint;
  sensorId: string;
  color: string;
  unit: string;
  pointX: number;
  pointY: number;
}

const sensorConfigs = [
  // Environmental sensors
  { sensorId: "avg_temp", name: "Temperature", color: "#ff6b6b", unit: "°C" },
  { sensorId: "avg_hum", name: "Humidity", color: "#4dabf7", unit: "%" },
  { sensorId: "avg_pressure", name: "Pressure", color: "#51cf66", unit: "hPa" },
  { sensorId: "avg_lux", name: "Light", color: "#ffd43b", unit: "lux" },
  { sensorId: "avg_uv", name: "UV", color: "#845ef7", unit: "index" },
  { sensorId: "avg_gas", name: "Gas", color: "#339af0", unit: "Ω" },

  // Motion sensors
  { sensorId: "avg_roll", name: "Roll", color: "#ff922b", unit: "°" },
  { sensorId: "avg_pitch", name: "Pitch", color: "#20c997", unit: "°" },
  { sensorId: "avg_yaw", name: "Yaw", color: "#f06595", unit: "°" },

  // Accelerometer
  { sensorId: "avg_accel_x", name: "Acceleration X", color: "#ae3ec9", unit: "mg" },
  { sensorId: "avg_accel_y", name: "Acceleration Y", color: "#7950f2", unit: "mg" },
  { sensorId: "avg_accel_z", name: "Acceleration Z", color: "#fd7e14", unit: "mg" },

  // Gyroscope
  { sensorId: "avg_gyro_x", name: "Gyroscope X", color: "#12b886", unit: "°/s" },
  { sensorId: "avg_gyro_y", name: "Gyroscope Y", color: "#15aabf", unit: "°/s" },
  { sensorId: "avg_gyro_z", name: "Gyroscope Z", color: "#1c7ed6", unit: "°/s" },

  // Magnetometer
  { sensorId: "avg_mag_x", name: "Magnetic X", color: "#e64980", unit: "µT" },
  { sensorId: "avg_mag_y", name: "Magnetic Y", color: "#f76707", unit: "µT" },
  { sensorId: "avg_mag_z", name: "Magnetic Z", color: "#2b8a3e", unit: "µT" },
];

// Add helper function to normalize values (add after existing helper functions)
const normalizeValue = (value: number, minVal: number, maxVal: number): number => {
  return ((value - minVal) / (maxVal - minVal)) * 100;
};

// Add new interfaces for data handling
interface TimeRange {
  startDate?: Date;
  endDate?: Date;
}

// Add loading state component
const LoadingSpinner = () => (
  <div className={styles.loadingSpinner}>
    <div className={styles.spinner} />
  </div>
);

// Add interface for raw sensor data
interface RawSensorData {
  hour: string;
  [key: string]: number | string;
}

// Add Dataset interface
interface Dataset {
  sensorId: string;
  name: string;
  color: string;
  unit: string;
  data: DataPoint[];
}

// Update the FetchedData interface
interface FetchedData {
  [sensorId: string]: {
    data: DataPoint[];
    hasMoreNewer: boolean;
    hasMoreOlder: boolean;
    isLoading: boolean;
    timeRange: TimeRange;
  };
}

export const VerticalTimeline = ({ pageSize = 100, initialDays = 1 }: TimelineProps) => {
  // Add states for data handling
  const [fetchedData, setFetchedData] = useState<FetchedData>({});
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Existing states
  const [hoveredSensor, setHoveredSensor] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef<HTMLDivElement>(null);

  const dimensions = useResizeObserver(containerRef);

  // Add data fetching function
  const fetchSensorData = useCallback(
    async (sensorId: string, timeRange: TimeRange, direction: "older" | "newer" = "older") => {
      try {
        setFetchedData((prev) => ({
          ...prev,
          [sensorId]: {
            ...prev[sensorId],
            isLoading: true,
          },
        }));

        const query = supabase
          .from("hourly_aggregate")
          .select("hour," + sensorId)
          .limit(pageSize + 1);

        if (direction === "older" && timeRange.startDate) {
          query.lt("hour", timeRange.startDate.toISOString()).order("hour", { ascending: false });
        } else if (direction === "newer" && timeRange.endDate) {
          query.gt("hour", timeRange.endDate.toISOString()).order("hour", { ascending: true });
        }

        const { data: rawData, error } = await query;

        if (error) throw new Error(error.message);
        if (!rawData) throw new Error("No data received");

        const hasMore = rawData.length > pageSize;
        const actualData = hasMore ? rawData.slice(0, -1) : rawData;

        // Transform the data
        let transformedData = (actualData as unknown as RawSensorData[]).map((row) => ({
          timestamp: new Date(row.hour),
          value: Number(row[sensorId]),
          sensorId,
        }));

        if (direction === "older") {
          transformedData = transformedData.reverse();
        }

        setFetchedData((prev) => {
          const existingData = prev[sensorId]?.data || [];
          const newData =
            direction === "older" ? [...existingData, ...transformedData] : [...transformedData, ...existingData];

          return {
            ...prev,
            [sensorId]: {
              data: newData,
              hasMoreOlder: direction === "older" ? hasMore : prev[sensorId]?.hasMoreOlder ?? true,
              hasMoreNewer: direction === "newer" ? hasMore : prev[sensorId]?.hasMoreNewer ?? true,
              isLoading: false,
              timeRange: {
                startDate: newData[0]?.timestamp,
                endDate: newData[newData.length - 1]?.timestamp,
              },
            },
          };
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch data");
        setFetchedData((prev) => ({
          ...prev,
          [sensorId]: {
            ...prev[sensorId],
            isLoading: false,
          },
        }));
      }
    },
    [pageSize]
  );

  // Initial data load
  useEffect(() => {
    const loadInitialData = async () => {
      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - initialDays);

      await Promise.all(sensorConfigs.map((config) => fetchSensorData(config.sensorId, { endDate })));

      setIsInitialLoad(false);
    };

    loadInitialData();
  }, [sensorConfigs, fetchSensorData, initialDays]);

  // Set up intersection observer for infinite scroll
  useEffect(() => {
    if (!loadingRef.current) return;

    const observer = new IntersectionObserver(
      async (entries) => {
        const target = entries[0];
        if (target.isIntersecting) {
          const sensorsToLoad = sensorConfigs.filter((config) => {
            const sensorData = fetchedData[config.sensorId];
            return sensorData?.hasMoreNewer && !sensorData?.isLoading;
          });

          await Promise.all(
            sensorsToLoad.map((config) =>
              fetchSensorData(config.sensorId, fetchedData[config.sensorId].timeRange, "newer")
            )
          );
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(loadingRef.current);
    observerRef.current = observer;

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [fetchedData, sensorConfigs, fetchSensorData]);

  // Transform fetched data into dataset format
  const datasets: Dataset[] = sensorConfigs.map((config) => ({
    ...config,
    data: fetchedData[config.sensorId]?.data || [],
  }));

  const TIMELINE_CONFIG = {
    rowHeight: 120,
    leftMargin: 100,
    rightMargin: 60,
    containerHeight: "100%",
    minWidth: 400,
  };

  // Set up scales
  const getScales = useCallback(() => {
    if (!dimensions?.width) return {};

    return datasets.reduce((acc, dataset) => {
      const chartWidth = Math.max(
        dimensions.width - TIMELINE_CONFIG.leftMargin - TIMELINE_CONFIG.rightMargin,
        TIMELINE_CONFIG.minWidth
      );

      // Create a simple linear scale from 0-100
      acc[dataset.sensorId] = d3
        .scaleLinear()
        .domain([0, 100])
        .range([TIMELINE_CONFIG.leftMargin, TIMELINE_CONFIG.leftMargin + chartWidth])
        .nice();

      return acc;
    }, {} as Record<string, d3.ScaleLinear<number, number>>);
  }, [datasets, dimensions?.width]);

  const scales = getScales();

  // Add function to normalize dataset
  const getNormalizedData = useCallback((dataset: Dataset) => {
    const values = dataset.data.map((d: DataPoint) => d.value);
    const minVal = d3.min(values) || 0;
    const maxVal = d3.max(values) || 100;

    return dataset.data.map((point: DataPoint) => ({
      ...point,
      normalizedValue: normalizeValue(point.value, minVal, maxVal),
    }));
  }, []);

  // Modify createLine to use the data parameter directly
  const createLine = useCallback(
    (sensorId: string, data: DataPoint[]) => {
      const scale = scales[sensorId];
      if (!scale) return d3.line<DataPoint>();

      return d3
        .line<DataPoint>()
        .x((d) => scale(d.normalizedValue || 0))
        .y((_) => {
          const dataIndex = data.findIndex((point) => point === _);
          return dataIndex * TIMELINE_CONFIG.rowHeight;
        })
        .curve(d3.curveCatmullRom.alpha(0.5));
    },
    [scales, TIMELINE_CONFIG.rowHeight]
  );

  /**
   * Single onMouseMove handler for the entire SVG.
   * We look for the closest point across all datasets,
   * so that whichever line is nearest gets highlighted.
   */
  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!dimensions) return;

      const svgElement = event.currentTarget;
      const [mouseX, mouseY] = d3.pointer(event, svgElement);

      let minDistance = Infinity;
      let closestMatch: ClosestMatch = {
        distance: Infinity,
        dataPoint: datasets[0].data[0],
        sensorId: datasets[0].sensorId,
        color: datasets[0].color,
        unit: datasets[0].unit,
        pointX: 0,
        pointY: 0,
      };

      datasets.forEach((dataset) => {
        const scale = scales[dataset.sensorId];
        if (!scale) return;
        const normalizedData = getNormalizedData(dataset);

        normalizedData.forEach((point, i) => {
          const pointX = scale(point.normalizedValue);
          const pointY = i * TIMELINE_CONFIG.rowHeight;

          const distance = Math.sqrt((pointX - mouseX) ** 2 + (pointY - mouseY) ** 2);

          if (distance < minDistance) {
            minDistance = distance;
            closestMatch = {
              distance,
              dataPoint: dataset.data[i],
              sensorId: dataset.sensorId,
              color: dataset.color,
              unit: dataset.unit,
              pointX,
              pointY,
            };
          }
        });
      });

      if (closestMatch && closestMatch.distance < 30) {
        setTooltip({
          x: event.clientX,
          y: event.clientY,
          value: closestMatch.dataPoint.value,
          timestamp: closestMatch.dataPoint.timestamp,
          sensorId: closestMatch.sensorId,
          color: closestMatch.color,
          unit: closestMatch.unit,
        });
        setHoveredSensor(closestMatch.sensorId);
      } else {
        setTooltip(null);
        setHoveredSensor(null);
      }
    },
    [datasets, scales, dimensions, getNormalizedData]
  );

  // Hover logic for legend items
  const handleLineHover = useCallback((sensorId: string | null) => {
    setHoveredSensor(sensorId);
    if (!sensorId) {
      setTooltip(null);
    }
  }, []);

  // Add this function to generate timeline labels
  const getTimelineLabels = useCallback(() => {
    if (!datasets[0]?.data.length) return [];

    const timestamps = datasets[0].data.map((d) => d.timestamp);
    let currentDate = "";

    return timestamps.map((timestamp, index) => {
      const date = timestamp.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      const time = timestamp.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

      let label = time;
      if (date !== currentDate) {
        currentDate = date;
        label = `${date}\n${time}`;
      }

      return {
        y: index * TIMELINE_CONFIG.rowHeight,
        label,
        isNewDay: date !== currentDate,
      };
    });
  }, [datasets]);

  // Add debounced scroll handler
  const debouncedLoadMore = useCallback(
    debounce((scrollTop: number, scrollHeight: number, clientHeight: number) => {
      const scrolledToTop = scrollTop < 200;
      const scrolledToBottom = scrollHeight - (scrollTop + clientHeight) < 200;

      if (scrolledToTop || scrolledToBottom) {
        const direction = scrolledToTop ? "newer" : "older";
        const sensorsToLoad = sensorConfigs.filter((config) => {
          const sensorData = fetchedData[config.sensorId];
          return direction === "newer"
            ? sensorData?.hasMoreNewer && !sensorData?.isLoading
            : sensorData?.hasMoreOlder && !sensorData?.isLoading;
        });

        sensorsToLoad.forEach((config) => {
          const timeRange = fetchedData[config.sensorId].timeRange;
          fetchSensorData(config.sensorId, timeRange, direction);
        });
      }
    }, 250),
    [fetchedData, fetchSensorData]
  );

  // Update the scroll handler in the component
  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
      debouncedLoadMore(scrollTop, scrollHeight, clientHeight);
    },
    [debouncedLoadMore]
  );

  if (isInitialLoad) {
    return (
      <div ref={containerRef} className={styles.loadingContainer}>
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div ref={containerRef} className={styles.errorContainer}>
        Error: {error}
      </div>
    );
  }

  return (
    <div className={styles.container} ref={containerRef}>
      {/* Legend - now sticky */}
      <div className={styles.legend}>
        {datasets.map((dataset) => (
          <div
            key={dataset.sensorId}
            className={`${styles.legendItem} ${hoveredSensor === dataset.sensorId ? styles.legendItemActive : ""}`}
            onMouseEnter={() => handleLineHover(dataset.sensorId)}
            onMouseLeave={() => handleLineHover(null)}
          >
            <div className={styles.legendColor} style={{ backgroundColor: dataset.color }} />
            <span>
              {dataset.name}
              <br />({d3.min(dataset.data, (d) => d.value)?.toFixed(1)} -{" "}
              {d3.max(dataset.data, (d) => d.value)?.toFixed(1)} {dataset.unit})
            </span>
          </div>
        ))}
      </div>

      {/* Timeline content */}
      <div className={styles.timelineWrapper}>
        <div
          className={styles.timelineContent}
          onScroll={handleScroll}
          style={{
            height: `${Math.max(...datasets.map((d) => d.data.length)) * TIMELINE_CONFIG.rowHeight}px`,
            minWidth: `${TIMELINE_CONFIG.minWidth + TIMELINE_CONFIG.leftMargin + TIMELINE_CONFIG.rightMargin}px`,
          }}
        >
          <svg
            width='100%'
            height='100%'
            onMouseMove={handleMouseMove}
            style={{ position: "absolute", top: 0, left: 0 }}
          >
            {/* Add Timeline Labels */}
            <g className={styles.timelineLabels}>
              {getTimelineLabels().map(({ y, label, isNewDay }, index) => (
                <text
                  key={index}
                  x={TIMELINE_CONFIG.leftMargin - 10}
                  y={y}
                  dy='0.32em'
                  textAnchor='end'
                  className={`${styles.timelineLabel} ${isNewDay ? styles.timelineLabelDate : ""}`}
                >
                  {label.split("\n").map((line, i) => (
                    <tspan key={i} x={TIMELINE_CONFIG.leftMargin - 10} dy={i === 0 ? 0 : "1.2em"}>
                      {line}
                    </tspan>
                  ))}
                </text>
              ))}
            </g>

            {/* Update circle positions */}
            {datasets.map((dataset) => {
              const normalizedData = getNormalizedData(dataset);
              const lineGenerator = createLine(dataset.sensorId, normalizedData);
              const isActive = hoveredSensor === null || hoveredSensor === dataset.sensorId;
              const scale = scales[dataset.sensorId];

              return (
                <g key={dataset.sensorId}>
                  <path
                    d={lineGenerator(normalizedData) || ""}
                    stroke={dataset.color}
                    strokeWidth={2}
                    fill='none'
                    className={styles.path}
                    style={{
                      opacity: isActive ? 1 : 0.3,
                      transition: "opacity 0.2s ease, stroke-width 0.2s ease",
                    }}
                  />
                  {normalizedData.map((point, i) => (
                    <circle
                      key={i}
                      cx={scale(point.normalizedValue)}
                      cy={i * TIMELINE_CONFIG.rowHeight}
                      r={3}
                      fill={dataset.color}
                      stroke='white'
                      strokeWidth={1.5}
                      className={styles.dataPoint}
                      style={{
                        opacity: isActive ? 1 : 0.3,
                        transition: "opacity 0.2s ease, r 0.2s ease",
                      }}
                    />
                  ))}
                </g>
              );
            })}

            <rect width='100%' height='100%' fill='transparent' style={{ pointerEvents: "all" }} />
          </svg>
        </div>

        {/* Loading indicator */}
        <div ref={loadingRef} className={styles.loadingIndicator}>
          {Object.values(fetchedData).some((data) => data.isLoading) && <LoadingSpinner />}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className={styles.tooltip}
          style={{
            left: tooltip.x + 10,
            top: tooltip.y + 10,
            borderColor: tooltip.color,
          }}
        >
          <div className={styles.tooltipValue} style={{ color: tooltip.color }}>
            {tooltip.value.toFixed(2)} {tooltip.unit}
          </div>
          <div className={styles.tooltipTime}>{tooltip.timestamp.toLocaleString()}</div>
        </div>
      )}
    </div>
  );
};
