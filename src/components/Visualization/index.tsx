import { useState, useEffect } from "react";
import styles from "./Visualization.module.css";

type TimePeriod = "daily" | "hourly" | "cumulative";

interface VisualizationProps {
  sensor: "gas" | "humidity" | "light" | "pressure" | "temperature" | "uv";
}

export default function Visualization_v2({ sensor }: VisualizationProps) {
  const [cid, setCID] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [currentTimePeriod, setCurrentTimePeriod] = useState<TimePeriod>("cumulative");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function fetchData(period: TimePeriod) {
      setIsLoading(true);
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
        const sensorData = data[`${sensor}:${period}:latest`];

        if (!sensorData?.ipfs_url) {
          throw new Error("IPFS URL not found in response");
        }

        // Extract CID from ipfs:// URL (e.g., "ipfs://bafkreie3lwdbnx4rysfqiul5a62v62gft74fwjwxfcp6qmzxrvaifeszhq")
        const ipfsUrl = sensorData.ipfs_url;
        const extractedCID = ipfsUrl.replace("ipfs://", "");

        if (!extractedCID) {
          throw new Error("Invalid IPFS URL format");
        }

        setCID(extractedCID);
        setError(null);
      } catch (err) {
        if (period === "cumulative") {
          console.log("Cumulative data not available, falling back to daily");
          setCurrentTimePeriod("daily");
          return fetchData("daily");
        }
        setError(err instanceof Error ? err : new Error("Failed to fetch data"));
      } finally {
        setIsLoading(false);
      }
    }

    fetchData(currentTimePeriod);
  }, [sensor, currentTimePeriod]);

  const handleTimePeriodChange = (period: TimePeriod) => {
    setCurrentTimePeriod(period);
  };

  if (error) return <div className={styles.error}>Error loading data: {error.message}</div>;
  if (!cid && !isLoading) return <div className={styles.loading}>Loading...</div>;

  const imageUrl = `https://cdn.iammatthias.com/ipfs/${cid}?img-width=800&img-height=600&img-fit=contain&img-format=webp&img-quality=85&img-dpr=2&img-onerror=redirect`;

  return (
    <div className={styles.container}>
      {isLoading ? (
        <div className={styles.loading}>Loading...</div>
      ) : (
        <img src={imageUrl} alt={`${sensor} visualization`} className={styles.image} loading='lazy' />
      )}
      <div className={styles.toggleContainer}>
        <button
          className={`${styles.toggleButton} ${currentTimePeriod === "daily" ? styles.active : ""}`}
          onClick={() => handleTimePeriodChange("daily")}
          disabled={isLoading}
        >
          Daily
        </button>
        <button
          className={`${styles.toggleButton} ${currentTimePeriod === "hourly" ? styles.active : ""}`}
          onClick={() => handleTimePeriodChange("hourly")}
          disabled={isLoading}
        >
          Hourly
        </button>
        <button
          className={`${styles.toggleButton} ${currentTimePeriod === "cumulative" ? styles.active : ""}`}
          onClick={() => handleTimePeriodChange("cumulative")}
          disabled={isLoading}
        >
          Cumulative
        </button>
      </div>
    </div>
  );
}
