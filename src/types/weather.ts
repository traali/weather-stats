export interface Coordinates {
  lat: number;
  lng: number;
}

export type TurfCondition = 'dry' | 'slick' | 'frozen' | 'snowy';
export type TurfConditionLabelFi = 'Kuiva' | 'Liukas' | 'Jäätynyt' | 'Luminen';

export interface VenueWeatherForecastArgs {
  lat: number;
  lng: number;
  kickoffTime: string; // ISO 8601
  endTime?: string;   // ISO 8601
  venueId?: string;
  venueName?: string;
}

export interface VenueWeatherForecastResult {
  venueId?: string;
  venueName?: string;
  coordinates: Coordinates;
  kickoffTime: string;
  temperatureC: number;
  feelsLikeC: number;
  windSpeedMs: number;
  windGustMs: number;
  precipitationMmh: number;
  rainProbabilityPercent?: number;
  rainTimeline: Array<{ time: string; precipitationMmh: number }>;
  rainCountdownMinutes?: number;
  rainOnsetLabel?: string;
  turfCondition: TurfCondition;
  turfConditionLabelFi: TurfConditionLabelFi;
  windAdvisoryBadge?: string;
  isCacheFallback: boolean;
  cacheTimestamp?: string;
  uiResourceUri: string;
}

export interface PitchLightningRiskArgs {
  lat: number;
  lng: number;
  perimeterKm?: number;
  referenceTime?: string;
  venueName?: string;
}

export interface LightningStrikeItem {
  lat: number;
  lng: number;
  timeIso: string;
  distanceKm: number;
  peakCurrentKa?: number;
  isFresh: boolean; // < 15 min old
}

export interface PitchLightningRiskResult {
  status: 'clear' | 'watch' | 'danger';
  nearestStrikeKm?: number;
  nearestStrikeMinutesAgo?: number;
  strikesWithin10kmCount: number;
  strikesWithin15kmCount: number;
  strikesWithin30kmCount: number;
  suspendMatchRecommended: boolean;
  resumeCountdownMinutes?: number; // Finnish 30/30 Rule
  downpourWarning: boolean;
  alertMessage?: string;
  safetyAdvisoryFi: string;
  latestStrikeTimeIso?: string;
  strikes: LightningStrikeItem[];
  isCacheFallback: boolean;
  cacheTimestamp?: string;
  uiResourceUri: string;
}

export type RadarSatelliteLayerId =
  | 'fmi_rain_radar'
  | 'eumetsat_fog'
  | 'eumetsat_natural'
  | 'fmi_lightning';

export interface RadarSatelliteLayerArgs {
  layer?: RadarSatelliteLayerId;
  lat: number;
  lng: number;
  radiusKm?: number;
  timestamp?: string;
  frameCount?: number;
}

export interface RadarAnimationFrame {
  label: string; // e.g. "-25 min", "-20 min", "Nyt"
  timestampIso: string;
  wmsUrl: string;
  isForecast?: boolean;
}

export interface RadarSatelliteLayerResult {
  layer: RadarSatelliteLayerId;
  layerTitle: string;
  provider: 'FMI (Ilmatieteen laitos)' | 'EUMETSAT (Euroopan sääsatelliittijärjestö)';
  refreshIntervalMinutes: number;
  description: string;
  legendText: string;
  center: Coordinates;
  bbox: {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
    crs: 'CRS:84';
  };
  currentFrameUrl: string;
  animationLoop: RadarAnimationFrame[];
  uiResourceUri: string;
}
