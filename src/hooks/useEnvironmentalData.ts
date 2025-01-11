import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { PostgrestResponse } from "@supabase/supabase-js";

export interface EnvironmentalData {
  time: Date;
  value: number;
}

interface DbRow {
  time: string;
  [key: string]: string | number | null;
}

const DB_NAME = "environmental-data";
const DB_VERSION = 1;

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("sensors")) {
        db.createObjectStore("sensors");
      }
    };
  });
};

const getFromStore = (db: IDBDatabase, storeName: string, key: string): Promise<EnvironmentalData[] | undefined> => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.get(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
};

const putInStore = (db: IDBDatabase, storeName: string, key: string, value: EnvironmentalData[]): Promise<void> => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.put(value, key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

const convertToLocalTime = (utcDate: Date): Date => {
  const pstOffset = -8; // PST is UTC-8
  const localDate = new Date(utcDate);
  localDate.setHours(localDate.getHours() + pstOffset);
  return localDate;
};

const interpolateData = (data: EnvironmentalData[]): EnvironmentalData[] => {
  if (data.length === 0) return [];

  const interpolated: EnvironmentalData[] = [];

  // Separate Jan 1 and Jan 2 data
  const jan1Data = data.filter((d) => d.time.getDate() === 1 && d.time.getMonth() === 0);
  const jan2Data = data.filter((d) => d.time.getDate() === 2 && d.time.getMonth() === 0);

  // Create a map of Jan 1 data keyed by hour:minute to track what we have
  const jan1Map = new Map<string, EnvironmentalData>();
  jan1Data.forEach((entry) => {
    const timeKey = `${entry.time.getHours()}:${entry.time.getMinutes()}`;
    jan1Map.set(timeKey, entry);
    interpolated.push(entry);
  });

  // Fill in only missing minutes from Jan 2
  if (jan1Data.length > 0) {
    jan2Data.forEach((jan2Entry) => {
      const timeKey = `${jan2Entry.time.getHours()}:${jan2Entry.time.getMinutes()}`;

      // Only add if we don't have data for this minute
      if (!jan1Map.has(timeKey)) {
        const newDate = new Date(jan2Entry.time);
        newDate.setDate(1);
        interpolated.push({
          time: newDate,
          value: jan2Entry.value,
        });
      }
    });

    // Sort Jan 1 data chronologically
    interpolated.sort((a, b) => a.time.getTime() - b.time.getTime());
  }

  // Add the rest of the data (including Jan 2 onwards)
  const nonJan1Data = data.filter((d) => !(d.time.getDate() === 1 && d.time.getMonth() === 0));
  for (let i = 0; i < nonJan1Data.length; i++) {
    const current = nonJan1Data[i];

    if (current.value === 0 && i > 0 && i < nonJan1Data.length - 1) {
      // Find next non-zero value
      let nextIndex = i + 1;
      while (nextIndex < nonJan1Data.length && nonJan1Data[nextIndex].value === 0) {
        nextIndex++;
      }

      if (nextIndex < nonJan1Data.length) {
        const prevValue = nonJan1Data[i - 1].value;
        const nextValue = nonJan1Data[nextIndex].value;
        current.value = (prevValue + nextValue) / 2;
      } else {
        current.value = nonJan1Data[i - 1].value;
      }
    }

    interpolated.push(current);
  }

  return interpolated;
};

async function fetchDataFromSupabase(column: string, startTime?: Date): Promise<EnvironmentalData[]> {
  let allData: EnvironmentalData[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  const query = supabase.from("environmental_data").select(`time, ${column}`);

  if (startTime) {
    query.gt("time", startTime.toISOString());
  }

  while (hasMore) {
    const { data: envData, error } = (await query.range(
      page * pageSize,
      (page + 1) * pageSize - 1
    )) as PostgrestResponse<DbRow>;

    if (error) throw error;

    if (!envData || envData.length === 0) {
      hasMore = false;
      break;
    }

    const formattedData = envData.map((row) => ({
      time: convertToLocalTime(new Date(row.time)),
      value: Number(row[column] || 0),
    }));

    allData = [...allData, ...formattedData];

    if (envData.length < pageSize) {
      hasMore = false;
    }
    page++;
  }

  return allData;
}

export const useEnvironmentalData = (column: string) => {
  const [data, setData] = useState<EnvironmentalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [db, setDb] = useState<IDBDatabase | null>(null);

  // Initialize IndexedDB
  useEffect(() => {
    initDB().then(setDb).catch(console.error);
  }, []);

  useEffect(() => {
    async function fetchData() {
      if (!db) return;

      try {
        // Try to get data from IndexedDB first
        const cachedData = await getFromStore(db, "sensors", column);
        let newData: EnvironmentalData[] = [];

        if (cachedData && cachedData.length > 0) {
          // Get the latest timestamp from cached data
          const latestTimestamp = new Date(Math.max(...cachedData.map((d) => d.time.getTime())));
          // Subtract 5 minutes to ensure we don't miss any data due to timing issues
          latestTimestamp.setMinutes(latestTimestamp.getMinutes() - 5);
          console.log("Fetching data since:", latestTimestamp);

          // Fetch only new data since the latest timestamp
          const newDataFromSupabase = await fetchDataFromSupabase(column, latestTimestamp);

          // Filter out any duplicate timestamps that might exist in both sets
          const existingTimestamps = new Set(cachedData.map((d) => d.time.getTime()));
          const uniqueNewData = newDataFromSupabase.filter((d) => !existingTimestamps.has(d.time.getTime()));

          if (uniqueNewData.length > 0) {
            console.log(`Found ${uniqueNewData.length} new records`);
            // Combine cached and new data
            newData = [...cachedData, ...uniqueNewData];
            // Process and store the updated data
            const processedData = interpolateData(newData);
            await putInStore(db, "sensors", column, processedData);
            setData(processedData);
          } else {
            console.log("No new data found");
            setData(cachedData);
          }
        } else {
          // No cached data, fetch everything
          console.log("No cached data found, fetching all");
          newData = await fetchDataFromSupabase(column);
          const processedData = interpolateData(newData);
          await putInStore(db, "sensors", column, processedData);
          setData(processedData);
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Unknown error occurred"));
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [column, db]);

  return { data, loading, error };
};
