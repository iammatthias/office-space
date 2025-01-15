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

  useEffect(() => {
    async function fetchData() {
      const url = `https://image-api.office.pure---internet.com/?type=${timePeriod}&sensor=${sensor}`;

      try {
        const response = await fetch(url, {
          method: "GET",
          mode: "cors", // Explicitly enable CORS
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const path = data[`latest_${sensor}_${timePeriod}`]?.value?.path;

        console.log(data);

        if (!path) {
          throw new Error("Image path not found in response");
        }

        setImagePath(path);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to fetch data"));
      }
    }

    fetchData();
  }, [sensor, timePeriod]);

  if (error) return <div className={styles.error}>Error loading data: {error.message}</div>;
  if (!imagePath) return <div className={styles.loading}>Loading...</div>;

  const imageUrl = `https://bucket.office.pure---internet.com/${imagePath}`;
  const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(imageUrl)}&w=1200&fit=contain&output=webp`;

  return <img src={proxyUrl} alt={`${sensor} visualization`} className={styles.image} loading='lazy' />;
}
