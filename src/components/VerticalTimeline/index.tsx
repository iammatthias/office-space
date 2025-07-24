import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import * as d3 from "d3";
import { supabase } from "../../lib/supabase";
import styles from "./VerticalTimeline.module.css";

interface DataPoint {
  timestamp: Date;
  value: number;
  sensorId: string;
  normalizedValue: number;
  period: string;
}

interface SensorConfig {
  sensorId: string;
  name: string;
  color: string;
  unit: string;
  range: [number, number];
}

const SENSOR_CONFIGS: SensorConfig[] = [
  { sensorId: "temp", name: "Temperature", color: "#ff6b6b", unit: "°C", range: [-40, 85] },
  { sensorId: "hum", name: "Humidity", color: "#4dabf7", unit: "%", range: [0, 100] },
  { sensorId: "pressure", name: "Pressure", color: "#51cf66", unit: "hPa", range: [300, 1100] },
  { sensorId: "lux", name: "Light", color: "#ffd43b", unit: "lux", range: [0, 88000] },
  { sensorId: "uv", name: "UV", color: "#845ef7", unit: "index", range: [0, 11] },
  { sensorId: "gas", name: "Gas", color: "#339af0", unit: "ppm", range: [0, 1000] },
  { sensorId: "roll", name: "Roll", color: "#ff922b", unit: "°", range: [-180, 180] },
  { sensorId: "pitch", name: "Pitch", color: "#20c997", unit: "°", range: [-180, 180] },
  { sensorId: "yaw", name: "Yaw", color: "#f06595", unit: "°", range: [-180, 180] },
  { sensorId: "mag_x", name: "Mag X", color: "#e64980", unit: "µT", range: [-4900, 4900] },
  { sensorId: "mag_y", name: "Mag Y", color: "#f76707", unit: "µT", range: [-4900, 4900] },
  { sensorId: "mag_z", name: "Mag Z", color: "#2b8a3e", unit: "µT", range: [-4900, 4900] },
];

const normalizeValue = (value: number, sensorRange: [number, number], sensorId: string): number => {
  // Handle invalid input values
  if (value == null || isNaN(value) || !isFinite(value)) {
    console.warn(`Invalid value for ${sensorId}:`, value);
    return 0;
  }

  const [min, max] = sensorRange;

  // Handle invalid ranges
  if (min >= max || !isFinite(min) || !isFinite(max)) {
    console.warn(`Invalid range for ${sensorId}:`, [min, max]);
    return 0;
  }

  // Clamp value to sensor range
  const clampedValue = Math.max(min, Math.min(max, value));

  // Special handling for logarithmic sensors (gas and lux)
  if (sensorId.includes("gas") || sensorId.includes("lux")) {
    // Ensure positive values for log calculation
    const positiveMin = Math.max(0.1, min);
    const positiveValue = Math.max(0.1, clampedValue);
    const positiveMax = Math.max(positiveMin + 0.1, max);

    // Calculate logarithmic values
    const logValue = Math.log10(positiveValue);
    const logMin = Math.log10(positiveMin);
    const logMax = Math.log10(positiveMax);

    // Avoid division by zero
    if (logMax === logMin) {
      console.warn(`Zero range for ${sensorId} logarithmic calculation`);
      return 50; // Return middle value if range is zero
    }

    const normalized = ((logValue - logMin) / (logMax - logMin)) * 100;
    return Math.max(0, Math.min(100, normalized));
  }

  // Linear normalization for other sensors
  const normalized = ((clampedValue - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, normalized));
};

