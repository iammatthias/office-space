import { EnvironmentalData } from "../../hooks/useEnvironmentalData";

const COLOR_SCHEMES = {
  hum: [
    "#DDF1E4",
    "#BFE8D9",
    "#A2DECE",
    "#87D3C3",
    "#5ABDAC",
    "#3AA99F",
    "#2F968D",
    "#24837B",
    "#1C6C66",
    "#164F4A",
    "#143F3C",
    "#122F2C",
    "#101F1D",
  ],
  temperature: [
    // Blue scale (cold to neutral)
    "#101A24", // Darkest blue
    "#133051",
    "#163B66",
    "#1A4F8C",
    "#205EA6",
    "#3171B2",
    "#4385BE",
    "#66A0C8",
    "#92BFDB",
    "#ABCFE2",
    "#C6DDE8",
    "#E1ECEB", // Lightest blue
    // Red scale (neutral to hot)
    "#FFE1D5", // Lightest red
    "#FFCABB",
    "#FDB2A2",
    "#F89A8A",
    "#E8705F",
    "#D14D41",
    "#C03E35",
    "#AF3029",
    "#942822",
    "#6C201C",
    "#551B18",
    "#261312", // Darkest red
  ],
  lux: [
    "#F2F0E5",
    "#E6E4D9",
    "#DAD8CE",
    "#CECDC3",
    "#B7B5AC",
    "#9F9D96",
    "#878580",
    "#6F6E69",
    "#575653",
    "#403E3C",
    "#343331",
    "#282726",
    "#1C1B1A",
  ],
  gas: [
    "#FAEEC6",
    "#F6E2A8",
    "#F1D67E",
    "#ECCB60",
    "#DFB431",
    "#D8A215",
    "#BE9207",
    "#AD8301",
    "#8E6801",
    "#664D01",
    "#583D02",
    "#3A2D04",
    "#241E08",
  ],
  uv: [
    "#F0EAEC",
    "#E2D9E9",
    "#D3CAE6",
    "#C4B9E0",
    "#A699D0",
    "#8B7EC8",
    "#735EB5",
    "#5E409D",
    "#3C2A62",
    "#31234E",
    "#261C39",
    "#1A1623",
    "#1A1623",
  ],
  pressure: [
    "#EDEECF",
    "#DDE2B2",
    "#CDD597",
    "#BEC97E",
    "#A8AF54",
    "#879A39",
    "#768D21",
    "#668008",
    "#536907",
    "#3D4C07",
    "#313D07",
    "#252D09",
    "#1A1E0C",
  ],
} as const;

export const getColorFor = (value: number, min: number, max: number, column: string): string => {
  // Normalize the value to a 0-1 scale
  const normalizedValue = (value - min) / (max - min);

  // Parse the column name to get the data type
  const [dataType] = column.toLowerCase().split("_");

  // Get the appropriate color scheme
  const colorScheme = COLOR_SCHEMES[dataType as keyof typeof COLOR_SCHEMES] || COLOR_SCHEMES.temperature;

  // Calculate the index in the color array
  const index = Math.min(Math.floor(normalizedValue * (colorScheme.length - 1)), colorScheme.length - 1);

  return colorScheme[index];
};

export const organizeDataByDay = (data: EnvironmentalData[]): EnvironmentalData[][] => {
  const dayMap = new Map<string, EnvironmentalData[]>();

  data.forEach((entry) => {
    const date = entry.time.toISOString().split("T")[0];
    if (!dayMap.has(date)) {
      dayMap.set(date, []);
    }
    dayMap.get(date)?.push(entry);
  });

  return Array.from(dayMap.values());
};

export const getRange = (data: EnvironmentalData[]) => {
  let min = Infinity;
  let max = -Infinity;

  data.forEach((entry) => {
    min = Math.min(min, entry.value);
    max = Math.max(max, entry.value);
  });

  return { min, max };
};
