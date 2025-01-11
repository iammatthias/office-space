import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { PostgrestResponse } from "@supabase/supabase-js";

interface EnvironmentalData {
  time: Date;
  value: number;
}

interface DbRow {
  time: string;
  [key: string]: string | number | null;
}

export const useEnvironmentalData = (column: string) => {
  const [data, setData] = useState<EnvironmentalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        let allData: EnvironmentalData[] = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data: envData, error } = (await supabase
            .from("environmental_data")
            .select(`time, ${column}`)
            .order("time", { ascending: true })
            .range(page * pageSize, (page + 1) * pageSize - 1)) as PostgrestResponse<DbRow>;

          if (error) throw error;

          if (!envData || envData.length === 0) {
            hasMore = false;
            break;
          }

          const formattedData = envData.map((row) => ({
            time: new Date(row.time),
            value: Number(row[column] || 0),
          }));

          allData = [...allData, ...formattedData];

          if (envData.length < pageSize) {
            hasMore = false;
          }
          page++;
        }

        setData(allData);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Unknown error occurred"));
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [column]);

  return { data, loading, error };
};
