export interface WeatherData {
  time: string;
  temperature: number;
  humidity: number;
  pressure: number;
  altitude: number;
  temperatureF?: number;
  feelsLikeF?: number;
  feelsLike?: number;
}

export interface HistoricalDataPoint {
  time: string;
  temperature: number;
  humidity: number;
  pressure: number;
  altitude: number;
  temperatureF?: number;
}

export interface EnvironmentalData {
  weather: WeatherData;
  historical: HistoricalDataPoint[];
}
