export interface WeatherData {
  temperature: number;
  temperatureF: number;
  feelsLike: number;
  feelsLikeF: number;
  humidity: number;
  pressure: number;
}

export interface HistoricalDataPoint {
  timestamp: string;
  temperature: number;
  temperatureF: number;
  humidity: number;
  pressure: number;
}

export interface EnvironmentalData {
  weather: WeatherData;
  historical: HistoricalDataPoint[];
}
