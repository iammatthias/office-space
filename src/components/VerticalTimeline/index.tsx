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
  isNew?: boolean;
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
  if (value == null) return 0;
  const clampedValue = Math.max(sensorRange[0], Math.min(sensorRange[1], value));

  if (sensorId.includes("gas")) {
    const logValue = Math.log10(Math.max(0.1, clampedValue));
    const logMin = Math.log10(Math.max(0.1, minVal));
    const logMax = Math.log10(maxVal);
    return Math.max(0, Math.min(100, ((logValue - logMin) / (logMax - logMin)) * 100));
  }

  if (sensorId.includes("lux")) {
    const logValue = Math.log10(Math.max(1, clampedValue));
    const logMin = Math.log10(Math.max(1, minVal));
    const logMax = Math.log10(maxVal);
    return Math.max(0, Math.min(100, ((logValue - logMin) / (logMax - logMin)) * 100));
  }

  if (sensorId.includes("uv")) {
    const normalizedToRange = ((clampedValue - minVal) / (maxVal - minVal)) * 100;
    return Math.max(0, Math.min(100, normalizedToRange));
  }

  if (
    sensorId.includes("accel") ||
    sensorId.includes("gyro") ||
    sensorId.includes("mag") ||
    sensorId.includes("roll") ||
    sensorId.includes("pitch") ||
    sensorId.includes("yaw")
  ) {
    const dataRange = maxVal - minVal;
    const normalized = ((clampedValue - minVal) / dataRange) * 100;
    return Math.max(0, Math.min(100, normalized));
  }

  const normalizedToRange = ((clampedValue - minVal) / (maxVal - minVal)) * 100;
  return Math.max(0, Math.min(100, normalizedToRange));
};

