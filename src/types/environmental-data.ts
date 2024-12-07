export interface EnvironmentalData {
  weather: {
    temperature: number;
    humidity: number;
    pressure: number;
    feelsLike?: number; // Optional field
  };
  historical: HistoricalDataPoint[];
}

export interface HistoricalDataPoint {
  time: string; // Timestamp or ISO string
  temperature: number;
}
