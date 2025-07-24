import { useState, useEffect, useCallback, useRef } from "react";
import styles from "./Visualization.module.css";

type TimePeriod = "daily" | "hourly" | "cumulative";

interface VisualizationProps {
  sensor: "gas" | "humidity" | "light" | "pressure" | "temperature" | "uv";
}

interface ImageData {
  cid: string | null;
  isLoading: boolean;
  error: Error | null;
  isPreloaded: boolean;
  imageElement: HTMLImageElement | null;
  isImageLoaded: boolean;
}

interface PreloadState {
  daily: ImageData;
  hourly: ImageData;
  cumulative: ImageData;
}

export default function Visualization_v2({ sensor }: VisualizationProps) {
  const [currentTimePeriod, setCurrentTimePeriod] = useState<TimePeriod>("daily");
  const [preloadState, setPreloadState] = useState<PreloadState>({
    daily: { cid: null, isLoading: false, error: null, isPreloaded: false, imageElement: null, isImageLoaded: false },
    hourly: { cid: null, isLoading: false, error: null, isPreloaded: false, imageElement: null, isImageLoaded: false },
    cumulative: {
      cid: null,
      isLoading: false,
      error: null,
      isPreloaded: false,
      imageElement: null,
      isImageLoaded: false,
    },
  });

  const preloadedImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const imageCacheRef = useRef<Map<string, string>>(new Map());

  const createImageUrl = useCallback((cid: string) => {
    return `https://cdn.iammatthias.com/ipfs/${cid}?img-width=600&img-fit=contain&img-format=webp&img-quality=85&img-dpr=2&img-onerror=redirect`;
  }, []);

  const preloadImage = useCallback(
    (cid: string, period: TimePeriod) => {
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.loading = "eager"; // Force eager loading for preloaded images
        img.decoding = "async"; // Optimize decoding

        img.onload = () => {
          preloadedImagesRef.current.set(`${period}-${cid}`, img);
          imageCacheRef.current.set(`${period}-${cid}`, img.src);
          setPreloadState((prev) => ({
            ...prev,
            [period]: {
              ...prev[period],
              imageElement: img,
              isImageLoaded: true,
            },
          }));
          resolve(img);
        };

        img.onerror = () => {
          reject(new Error(`Failed to load image for ${period}`));
        };

        img.src = createImageUrl(cid);
      });
    },
    [createImageUrl]
  );

  const fetchImageData = useCallback(
    async (period: TimePeriod, isPriority = false) => {
      setPreloadState((prev) => ({
        ...prev,
        [period]: { ...prev[period], isLoading: true, error: null },
      }));

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

        // Extract CID from ipfs:// URL
        const ipfsUrl = sensorData.ipfs_url;
        const extractedCID = ipfsUrl.replace("ipfs://", "");

        if (!extractedCID) {
          throw new Error("Invalid IPFS URL format");
        }

        // Check if we already have this image cached
        const cacheKey = `${period}-${extractedCID}`;
        if (imageCacheRef.current.has(cacheKey)) {
          setPreloadState((prev) => ({
            ...prev,
            [period]: {
              cid: extractedCID,
              isLoading: false,
              error: null,
              isPreloaded: true,
              imageElement: preloadedImagesRef.current.get(cacheKey) || null,
              isImageLoaded: true,
            },
          }));
          return;
        }

        // Start preloading the image immediately
        const imagePromise = preloadImage(extractedCID, period);

        setPreloadState((prev) => ({
          ...prev,
          [period]: {
            cid: extractedCID,
            isLoading: false,
            error: null,
            isPreloaded: true,
            imageElement: null,
            isImageLoaded: false,
          },
        }));

        // Wait for image to load in background
        await imagePromise;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to fetch data");

        // If this is the priority load (daily) and it fails, try cumulative as fallback
        if (isPriority && period === "daily") {
          console.log("Daily data not available, falling back to cumulative");
          setCurrentTimePeriod("cumulative");
          return fetchImageData("cumulative", true);
        }

        setPreloadState((prev) => ({
          ...prev,
          [period]: {
            ...prev[period],
            isLoading: false,
            error,
            isPreloaded: false,
            imageElement: null,
            isImageLoaded: false,
          },
        }));
      }
    },
    [sensor, preloadImage]
  );

  // Priority loading: Start with daily, then preload others
  useEffect(() => {
    const loadPriorityData = async () => {
      // Start with daily as priority
      await fetchImageData("daily", true);

      // Preload hourly and cumulative in parallel with high priority
      Promise.all([fetchImageData("hourly", false), fetchImageData("cumulative", false)]).catch(console.error);
    };

    loadPriorityData();
  }, [fetchImageData]);

  const handleTimePeriodChange = useCallback((period: TimePeriod) => {
    setCurrentTimePeriod(period);
  }, []);

  const currentData = preloadState[currentTimePeriod];
  const hasAnyData = Object.values(preloadState).some((data) => data.cid && !data.error);

  // Show error if no data is available at all
  if (!hasAnyData && !Object.values(preloadState).some((data) => data.isLoading)) {
    const allErrors = Object.values(preloadState)
      .filter((data) => data.error)
      .map((data) => data.error?.message)
      .join(", ");
    return <div className={styles.error}>Error loading data: {allErrors}</div>;
  }

  // Show loading for current period if it's still loading
  if (currentData.isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading {currentTimePeriod} data...</div>
        <div className={styles.toggleContainer}>
          {(["daily", "hourly", "cumulative"] as TimePeriod[]).map((period) => {
            const periodData = preloadState[period];
            const buttonClasses = [
              styles.toggleButton,
              currentTimePeriod === period ? styles.active : "",
              periodData.isLoading ? styles.loading : "",
              periodData.error ? styles.error : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                key={period}
                className={buttonClasses}
                onClick={() => handleTimePeriodChange(period)}
                disabled={periodData.isLoading}
              >
                {period.charAt(0).toUpperCase() + period.slice(1)}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Show error for current period if it failed
  if (currentData.error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          Error loading {currentTimePeriod} data: {currentData.error.message}
        </div>
        <div className={styles.toggleContainer}>
          {(["daily", "hourly", "cumulative"] as TimePeriod[]).map((period) => {
            const periodData = preloadState[period];
            const buttonClasses = [
              styles.toggleButton,
              currentTimePeriod === period ? styles.active : "",
              periodData.isLoading ? styles.loading : "",
              periodData.error ? styles.error : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                key={period}
                className={buttonClasses}
                onClick={() => handleTimePeriodChange(period)}
                disabled={!!periodData.error}
              >
                {period.charAt(0).toUpperCase() + period.slice(1)}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Use preloaded image if available, otherwise fall back to direct URL
  const imageUrl = currentData.imageElement?.src || createImageUrl(currentData.cid!);

  return (
    <div className={styles.container}>
      <img
        src={imageUrl}
        alt={`${sensor} ${currentTimePeriod} visualization`}
        className={styles.image}
        loading={currentData.isImageLoaded ? "eager" : "lazy"}
        decoding='async'
        style={{
          opacity: currentData.isImageLoaded ? 1 : 0.8,
          transition: "opacity 0.2s ease-in-out",
        }}
        onLoad={() => {
          if (!currentData.isImageLoaded) {
            setPreloadState((prev) => ({
              ...prev,
              [currentTimePeriod]: {
                ...prev[currentTimePeriod],
                isImageLoaded: true,
              },
            }));
          }
        }}
      />
      <div className={styles.toggleContainer}>
        {(["daily", "hourly", "cumulative"] as TimePeriod[]).map((period) => {
          const periodData = preloadState[period];
          const isDisabled = periodData.isLoading || !!periodData.error;
          const buttonClasses = [
            styles.toggleButton,
            currentTimePeriod === period ? styles.active : "",
            periodData.isLoading ? styles.loading : "",
            periodData.error ? styles.error : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              key={period}
              className={buttonClasses}
              onClick={() => handleTimePeriodChange(period)}
              disabled={isDisabled}
              title={isDisabled ? `${period} data unavailable` : `Switch to ${period} view`}
            >
              {period.charAt(0).toUpperCase() + period.slice(1)}
              {periodData.isLoading && "..."}
              {periodData.isImageLoaded}
            </button>
          );
        })}
      </div>
    </div>
  );
}
