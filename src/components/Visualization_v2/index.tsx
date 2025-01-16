import { useState, useEffect } from "react";
import styles from "./Visualization_v2.module.css";

type TimePeriod = "daily" | "hourly" | "minute";

interface VisualizationProps {
  sensor: "gas" | "humidity" | "light" | "pressure" | "temperature" | "uv";
  timePeriod?: TimePeriod;
}

export default function Visualization_v2({ sensor, timePeriod = "minute" }: VisualizationProps) {
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [currentTimePeriod, setCurrentTimePeriod] = useState<TimePeriod>(timePeriod);

  useEffect(() => {
    async function fetchData(period: TimePeriod) {
      const url = `https://image-api.office.pure---internet.com/?type=${period}&sensor=${sensor}`;

      try {
        const response = await fetch(url, {
          method: "GET",
          mode: "cors",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const path = data[`latest_${sensor}_${period}`]?.value?.path;

        if (!path) {
          throw new Error("Image path not found in response");
        }

        setImagePath(path);
        setError(null);
      } catch (err) {
        if (period === "minute") {
          console.log("Minute data not available, falling back to daily");
          setCurrentTimePeriod("daily");
          return fetchData("daily");
        }
        setError(err instanceof Error ? err : new Error("Failed to fetch data"));
      }
    }

    fetchData(currentTimePeriod);
  }, [sensor, currentTimePeriod]);

  if (error) return <div className={styles.error}>Error loading data: {error.message}</div>;
  if (!imagePath) return <div className={styles.loading}>Loading...</div>;

  const imageUrl = `https://bucket.office.pure---internet.com/${imagePath}`;
  const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(imageUrl)}&w=800&fit=contain&output=webp`;

  return <img src={proxyUrl} alt={`${sensor} visualization`} className={styles.image} loading='lazy' />;
}
