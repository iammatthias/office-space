const BASE = "https://image-api.office.pure---internet.com/timeline";

type Readings = Record<"temp" | "hum" | "pressure" | "lux" | "uv" | "gas", number | null>;

export type DayNightRow = Readings & {
  date: string;
  period: "day" | "night";
  time_start: string;
  time_end: string;
};

export type HourlyRow = Readings & { time: string };

const cache = new Map<string, Promise<unknown>>();

function load<T>(name: string): Promise<T> {
  if (!cache.has(name)) {
    const request = fetch(`${BASE}/${name}.json`).then((res) => {
      if (!res.ok) throw new Error(`${name}.json: HTTP ${res.status}`);
      return res.json();
    });
    request.catch(() => cache.delete(name));
    cache.set(name, request);
  }
  return cache.get(name) as Promise<T>;
}

export const loadDayNight = () => load<DayNightRow[]>("daynight");
export const loadHourly = () => load<HourlyRow[]>("hourly");
