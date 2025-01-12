import { EnvironmentalData } from "../../hooks/useEnvironmentalData";

export const COLOR_SCHEMES = {
  redblue: [
    // Blue scale (cold to neutral)
    "#E1ECEB", // Lightest blue
    "#C6DDE8",
    "#ABCFE2",
    "#92BFDB",
    "#66A0C8",
    "#4385BE",
    "#3171B2",
    "#205EA6",
    "#1A4F8C",
    "#163B66",
    "#133051",
    "#101A24", // Darkest blue
    // Red scale (neutral to hot)
    "#261312", // Darkest red
    "#551B18",
    "#6C201C",
    "#942822",
    "#AF3029",
    "#C03E35",
    "#D14D41",
    "#E8705F",
    "#F89A8A",
    "#FDB2A2",
    "#FFCABB",
    "#FFE1D5", // Lightest red
  ],
  cyan: [
    "#101F1D",
    "#122F2C",
    "#143F3C",
    "#164F4A",
    "#1C6C66",
    "#24837B",
    "#2F968D",
    "#3AA99F",
    "#5ABDAC",
    "#87D3C3",
    "#A2DECE",
    "#BFE8D9",
    "#DDF1E4",
  ],
  blue: [
    "#101A24",
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
    "#E1ECEB",
  ],
  red: [
    "#261312",
    "#551B18",
    "#6C201C",
    "#942822",
    "#AF3029",
    "#C03E35",
    "#D14D41",
    "#E8705F",
    "#F89A8A",
    "#FDB2A2",
    "#FFCABB",
    "#FFE1D5",
  ],
  base: [
    "#1C1B1A",
    "#282726",
    "#343331",
    "#403E3C",
    "#575653",
    "#6F6E69",
    "#878580",
    "#9F9D96",
    "#B7B5AC",
    "#CECDC3",
    "#DAD8CE",
    "#E6E4D9",
    "#F2F0E5",
  ],
  yellow: [
    "#241E08",
    "#3A2D04",
    "#583D02",
    "#664D01",
    "#8E6801",
    "#AD8301",
    "#BE9207",
    "#D8A215",
    "#DFB431",
    "#ECCB60",
    "#F1D67E",
    "#F6E2A8",
    "#FAEEC6",
  ],
  purple: [
    "#1A1623",
    "#1A1623",
    "#261C39",
    "#31234E",
    "#3C2A62",
    "#5E409D",
    "#735EB5",
    "#8B7EC8",
    "#A699D0",
    "#C4B9E0",
    "#D3CAE6",
    "#E2D9E9",
    "#F0EAEC",
  ],
  green: [
    "#1A1E0C",
    "#252D09",
    "#313D07",
    "#3D4C07",
    "#536907",
    "#668008",
    "#768D21",
    "#879A39",
    "#A8AF54",
    "#BEC97E",
    "#CDD597",
    "#DDE2B2",
    "#EDEECF",
  ],
} as const;

export const getColorFor = (value: number, min: number, max: number, column: string): string => {
  // Normalize the value to a 0-1 scale
  const normalizedValue = (value - min) / (max - min);

  // Parse the column name to get the data type
  const [dataType] = column.toLowerCase().split("_");

  // Get the appropriate color scheme
  const colorScheme = COLOR_SCHEMES[dataType as keyof typeof COLOR_SCHEMES] || COLOR_SCHEMES.redblue;

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