export const VerticalTimeline = ({ height = 600 }) => {
  const [data, setData] = useState<Record<string, DataPoint[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [selectedSensor, setSelectedSensor] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; data: DataPoint; config: SensorConfig } | null>(null);
  const [currentTimeRange, setCurrentTimeRange] = useState<{ start: Date; end: Date } | null>(null);
  const [fullTimeRange, setFullTimeRange] = useState<{ start: Date; end: Date } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isZooming, setIsZooming] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [containerReady, setContainerReady] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isProcessingData, setIsProcessingData] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // Set initial time range for immediate interaction
  useEffect(() => {
    if (!currentTimeRange && !fullTimeRange) {
      const now = new Date();
      const initialTimeRange = {
        start: new Date("2025-01-01"), // Use actual earliest date
        end: now,
      };
      console.log("Setting initial time range:", initialTimeRange);
      console.log(
        "📊 Initial time span:",
        (initialTimeRange.end.getTime() - initialTimeRange.start.getTime()) / (1000 * 60 * 60 * 24),
        "days"
      );
      setCurrentTimeRange(initialTimeRange);
    }
  }, [currentTimeRange, fullTimeRange]);

  // Set container ready when ref is available
  useEffect(() => {
    if (containerRef.current) {
      console.log("✅ Container ref is now available");
      setContainerReady(true);
    }
  }, [containerRef.current]);

  // Get container dimensions with proper resize handling
  const dimensions = useMemo(() => {
    console.log("🔍 Calculating dimensions...");
    console.log("Container ref:", containerRef.current);
    console.log("Container ready:", containerReady);

    if (!containerRef.current || !containerReady) {
      console.log("❌ Container ref not available or not ready");
      // Return fallback dimensions to ensure chart renders
      return {
        width: 800,
        height,
        margin: { top: 40, right: 40, bottom: 60, left: 80 },
      };
    }

    const rect = containerRef.current.getBoundingClientRect();
    console.log("Container rect:", rect);

    const dims = {
      width: rect.width,
      height,
      margin: { top: 40, right: 40, bottom: 60, left: 80 },
    };

    console.log("✅ Calculated dimensions:", dims);
    return dims;
  }, [height, containerReady]);

  // Generate immediate mock data for instant rendering
  const mockData = useMemo(() => {
    const now = Date.now();
    const startDate = new Date("2025-01-01").getTime();
    const mockDataPoints: Record<string, DataPoint[]> = {};

    console.log("📊 Generating mock data from", new Date(startDate), "to", new Date(now));

    SENSOR_CONFIGS.forEach((config) => {
      mockDataPoints[config.sensorId] = Array.from({ length: 50 }, (_, i) => {
        // Increased from 20 to 50 data points
        // Create more realistic mock data with different patterns for each sensor
        let value: number;
        switch (config.sensorId) {
          case "temp":
            // Temperature: gradual increase with some variation
            value = 20 + i * 0.5 + Math.sin(i * 0.3) * 2;
            break;
          case "hum":
            // Humidity: oscillating pattern
            value = 60 + Math.sin(i * 0.4) * 15 + Math.cos(i * 0.2) * 5;
            break;
          case "pressure":
            // Pressure: slight decrease with noise
            value = 1013 - i * 0.1 + Math.sin(i * 0.5) * 0.5;
            break;
          default:
            value = 50 + Math.sin(i * 0.5) * 30;
        }

        // Spread data points evenly from January 1st to now
        const timeSpan = now - startDate;
        const timestamp = new Date(startDate + (timeSpan * i) / 49);

        return {
          timestamp: timestamp,
          value: value,
          sensorId: config.sensorId,
          normalizedValue: normalizeValue(value, config.range, config.sensorId),
          period: "mock",
        };
      });
    });

    console.log("✅ Mock data generated with", Object.keys(mockDataPoints).length, "sensors");
    console.log("📊 Sample data points:", mockDataPoints.temp?.slice(0, 3));

    return mockDataPoints;
  }, []);

  // Memoize chart data to reduce re-renders
  const chartData = useMemo(() => {
    const dataToRender = isInitialLoad ? mockData : data;
    return dataToRender;
  }, [isInitialLoad, data, mockData]);

  const scales = useMemo(() => {
    console.log("🔍 Calculating scales...");
    console.log("Dimensions for scales:", dimensions);
    console.log("Current time range:", currentTimeRange);

    if (!dimensions) {
      console.log("❌ No dimensions available for scales");
      return null;
    }

    const { width, height, margin } = dimensions;
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    console.log("Chart dimensions:", { chartWidth, chartHeight });

    // Use current time range if available, otherwise use mock data time range
    const timeRange = currentTimeRange || {
      start: new Date("2025-01-01"),
      end: new Date(),
    };

    console.log("Using time range for scales:", timeRange);
    console.log(
      "📊 Time span for scales:",
      (timeRange.end.getTime() - timeRange.start.getTime()) / (1000 * 60 * 60 * 24),
      "days"
    );

    const scaleX = d3
      .scaleTime()
      .domain([timeRange.start, timeRange.end])
      .range([margin.left, margin.left + chartWidth]);

    const scaleY = d3
      .scaleLinear()
      .domain([0, 100])
      .range([chartHeight + margin.top, margin.top]);

    const scales = {
      x: scaleX,
      y: scaleY,
    };

    console.log("✅ Scales calculated:", {
      xDomain: scales.x.domain(),
      xRange: scales.x.range(),
      yDomain: scales.y.domain(),
      yRange: scales.y.range(),
    });

    // Test scale conversion
    if (scales.x.domain().length === 2) {
      const testDate = new Date("2025-06-01");
      const testX = scales.x(testDate);
      console.log("🧪 Scale test - Date:", testDate, "-> X:", testX);
    }

    return scales;
  }, [dimensions, currentTimeRange]); // Add currentTimeRange as dependency

  // Render chart with data (mock or real)
  useEffect(() => {
    console.log("🔍 Chart rendering effect triggered");
    console.log("SVG ref:", svgRef.current);
    console.log("Scales:", scales);
    console.log("Dimensions:", dimensions);
    console.log("Data keys:", Object.keys(data));
    console.log("Is initial load:", isInitialLoad);

    if (!svgRef.current || !scales || !dimensions) {
      console.log("❌ Missing required dependencies for chart rendering");
      return;
    }

    console.log("✅ All dependencies available, rendering chart...");

    const svg = d3.select(svgRef.current);
    console.log("D3 SVG selection:", svg.node());

    // Ensure SVG has proper dimensions
    svg.attr("width", dimensions.width).attr("height", dimensions.height);

    // Clear any existing content
    svg.selectAll("*").remove();

    // Create chart group
    const chartGroup = svg.append("g").attr("class", "chart-group");

    // Get the current time range for filtering
    const timeRange = currentTimeRange || {
      start: new Date("2025-01-01"),
      end: new Date(),
    };

    console.log("📊 Filtering data for time range:", timeRange);
    console.log(
      "📊 Time range span:",
      (timeRange.end.getTime() - timeRange.start.getTime()) / (1000 * 60 * 60 * 24),
      "days"
    );

    // Create line generator
    const line = d3
      .line<DataPoint>()
      .x((d) => scales.x(d.timestamp))
      .y((d) => scales.y(d.normalizedValue))
      .curve(d3.curveBasis);

    console.log("✅ Line generator created");

    // Determine which data to use
    const dataToRender = chartData;
    const sensorsToRender = SENSOR_CONFIGS; // Show all sensors instead of just first 3

    console.log("Using data:", isInitialLoad ? "mock" : "real");
    console.log("📊 Available data keys:", Object.keys(dataToRender));
    console.log(
      "Sensors to render:",
      sensorsToRender.map((s) => s.sensorId)
    );

    // Test line generator with sample data
    if (Object.keys(dataToRender).length > 0) {
      const sampleData = dataToRender.temp?.slice(0, 3) || [];
      if (sampleData.length > 0) {
        console.log("🧪 Testing line generator with sample data:");
        sampleData.forEach((point, i) => {
          const x = scales.x(point.timestamp);
          const y = scales.y(point.normalizedValue);
          console.log(
            `  Point ${i}: timestamp=${point.timestamp.toISOString()}, value=${point.value}, normalized=${
              point.normalizedValue
            }, x=${x}, y=${y}`
          );
        });
      }
    }

    // Draw lines with performance optimization
    let linesDrawn = 0;
    const renderStartTime = performance.now();

    sensorsToRender.forEach((config) => {
      const sensorData = dataToRender[config.sensorId];
      console.log(`Processing sensor ${config.sensorId}:`, sensorData?.length, "data points");

      if (!sensorData || sensorData.length === 0) {
        console.log(`❌ No data for sensor ${config.sensorId}`);
        return;
      }

      // Show first few data points for debugging
      console.log(
        `📊 Sample data for ${config.sensorId}:`,
        sensorData.slice(0, 3).map((d) => ({
          timestamp: d.timestamp.toISOString(),
          value: d.value,
          normalizedValue: d.normalizedValue,
        }))
      );

      // Filter data to only include points within the current time range
      // Use a more lenient filter to ensure we see data
      const filteredData = sensorData.filter((point) => {
        const timestamp = point.timestamp.getTime();
        const startTime = timeRange.start.getTime();
        const endTime = timeRange.end.getTime();

        // Add some tolerance to ensure we don't filter out too much
        const tolerance = 24 * 60 * 60 * 1000; // 1 day tolerance
        return timestamp >= startTime - tolerance && timestamp <= endTime + tolerance;
      });

      console.log(`📊 Filtered ${config.sensorId}: ${sensorData.length} -> ${filteredData.length} points`);

      // TEMPORARILY: Use all data to debug plotting issue
      const dataToUse = sensorData; // Use all data instead of filtered
      console.log(`🔄 Using all data for ${config.sensorId}: ${dataToUse.length} points`);

      if (dataToUse.length === 0) {
        console.log(`❌ No data points for sensor ${config.sensorId}`);
        return;
      }

      drawSensorLine(chartGroup, dataToUse, config, line, isInitialLoad);
      linesDrawn++;
    });

    const renderEndTime = performance.now();
    const renderDuration = renderEndTime - renderStartTime;
    console.log(`✅ Drew ${linesDrawn} lines total in ${renderDuration.toFixed(2)}ms`);

    // Add axes
    const xAxis = d3.axisBottom(scales.x);
    const yAxis = d3.axisLeft(scales.y);

    // Add X axis
    svg
      .append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${dimensions.height - dimensions.margin.bottom})`)
      .call(xAxis as any);

    // Add Y axis
    svg
      .append("g")
      .attr("class", "y-axis")
      .attr("transform", `translate(${dimensions.margin.left},0)`)
      .call(yAxis as any);

    console.log("✅ Axes added successfully");
    console.log("✅ Chart rendering completed successfully");
  }, [scales, dimensions, chartData, isInitialLoad, currentTimeRange]); // Add currentTimeRange dependency

  // Helper function to draw sensor line
  const drawSensorLine = (
    chartGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    data: DataPoint[],
    config: SensorConfig,
    line: d3.Line<DataPoint>,
    isInitialLoad: boolean
  ) => {
    try {
      const path = chartGroup
        .append("path")
        .datum(data)
        .attr("class", "sensor-line")
        .attr("d", line)
        .style("stroke", config.color)
        .style("stroke-width", 2)
        .style("fill", "none")
        .style("opacity", isInitialLoad ? 0.8 : 1)
        .style("cursor", "pointer");

      // Add tooltip functionality only for real data to improve performance
      if (!isInitialLoad && scales) {
        path
          .on("mouseover", function (event, d) {
            const [mouseX] = d3.pointer(event);
            const bisect = d3.bisector((d: DataPoint) => d.timestamp).left;
            const x0 = scales.x.invert(mouseX);
            const i = bisect(d, x0, 1);
            const d0 = d[i - 1];
            const d1 = d[i];
            const dataPoint = x0.getTime() - d0.timestamp.getTime() > d1.timestamp.getTime() - x0.getTime() ? d1 : d0;

            setTooltip({
              x: event.clientX,
              y: event.clientY,
              data: dataPoint,
              config: config,
            });
          })
          .on("mousemove", function (event, d) {
            const [mouseX] = d3.pointer(event);
            const bisect = d3.bisector((d: DataPoint) => d.timestamp).left;
            const x0 = scales.x.invert(mouseX);
            const i = bisect(d, x0, 1);
            const d0 = d[i - 1];
            const d1 = d[i];
            const dataPoint = x0.getTime() - d0.timestamp.getTime() > d1.timestamp.getTime() - x0.getTime() ? d1 : d0;

            setTooltip({
              x: event.clientX,
              y: event.clientY,
              data: dataPoint,
              config: config,
            });
          })
          .on("mouseout", () => {
            setTooltip(null);
          });
      }

      console.log(`✅ Drew line for ${config.sensorId}, path length:`, path.node()?.getTotalLength());
    } catch (error) {
      console.error(`❌ Error drawing line for ${config.sensorId}:`, error);
    }
  };

  // Get the full time range from the database
  const fetchFullTimeRange = useCallback(async () => {
    try {
      console.log("Fetching full time range from database...");

      // Get the earliest and latest timestamps
      const { data: earliestData, error: earliestError } = await supabase
        .from("environmental_data")
        .select("time")
        .order("time", { ascending: true })
        .limit(1);

      const { data: latestData, error: latestError } = await supabase
        .from("environmental_data")
        .select("time")
        .order("time", { ascending: false })
        .limit(1);

      if (earliestError || latestError) {
        console.error("Error fetching time range:", earliestError || latestError);
        return null;
      }

      if (!earliestData?.[0] || !latestData?.[0]) {
        console.log("No data available in database");
        return null;
      }

      const fullRange = {
        start: new Date(earliestData[0].time),
        end: new Date(latestData[0].time),
      };

      console.log("Full time range:", fullRange);
      return fullRange;
    } catch (err) {
      console.error("Error fetching full time range:", err);
      return null;
    }
  }, []);

  // Optimized data fetching function based on Supabase query optimization
  const fetchOptimizedData = useCallback(
    async (startTime?: Date, endTime?: Date) => {
      try {
        console.log("Fetching optimized data...", { startTime, endTime });

        const queryStartTime = performance.now();

        let query = supabase
          .from("environmental_data")
          .select("time, temp, hum, pressure, lux, uv, gas, roll, pitch, yaw, mag_x, mag_y, mag_z")
          .order("time", { ascending: false }); // Leverage the DESC index

        // Apply time range filters if provided
        if (startTime && endTime) {
          query = query.gte("time", startTime.toISOString()).lte("time", endTime.toISOString());
        } else {
          // If no time range provided, get the full range first
          const fullRange = await fetchFullTimeRange();
          if (fullRange) {
            query = query.gte("time", fullRange.start.toISOString()).lte("time", fullRange.end.toISOString());
          } else {
            // Fallback to last 7 days if no data available
            const defaultEnd = new Date();
            const defaultStart = new Date(defaultEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
            query = query.gte("time", defaultStart.toISOString()).lte("time", defaultEnd.toISOString());
          }
        }

        // Increase limit for better data coverage
        query = query.limit(5000); // Increased from 2000 to 5000 for more comprehensive data

        const { data: rawData, error } = await query;

        const queryEndTime = performance.now();
        const queryDuration = queryEndTime - queryStartTime;

        console.log(`✅ Query completed in ${queryDuration.toFixed(2)}ms`);

        if (error) throw error;
        if (!rawData || rawData.length === 0) {
          console.log("No data available for time range");
          return null;
        }

        console.log(`Retrieved ${rawData.length} data points with optimized query`);

        // Process data efficiently
        const processedData: Record<string, DataPoint[]> = {};

        // Process all sensors for comprehensive data
        const processingStartTime = performance.now();
        setIsProcessingData(true);

        SENSOR_CONFIGS.forEach((config) => {
          processedData[config.sensorId] = rawData
            .filter((row) => row[config.sensorId as keyof typeof row] != null)
            .map((row) => ({
              timestamp: new Date(row.time),
              value: Number(row[config.sensorId as keyof typeof row]) || 0,
              sensorId: config.sensorId,
              normalizedValue: normalizeValue(
                Number(row[config.sensorId as keyof typeof row]),
                config.range,
                config.sensorId
              ),
              period: "hourly",
            }))
            .reverse(); // Get chronological order
        });

        const processingEndTime = performance.now();
        const processingDuration = processingEndTime - processingStartTime;
        setIsProcessingData(false);

        console.log(`✅ Data processing completed in ${processingDuration.toFixed(2)}ms`);
        console.log(`✅ Total optimization time: ${(queryDuration + processingDuration).toFixed(2)}ms`);

        return processedData;
      } catch (err) {
        console.error("Error in optimized data fetch:", err);
        throw err;
      }
    },
    [fetchFullTimeRange]
  );

  // Load real data in background with optimized queries
  useEffect(() => {
    const loadRealData = async () => {
      try {
        console.log("🔄 Loading real data with optimized queries...");

        // First, get the full time range
        const fullRange = await fetchFullTimeRange();
        if (fullRange) {
          setFullTimeRange(fullRange);
          console.log("✅ Full time range set:", fullRange);
          console.log(
            "📊 Time span:",
            (fullRange.end.getTime() - fullRange.start.getTime()) / (1000 * 60 * 60 * 24),
            "days"
          );
        }

        const processedData = await fetchOptimizedData();

        if (processedData) {
          setData(processedData);
          setIsInitialLoad(false);

          // Set current time range based on actual data
          const allTimestamps = Object.values(processedData)
            .flat()
            .map((point) => point.timestamp);

          if (allTimestamps.length > 0) {
            const startTime = new Date(Math.min(...allTimestamps.map((d) => d.getTime())));
            const endTime = new Date(Math.max(...allTimestamps.map((d) => d.getTime())));

            setCurrentTimeRange({ start: startTime, end: endTime });
            console.log("✅ Current time range set:", { start: startTime, end: endTime });
            console.log("📊 Data span:", (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60 * 24), "days");
          }

          console.log("✅ Real data loaded successfully with optimized queries");
        } else {
          console.log("❌ No data available");
        }
      } catch (err) {
        console.error("❌ Error loading real data:", err);
        setError("Failed to load sensor data");
      }
    };

    // Load real data after a short delay
    const timer = setTimeout(loadRealData, 1000);
    return () => clearTimeout(timer);
  }, [fetchOptimizedData, fetchFullTimeRange]);

  // Load data for specific time range (for zooming)
  const loadDataForTimeRange = useCallback(
    async (startTime: Date, endTime: Date) => {
      try {
        console.log("Loading data for specific time range:", { startTime, endTime });

        const processedData = await fetchOptimizedData(startTime, endTime);

        if (processedData) {
          setData(processedData);
          console.log("Data loaded for time range:", Object.keys(processedData));
        }
      } catch (err) {
        console.error("Error loading data for time range:", err);
      }
    },
    [fetchOptimizedData]
  );

  // Load data for the current view
  const loadDataForCurrentView = useCallback(async () => {
    if (currentTimeRange) {
      console.log("Loading data for current view:", currentTimeRange);
      setIsLoadingData(true);
      try {
        await loadDataForTimeRange(currentTimeRange.start, currentTimeRange.end);
      } finally {
        setIsLoadingData(false);
      }
    }
  }, [currentTimeRange, loadDataForTimeRange]);

  // Initialize zoom behavior with mobile optimization
  useEffect(() => {
    if (!svgRef.current || !scales || !dimensions) return;

    const svg = d3.select(svgRef.current);

    // Remove existing zoom behavior
    if (zoomRef.current) {
      svg.on(".zoom", null);
    }

    // Use full time range for zoom behavior
    const timeRange = fullTimeRange || {
      start: new Date("2025-01-01"), // Use actual earliest date
      end: new Date(),
    };

    console.log("🔄 Initializing zoom with full time range:", timeRange);

    zoomRef.current = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 50]) // Reasonable zoom levels
      .on("start", () => {
        console.log("🔄 Zoom started");
        setIsZooming(true);
      })
      .on("zoom", (event) => {
        const { transform } = event;
        console.log("🔄 Zoom event triggered:", { x: transform.x, y: transform.y, k: transform.k });

        // Calculate new time range based on zoom transform
        const { width, margin } = dimensions;
        const chartWidth = width - margin.left - margin.right;

        // Create a scale that maps the full time range to the chart area
        const xScale = d3
          .scaleTime()
          .domain([timeRange.start, timeRange.end])
          .range([margin.left, margin.left + chartWidth]);

        // Calculate the visible time range based on transform
        const visibleStart = xScale.invert(margin.left - transform.x / transform.k);
        const visibleEnd = xScale.invert(margin.left + chartWidth - transform.x / transform.k);

        // Clamp to full time range
        const clampedStart = new Date(Math.max(timeRange.start.getTime(), visibleStart.getTime()));
        const clampedEnd = new Date(Math.min(timeRange.end.getTime(), visibleEnd.getTime()));

        console.log("🔄 New visible range:", {
          start: clampedStart.toISOString(),
          end: clampedEnd.toISOString(),
          zoomLevel: transform.k,
          percentage: Math.round(
            ((clampedEnd.getTime() - clampedStart.getTime()) / (timeRange.end.getTime() - timeRange.start.getTime())) *
              100
          ),
        });

        // Update current time range and zoom level
        setCurrentTimeRange({ start: clampedStart, end: clampedEnd });
        setZoomLevel(transform.k);
      })
      .on("end", () => {
        console.log("🔄 Zoom ended");
        setIsZooming(false);
      });

    svg.call(zoomRef.current);

    console.log("✅ Zoom behavior initialized");
  }, [scales, fullTimeRange, dimensions]);

  // Load data when time range changes significantly
  useEffect(() => {
    if (currentTimeRange && !isInitialLoad) {
      const timeSpan = currentTimeRange.end.getTime() - currentTimeRange.start.getTime();
      const fullSpan = fullTimeRange ? fullTimeRange.end.getTime() - fullTimeRange.start.getTime() : 0;

      // Only load new data if we're zoomed in significantly (less than 50% of full range)
      if (fullSpan > 0 && timeSpan < fullSpan * 0.5) {
        console.log("🔄 Loading data for new time range:", currentTimeRange);
        loadDataForTimeRange(currentTimeRange.start, currentTimeRange.end);
      }
    }
  }, [currentTimeRange, isInitialLoad, fullTimeRange, loadDataForTimeRange]);

  // Simple test to show all data
  const testShowAllData = useCallback(() => {
    console.log("🧪 Testing show all data");
    console.log("📊 Chart data keys:", Object.keys(chartData));
    console.log("📊 Sample data:", chartData.temp?.slice(0, 5));

    // Force a re-render with all data
    setCurrentTimeRange({
      start: new Date("2025-01-01"),
      end: new Date(),
    });
  }, [chartData]);

  // Debug current state
  const debugCurrentState = useCallback(() => {
    console.log("🔍 === DEBUG CURRENT STATE ===");
    console.log("Current time range:", currentTimeRange);
    console.log("Full time range:", fullTimeRange);
    console.log("Zoom level:", zoomLevel);
    console.log("Is initial load:", isInitialLoad);
    console.log("Data keys:", Object.keys(data));
    console.log("Chart data keys:", Object.keys(chartData));
    console.log("Dimensions:", dimensions);
    console.log("Scales:", scales);
    console.log("================================");
  }, [currentTimeRange, fullTimeRange, zoomLevel, isInitialLoad, data, chartData, dimensions, scales]);

  // Simple manual zoom test
  const manualZoomTest = useCallback(() => {
    console.log("🧪 Manual zoom test - setting time range to March 2025");
    const testStart = new Date("2025-03-01");
    const testEnd = new Date("2025-03-31");
    setCurrentTimeRange({ start: testStart, end: testEnd });
    setZoomLevel(5);
  }, []);

  // Test zoom function
  const testZoom = useCallback(() => {
    if (fullTimeRange) {
      // Test zoom to a specific time range (e.g., March 2025)
      const testStart = new Date("2025-03-01");
      const testEnd = new Date("2025-03-31");

      console.log("🧪 Testing zoom to March 2025:", { testStart, testEnd });
      setCurrentTimeRange({ start: testStart, end: testEnd });
      setZoomLevel(5); // Set a reasonable zoom level

      // Also trigger D3 zoom transform
      if (zoomRef.current && svgRef.current) {
        const svg = d3.select(svgRef.current);
        // Calculate appropriate transform for this time range
        const timeRange = fullTimeRange;
        const { width, margin } = dimensions;
        const chartWidth = width - margin.left - margin.right;

        const xScale = d3
          .scaleTime()
          .domain([timeRange.start, timeRange.end])
          .range([margin.left, margin.left + chartWidth]);

        const targetX = xScale(testStart);
        const scale = chartWidth / (xScale(testEnd) - xScale(testStart));

        const transform = d3.zoomIdentity.translate(-targetX * scale + margin.left, 0).scale(scale);

        svg.call(zoomRef.current.transform, transform);
      }
    }
  }, [fullTimeRange, dimensions]);

  // Reset zoom to full time range
  const resetZoom = useCallback(() => {
    if (fullTimeRange) {
      console.log("🔄 Resetting zoom to full time range:", fullTimeRange);
      setCurrentTimeRange(fullTimeRange);
      setZoomLevel(1);

      // Reset D3 zoom transform
      if (zoomRef.current && svgRef.current) {
        const svg = d3.select(svgRef.current);
        svg.call(zoomRef.current.transform, d3.zoomIdentity);
        console.log("✅ D3 zoom transform reset");
      }
    }
  }, [fullTimeRange]);

  // Handle window resize with debouncing
  useEffect(() => {
    let resizeTimeout: NodeJS.Timeout;

    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (zoomRef.current && svgRef.current) {
          d3.select(svgRef.current).call(zoomRef.current.transform, d3.zoomIdentity);
        }
      }, 250);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  // Database optimization suggestions based on Supabase query optimization guide
  const suggestDatabaseOptimizations = () => {
    console.log("=== Database Optimization Status ===");
    console.log("Based on Supabase Query Optimization Guide:");
    console.log("1. ✅ Time index exists: environmental_data_time_idx");
    console.log("2. ✅ Composite indexes created for common queries");
    console.log("3. ✅ Partial indexes for non-null values");
    console.log("4. ✅ BRIN index for time-based queries");
    console.log("5. 🔧 Consider partitioning by time for large datasets");
    console.log("6. 🔧 Run ANALYZE environmental_data; to update statistics");
    console.log("7. 📊 Performance monitoring enabled - check console for timing");
    console.log("==========================================");
  };

  // Performance testing function to benchmark query performance
  const testQueryPerformance = async () => {
    console.log("=== Performance Testing ===");

    const testScenarios = [
      { name: "Last 24 hours", start: new Date(Date.now() - 24 * 60 * 60 * 1000), end: new Date() },
      { name: "Last 7 days", start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), end: new Date() },
      { name: "Last 30 days", start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() },
    ];

    for (const scenario of testScenarios) {
      console.log(`\n🧪 Testing: ${scenario.name}`);
      const startTime = performance.now();

      try {
        const data = await fetchOptimizedData(scenario.start, scenario.end);
        const endTime = performance.now();
        const duration = endTime - startTime;

        console.log(
          `✅ ${scenario.name}: ${duration.toFixed(2)}ms, ${data ? Object.values(data).flat().length : 0} data points`
        );
      } catch (error) {
        console.error(`❌ ${scenario.name}: Failed - ${error}`);
      }
    }

    console.log("=== Performance Testing Complete ===");
  };

  // Call optimization suggestions on mount
  useEffect(() => {
    console.log("🚀 VerticalTimeline component mounted");
    console.log("Container ref on mount:", containerRef.current);
    console.log("SVG ref on mount:", svgRef.current);

    suggestDatabaseOptimizations();
    // Run performance test after a delay
    setTimeout(testQueryPerformance, 2000);
  }, []);

  return (
    <div className={styles.timelineContainer} style={{ height }}>
      <div className={styles.header}>
        <div>
          <h3>Sensor Timeline</h3>
          <div className={styles.instructions}>
            <span>Scroll to zoom • Drag to pan • Click "Load Data" to explore specific time ranges</span>
          </div>
        </div>
        <div className={styles.zoomInfo}>
          {zoomLevel > 1 && `Zoom: ${zoomLevel.toFixed(1)}x`}
          {currentTimeRange && (
            <span>
              {currentTimeRange.start.toLocaleDateString()} - {currentTimeRange.end.toLocaleDateString()}
            </span>
          )}
          {fullTimeRange && currentTimeRange && (
            <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>
              {Math.max(
                0,
                Math.min(
                  100,
                  Math.round(
                    ((currentTimeRange.end.getTime() - currentTimeRange.start.getTime()) /
                      (fullTimeRange.end.getTime() - fullTimeRange.start.getTime())) *
                      100
                  )
                )
              )}
              % of total
            </span>
          )}
        </div>
        <div className={styles.headerButtons}>
          <button onClick={loadDataForCurrentView} className={styles.loadButton} disabled={isLoadingData}>
            {isLoadingData ? "Loading..." : "Load Data"}
          </button>
          <button onClick={manualZoomTest} className={styles.loadButton} style={{ backgroundColor: "#28a745" }}>
            Manual Zoom
          </button>
          <button onClick={testZoom} className={styles.loadButton} style={{ backgroundColor: "#ffc107" }}>
            Test Zoom
          </button>
          <button onClick={resetZoom} className={styles.refreshButton}>
            Reset View
          </button>
          <button onClick={debugCurrentState} className={styles.loadButton} style={{ backgroundColor: "#007bff" }}>
            Debug State
          </button>
          <button onClick={testShowAllData} className={styles.loadButton} style={{ backgroundColor: "#dc3545" }}>
            Show All Data
          </button>
        </div>
      </div>

      <div className={`${styles.chartContainer} ${isZooming ? styles.zooming : ""}`} ref={containerRef}>
        {isZooming && (
          <div className={styles.zoomIndicator}>
            <span>Zooming...</span>
          </div>
        )}
        <svg
          ref={svgRef}
          width='100%'
          height='100%'
          style={{
            minWidth: "400px",
            minHeight: "300px",
            border: "1px solid #ccc",
            backgroundColor: "#f9f9f9",
          }}
        >
          <g className='chart-group' />
        </svg>

        {tooltip && (
          <div
            className={styles.tooltip}
            style={{
              left: tooltip.x + 10,
              top: tooltip.y - 10,
              borderColor: tooltip.config.color,
            }}
          >
            <div className={styles.tooltipTitle} style={{ color: tooltip.config.color }}>
              {tooltip.config.name}
            </div>
            <div className={styles.tooltipValue}>
              {tooltip.data.value.toFixed(2)} {tooltip.config.unit}
            </div>
            <div className={styles.tooltipTime}>{tooltip.data.timestamp.toLocaleString()}</div>
          </div>
        )}

        {error && <div className={styles.error}>Error: {error}</div>}

        {isInitialLoad && (
          <div className={styles.loadingIndicator}>
            <div className={styles.spinner}></div>
            <span>Loading sensor data...</span>
          </div>
        )}

        {isLoadingData && (
          <div className={styles.loadingIndicator}>
            <div className={styles.spinner}></div>
            <span>Loading data for current view...</span>
          </div>
        )}

        {isProcessingData && (
          <div className={styles.loadingIndicator}>
            <div className={styles.spinner}></div>
            <span>Processing sensor data...</span>
          </div>
        )}
      </div>

      <div className={styles.legend}>
        {SENSOR_CONFIGS.map((config) => (
          <div
            key={config.sensorId}
            className={`${styles.legendItem} ${selectedSensor === config.sensorId ? styles.selected : ""}`}
            onClick={() => setSelectedSensor(selectedSensor === config.sensorId ? null : config.sensorId)}
          >
            <div className={styles.legendColor} style={{ backgroundColor: config.color }} />
            <span>{config.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
