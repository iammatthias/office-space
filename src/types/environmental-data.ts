export type EnvironmentalData = {
  weather: {
    temperature: number;
    temperatureF: number;
    feelsLike: number;
    feelsLikeF: number;
    humidity: number;
    pressure: number;
  };
  historical: {
    timestamp: string;
    temperature: number;
    temperatureF: number;
    humidity: number;
    pressure: number;
  }[];
};
