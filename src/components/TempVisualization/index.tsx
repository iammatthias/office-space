import { Canvas } from "@react-three/fiber";
import { useEnvironmentalData } from "../../hooks/useEnvironmentalData";
import { getColorForTemperature, organizeDataByDay, getTemperatureRange } from "./utils";
import styles from "./TempVisualization.module.css";
import { useMemo } from "react";
import * as THREE from "three";

const MINUTES_IN_DAY = 1440;
const CANVAS_HEIGHT = 365 * 5;

const TempVisualization = () => {
  const { data, loading, error } = useEnvironmentalData("temp");

  const geometry = useMemo(() => {
    if (!data.length) return null;

    const days = organizeDataByDay(data);
    const numDays = Math.min(days.length, 365);
    const rowHeight = CANVAS_HEIGHT / numDays;

    // Calculate temperature range for the entire dataset
    const { min: minTemp, max: maxTemp } = getTemperatureRange(data);

    const vertices: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    days.slice(0, numDays).forEach((dayData, dayIndex) => {
      // Calculate y position: newest data at bottom (CANVAS_HEIGHT) and older data towards top
      const y = CANVAS_HEIGHT - (dayIndex + 1) * rowHeight;
      const minuteMap = new Map<number, number>();

      dayData.forEach((entry) => {
        const minutes = entry.time.getHours() * 60 + entry.time.getMinutes();
        minuteMap.set(minutes, entry.value);
      });

      // Find the first and last minutes with data for this day
      let firstMinute = MINUTES_IN_DAY;
      let lastMinute = 0;
      minuteMap.forEach((_, minute) => {
        firstMinute = Math.min(firstMinute, minute);
        lastMinute = Math.max(lastMinute, minute);
      });

      for (let minute = 0; minute < MINUTES_IN_DAY; minute++) {
        vertices.push(minute, y, 0, minute + 1, y, 0, minute + 1, y + rowHeight, 0, minute, y + rowHeight, 0);

        let temp: number;
        if (minuteMap.has(minute)) {
          temp = minuteMap.get(minute)!;
        } else {
          // Find nearest known values before and after current minute
          let beforeMinute = minute - 1;
          let afterMinute = minute + 1;
          let beforeTemp: number | undefined;
          let afterTemp: number | undefined;

          while (beforeMinute >= firstMinute) {
            if (minuteMap.has(beforeMinute)) {
              beforeTemp = minuteMap.get(beforeMinute);
              break;
            }
            beforeMinute--;
          }

          while (afterMinute <= lastMinute) {
            if (minuteMap.has(afterMinute)) {
              afterTemp = minuteMap.get(afterMinute);
              break;
            }
            afterMinute++;
          }

          if (beforeTemp !== undefined && afterTemp !== undefined) {
            // Interpolate between known values
            const range = afterMinute - beforeMinute;
            const weight = (minute - beforeMinute) / range;
            temp = beforeTemp + (afterTemp - beforeTemp) * weight;
          } else if (beforeTemp !== undefined) {
            temp = beforeTemp;
          } else if (afterTemp !== undefined) {
            temp = afterTemp;
          } else {
            // If no data available for this day, use the average temperature
            temp = (minTemp + maxTemp) / 2;
          }
        }

        const color = new THREE.Color(getColorForTemperature(temp, minTemp, maxTemp));
        for (let i = 0; i < 4; i++) colors.push(color.r, color.g, color.b);

        const vertexIndex = (dayIndex * MINUTES_IN_DAY + minute) * 4;
        indices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2, vertexIndex, vertexIndex + 2, vertexIndex + 3);
      }
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);

    return geometry;
  }, [data]);

  if (loading) return <div className={styles.loadingContainer}>Loading...</div>;
  if (error) return <div className={styles.errorContainer}>Error: {error.message}</div>;

  return (
    <section className='grid-item'>
      <div className={styles.wrapper}>
        <h2 className={styles.title}>Temperature</h2>
        <div className={styles.container}>
          <Canvas
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
            orthographic
            camera={{
              position: [0, 0, 1],
              left: 0,
              right: MINUTES_IN_DAY,
              top: CANVAS_HEIGHT,
              bottom: 0,
              near: 0.1,
              far: 1000,
              zoom: 1,
            }}
          >
            {geometry && (
              <mesh>
                <primitive object={geometry} attach='geometry' />
                <meshBasicMaterial vertexColors side={THREE.DoubleSide} transparent />
              </mesh>
            )}
          </Canvas>
        </div>
      </div>
    </section>
  );
};

export default TempVisualization;
