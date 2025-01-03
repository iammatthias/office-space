import { useRef, useEffect } from "react";
import * as d3 from "d3";
import styles from "./LineChart.module.css";
import useResizeObserver from "../../lib/useResizeObserver";

interface DataPoint {
  time: string;
  [key: string]: any;
}

interface LineChartProps {
  data: DataPoint[];
  sensor: string;
  aspectRatio?: number;
  isCelsius?: boolean;
}

export const LineChart = ({
  data,
  sensor,
  aspectRatio = 2, // width:height ratio
  isCelsius = true,
}: LineChartProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dimensions = useResizeObserver(containerRef);

  useEffect(() => {
    if (!data.length || !svgRef.current || !dimensions) return;

    const margin = { top: 30, right: 60, bottom: 40, left: 60 };
    const { width: containerWidth } = dimensions;
    const width = containerWidth - margin.left - margin.right;
    const height = containerWidth / aspectRatio - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Create chart group
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleTime()
      .domain(d3.extent(data, (d) => new Date(d.time)) as [Date, Date])
      .range([0, width]);

    const y = d3
      .scaleLinear()
      .domain(
        (() => {
          // Get the base domain in Celsius
          const [min, max] = d3.extent(data, (d) => d[sensor]) as [number, number];
          // If showing Fahrenheit, convert the domain
          if (sensor === "temp" && !isCelsius) {
            return [min * 1.8 + 32, max * 1.8 + 32];
          }
          return [min, max];
        })()
      )
      .nice()
      .range([height, 0]);

    const line = d3
      .line<DataPoint>()
      .x((d) => x(new Date(d.time)))
      .y((d) => {
        const value = d[sensor];
        return y(sensor === "temp" && !isCelsius ? value * 1.8 + 32 : value);
      });

    // Add X axis with formatted ticks
    g.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(
        d3
          .axisBottom(x)
          .ticks(5)
          .tickFormat((d) => d3.timeFormat("%H:%M:%S")(d as Date))
      )
      .transition()
      .duration(750)
      .call((g) => g.select(".domain").attr("stroke-opacity", 0.2))
      .call((g) => g.selectAll(".tick line").attr("stroke-opacity", 0.2));

    // Add Y axis with formatted ticks
    g.append("g")
      .call(
        d3
          .axisLeft(y)
          .ticks(5)
          .tickFormat((d) => formatValue(sensor === "temp" && !isCelsius ? ((d as number) - 32) / 1.8 : (d as number)))
      )
      .transition()
      .duration(750)
      .call((g) => g.select(".domain").attr("stroke-opacity", 0.2))
      .call((g) => g.selectAll(".tick line").attr("stroke-opacity", 0.2));

    // Add horizontal grid lines with transition
    const grid = g
      .append("g")
      .attr("class", styles.grid)
      .selectAll("line")
      .data(y.ticks(5))
      .join("line")
      .attr("x1", 0)
      .attr("x2", width);

    grid
      .transition()
      .duration(750)
      .attr("y1", (d) => y(d))
      .attr("y2", (d) => y(d));

    // Add the line with transition
    g.append("path").datum(data).attr("class", styles.line).transition().duration(750).attr("d", line);

    // Define area generator
    const area = d3
      .area<DataPoint>()
      .x((d) => x(new Date(d.time)))
      .y0(height)
      .y1((d) => {
        const value = d[sensor];
        return y(sensor === "temp" && !isCelsius ? value * 1.8 + 32 : value);
      });

    // Add the area with transition
    g.append("path").datum(data).attr("class", styles.area).transition().duration(750).attr("d", area);

    // Add title and units
    g.append("text")
      .attr("class", styles.title)
      .attr("x", width / 2)
      .attr("y", -margin.top / 2)
      .attr("text-anchor", "middle")
      .text(`${formatSensorName(sensor)} (${getYAxisLabel()})`);

    // Update SVG dimensions
    svg
      .attr("width", containerWidth)
      .attr("height", containerWidth / aspectRatio)
      .attr("viewBox", `0 0 ${containerWidth} ${containerWidth / aspectRatio}`);
  }, [data, sensor, dimensions, aspectRatio, isCelsius]);

  const formatValue = (value: number) => {
    if (sensor === "temp" && !isCelsius) {
      return (value * 1.8 + 32).toFixed(1);
    }
    return value.toFixed(1);
  };

  const getYAxisLabel = () => {
    const units: Record<string, string> = {
      temp: isCelsius ? "°C" : "°F",
      hum: "%",
      pressure: "hPa",
      lux: "lux",
      accel_x: "m/s²",
      accel_y: "m/s²",
      accel_z: "m/s²",
    };
    return units[sensor] || "";
  };

  return (
    <div ref={containerRef} className={styles.container}>
      <svg ref={svgRef} className={styles.svg} />
    </div>
  );
};

const formatSensorName = (sensor: string): string => {
  return sensor
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};