export const VerticalTimeline = ({ pageSize = 24, loadingBuffer = 1000 }: TimelineProps) => {
  const [data, setData] = useState<Record<string, DataPoint[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isPreloading, setIsPreloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredSensor, setHoveredSensor] = useState<string | null>(null);
  const [selectedSensor, setSelectedSensor] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [dateRanges, setDateRanges] = useState<Record<string, { earliest: Date; latest: Date }>>({});
  const [isLegendExpanded, setIsLegendExpanded] = useState(false);

  const lastLoadTime = useRef<number>(0);
  const preloadTimer = useRef<NodeJS.Timeout>();
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomTriggerRef = useRef<HTMLDivElement>(null);

  const dimensions = useResizeObserver(containerRef);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.setProperty("--min-width", `${TIMELINE_CONFIG.minWidth}px`);
    }
  }, []);

  const mergeData = useCallback((prevData: Record<string, DataPoint[]>, newData: Record<string, DataPoint[]>) => {
    const mergedData = { ...prevData };
    Object.entries(newData).forEach(([sensorId, newPoints]) => {
      const existingPoints = mergedData[sensorId] || [];
      const pointMap = new Map(existingPoints.map((p) => [p.timestamp.getTime(), p]));
      newPoints.forEach((point) => {
        const t = point.timestamp.getTime();
        if (!pointMap.has(t)) {
          pointMap.set(t, { ...point, isNew: true });
        }
      });
      mergedData[sensorId] = Array.from(pointMap.values()).sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
      );
    });
    return mergedData;
  }, []);

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

        const selectColumns = SENSOR_CONFIGS.map((c) => c.sensorId).join(",");
        let query = supabase
          .from("daynight_data")
          .select(`time,period,${selectColumns}`)
          .order("time", { ascending: true });

        if (!Object.keys(dateRanges).length) {
          query = query.limit(pageSize);
        } else if (afterDate) {
          query = query.gt("time", afterDate.toISOString()).limit(pageSize);
        }

        const { data: rawData, error: queryError } = await query;
        if (queryError) throw new Error(queryError.message);
        if (!rawData || rawData.length === 0) return;

        const typedRawData = rawData as unknown as RawDataRow[];
        const timestamps = typedRawData.map((row) => new Date(row.time));
        const newEarliest = Math.min(...timestamps.map((d) => d.getTime()));
        const newLatest = Math.max(...timestamps.map((d) => d.getTime()));

        const transformedData: Record<string, DataPoint[]> = {};
        SENSOR_CONFIGS.forEach((config) => {
          transformedData[config.sensorId] = typedRawData.map((row) => ({
            timestamp: new Date(row.time),
            value: row[config.sensorId] == null ? 0 : Number(row[config.sensorId]),
            sensorId: config.sensorId,
            period: row.period ? row.period : "",
          }));
        });

        setData((prev) => mergeData(prev, transformedData));

        setDateRanges((prev) => {
          const newRanges = { ...prev };
          SENSOR_CONFIGS.forEach((config) => {
            if (!newRanges[config.sensorId]) {
              newRanges[config.sensorId] = {
                earliest: new Date(newEarliest),
                latest: new Date(newLatest),
              };
            } else if (afterDate) {
              newRanges[config.sensorId].latest = new Date(Math.max(newLatest, prev[config.sensorId].latest.getTime()));
            }
          });
          return newRanges;
        });

        if (typedRawData.length === pageSize && !isPreload) {
          const latestTimestamp = new Date(Math.max(...timestamps.map((d) => d.getTime())));
          if (preloadTimer.current) {
            clearTimeout(preloadTimer.current);
          }
          preloadTimer.current = setTimeout(() => {
            fetchSensorData(latestTimestamp, true);
          }, 100);
        }
      } catch (err: any) {
        console.error("Error fetching data:", err);
        setError(err.message);
      } finally {
        if (isPreload) setIsPreloading(false);
        else setIsLoading(false);
      }
    },
    [dateRanges, pageSize, loadingBuffer, mergeData]
  );

  useEffect(() => {
    fetchSensorData();
  }, [fetchSensorData]);

  useEffect(() => {
    let observer: IntersectionObserver | null = null;
    const loadData = () => {
      const sensorData = Object.values(data)[0] || [];
      if (!sensorData.length) return;
      const newestDate = sensorData[sensorData.length - 1].timestamp;
      fetchSensorData(newestDate, false);
    };

    const bottomObserverCallback: IntersectionObserverCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !isLoading && !isPreloading) {
          loadData();
        }
      });
    };

    observer = new IntersectionObserver(bottomObserverCallback, {
      root: null,
      threshold: 0,
      rootMargin: "0px 0px 50px 0px",
    });
    if (bottomTriggerRef.current) {
      observer.observe(bottomTriggerRef.current);
    }

    return () => {
      if (observer) observer.disconnect();
    };
  }, [data, isLoading, isPreloading, fetchSensorData]);

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
        .clamp(true);
      return acc;
    }, {});
  }, [dimensions?.width]);

  const scales = getScales();

  const getNormalizedData = useCallback((points: DataPoint[]) => {
    if (!points[0]) return points;
    const sensorConfig = SENSOR_CONFIGS.find((c) => c.sensorId === points[0].sensorId);
    if (!sensorConfig) return points;

    const values = points.map((d) => d.value);
    const minVal = Math.max(sensorConfig.range[0], Math.min(...values));
    const maxVal = Math.min(sensorConfig.range[1], Math.max(...values));

    return points.map((p) => ({
      ...p,
      normalizedValue: normalizeValue(p.value, minVal, maxVal, sensorConfig.range, p.sensorId),
    }));
  }, []);

  const createLine = useCallback(
    (sensorId: string, normalizedPoints: DataPoint[]) => {
      const scale = scales[sensorId];
      if (!scale || !normalizedPoints.length) return "";
      return (
        d3
          .line<DataPoint>()
          .x((d) => scale(d.normalizedValue ?? 0))
          .y((_, i) => i * TIMELINE_CONFIG.rowHeight + TIMELINE_CONFIG.topMargin)
          .curve(d3.curveCatmullRom.alpha(0.5))(normalizedPoints) ?? ""
      );
    },
    [scales]
  );

  const handleSensorSelection = useCallback(
    (sensorId: string | null) => {
      if (!sensorId || sensorId === selectedSensor) {
        setSelectedSensor(null);
        setHoveredSensor(null);
        setTooltip(null);
      } else {
        setSelectedSensor(sensorId);
        setHoveredSensor(sensorId);
      }
    },
    [selectedSensor]
  );

  const handleSensorHover = useCallback(
    (sensorId: string | null) => {
      if (!selectedSensor) {
        setHoveredSensor(sensorId);
      }
    },
    [selectedSensor]
  );

  const handleDeselect = useCallback(() => {
    setSelectedSensor(null);
    setHoveredSensor(null);
    setTooltip(null);
  }, []);

  const findClosestSensor = useCallback(
    (mouseX: number, mouseY: number) => {
      let closestLine: ClosestLine | null = null;
      let minDist = Infinity;
      SENSOR_CONFIGS.forEach((config, groupIndex) => {
        const points = data[config.sensorId] || [];
        if (!points.length) return;
        const normalized = getNormalizedData(points);
        const scale = scales[config.sensorId];
        if (!scale) return;

        const mouseIndex = Math.floor((mouseY - TIMELINE_CONFIG.topMargin) / TIMELINE_CONFIG.rowHeight);
        if (mouseIndex < 0 || mouseIndex >= normalized.length - 1) return;

        const p1 = {
          x: scale(normalized[mouseIndex].normalizedValue ?? 0),
          y: mouseIndex * TIMELINE_CONFIG.rowHeight + TIMELINE_CONFIG.topMargin,
        };
        const p2 = {
          x: scale(normalized[mouseIndex + 1].normalizedValue ?? 0),
          y: (mouseIndex + 1) * TIMELINE_CONFIG.rowHeight + TIMELINE_CONFIG.topMargin,
        };

        const len = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
        if (!len) return;
        const t = Math.max(
          0,
          Math.min(1, ((mouseX - p1.x) * (p2.x - p1.x) + (mouseY - p1.y) * (p2.y - p1.y)) / (len * len))
        );
        const projX = p1.x + t * (p2.x - p1.x);
        const projY = p1.y + t * (p2.y - p1.y);
        const dist = Math.sqrt((mouseX - projX) ** 2 + (mouseY - projY) ** 2);

        if (dist < minDist) {
          minDist = dist;
          closestLine = { distance: dist, config, groupIndex };
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
    [data, getNormalizedData, scales]
  );

  const handleSvgClick = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const svg = event.currentTarget;
      const [mouseX, mouseY] = d3.pointer(event, svg);
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

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!dimensions) return;
      const svg = event.currentTarget;
      const [mouseX, mouseY] = d3.pointer(event, svg);
      const closest = findClosestSensor(mouseX, mouseY);
      if (closest) {
        const config = SENSOR_CONFIGS.find((c) => c.sensorId === closest.sensorId);
        if (!config) return;
        const points = data[closest.sensorId] || [];
        if (!points.length) return;

        const normalized = getNormalizedData(points);
        const scale = scales[closest.sensorId];
        if (!scale || !normalized.length) return;

        const mouseIndex = Math.floor((mouseY - TIMELINE_CONFIG.topMargin) / TIMELINE_CONFIG.rowHeight);
        if (mouseIndex >= 0 && mouseIndex < normalized.length) {
          const pt = normalized[mouseIndex];
          const tooltipW = 180;
          const tooltipH = 80;
          const vw = window.innerWidth;
          const vh = window.innerHeight;

          let tX = event.clientX + 10;
          let tY = event.clientY - tooltipH / 2;
          if (tX + tooltipW > vw - 20) tX = event.clientX - tooltipW - 10;
          if (tY + tooltipH > vh - 20) tY = vh - tooltipH - 20;
          if (tY < 20) tY = 20;

          if (!selectedSensor || selectedSensor === closest.sensorId) {
            setTooltip({
              x: tX,
              y: tY,
              value: pt.value,
              timestamp: pt.timestamp,
              sensorId: closest.sensorId,
              color: config.color,
              unit: config.unit,
              name: config.name,
            });
            if (!selectedSensor) setHoveredSensor(closest.sensorId);
          }
        }
      } else {
        if (!selectedSensor) {
          setTooltip(null);
          setHoveredSensor(null);
        }
      }
    },
    [dimensions, data, findClosestSensor, getNormalizedData, scales, selectedSensor]
  );

  useEffect(() => {
    const handleClickOutside = (evt: MouseEvent) => {
      if (selectedSensor && containerRef.current && !containerRef.current.contains(evt.target as Node)) {
        handleDeselect();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [selectedSensor, handleDeselect]);

  useEffect(() => {
    if (!dimensions) return;
    const svg = d3.select(containerRef.current).select("svg");
    let sensorGroupsContainer = svg.select<SVGGElement>("g.sensor-groups");

    if (sensorGroupsContainer.empty()) {
      sensorGroupsContainer = svg.append("g").attr("class", "sensor-groups");
    }

    const sensorGroups = sensorGroupsContainer
      .selectAll<SVGGElement, [string, DataPoint[]]>("g.sensor-group")
      .data(Object.entries(data), ([sensorId]) => sensorId);

    const enterGroups = sensorGroups
      .enter()
      .append("g")
      .attr("class", "sensor-group")
      .attr("data-sensor", ([sensorId]) => sensorId)
      .style("opacity", 0);

    enterGroups.append("path").attr("class", "sensor-line").attr("fill", "none").attr("stroke-width", 2);

    const allGroups = enterGroups.merge(sensorGroups);

    enterGroups.transition().duration(750).style("opacity", 1);

    allGroups.each(function ([sensorId, points]) {
      const group = d3.select(this);
      const path = group.select<SVGPathElement>("path.sensor-line");
      const normalizedPoints = getNormalizedData(points);
      const config = SENSOR_CONFIGS.find((c) => c.sensorId === sensorId);
      if (!config) return;

      path
        .attr("stroke", config.color)
        .transition()
        .duration(750)
        .ease(d3.easeLinear)
        .attr("d", createLine(sensorId, normalizedPoints));

      const pointSelection = group
        .selectAll<SVGCircleElement, DataPoint>("circle")
        .data(normalizedPoints, (d) => d.timestamp.getTime().toString());

      pointSelection.exit().transition().duration(500).style("opacity", 0).attr("r", 0).remove();

      pointSelection
        .transition()
        .duration(750)
        .ease(d3.easeLinear)
        .style("opacity", 1)
        .attr("cx", (d) => scales[sensorId](d.normalizedValue ?? 0))
        .attr("cy", (_d, i) => i * TIMELINE_CONFIG.rowHeight + TIMELINE_CONFIG.topMargin)
        .attr("r", () => {
          const isActive = selectedSensor === sensorId || hoveredSensor === sensorId;
          return isActive ? 5 : config.priority === 1 ? 3 : 0;
        });

      pointSelection
        .enter()
        .append("circle")
        .attr("fill", config.color)
        .attr("r", 0)
        .style("opacity", 0)
        .attr("cx", (d) => scales[sensorId](d.normalizedValue ?? 0))
        .attr("cy", (_d, i) => i * TIMELINE_CONFIG.rowHeight + TIMELINE_CONFIG.topMargin)
        .transition()
        .duration(500)
        .style("opacity", 1)
        .attr("r", () => {
          const isActive = selectedSensor === sensorId || hoveredSensor === sensorId;
          return isActive ? 5 : config.priority === 1 ? 3 : 0;
        });
    });

    sensorGroups.exit().transition().duration(350).style("opacity", 0).remove();
  }, [data, dimensions, scales, getNormalizedData, createLine, selectedSensor, hoveredSensor]);

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
              {group.sensors.map((cfg) => (
                <div
                  key={cfg.sensorId}
                  className={`${styles.legendItem} ${
                    hoveredSensor === cfg.sensorId || selectedSensor === cfg.sensorId ? styles.legendItemActive : ""
                  }`}
                  onClick={() => handleSensorSelection(cfg.sensorId)}
                  onMouseEnter={() => handleSensorHover(cfg.sensorId)}
                  onMouseLeave={() => handleSensorHover(null)}
                >
                  <div className={styles.legendColor} style={{ backgroundColor: cfg.color }} />
                  <span>{cfg.name}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.scrollContainer} ref={scrollRef}>
        <div className={styles.scrollContent} ref={containerRef}>
          <div
            className={styles.timelineContent}
            style={{
              backgroundColor: "transparent",
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
                if (!selectedSensor) {
                  setTooltip(null);
                  setHoveredSensor(null);
                }
              }}
              className={styles.timelineSvg}
              style={{
                backgroundColor: "transparent",
              }}
            >
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
              )}-${String(tooltip.timestamp.getDate()).padStart(2, "0")} 
                ${String(tooltip.timestamp.getHours()).padStart(2, "0")}:
                ${String(tooltip.timestamp.getMinutes()).padStart(2, "0")}`}
            </div>
          </div>
        )}

        {error && <div className={styles.errorOverlay}>Error: {error}</div>}
        {(isLoading || isPreloading) && (
          <div className={styles.loadingOverlay} style={{ backgroundColor: "rgba(0,0,0,0.2)" }}>
            <LoadingSpinner />
          </div>
        )}
      </div>
    </>
  );
};
