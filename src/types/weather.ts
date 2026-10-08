export interface Coordinates {
  lat: number;
  lng: number;
}

export type TurfCondition = 'dry' | 'slick' | 'frozen' | 'snowy';
export type TurfConditionLabelFi = 'Kuiva' | 'Liukas' | 'Jäätynyt' | 'Luminen' | '—';

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
  temperatureC: number | null;
  feelsLikeC: number | null;
  windSpeedMs: number | null;
  windGustMs: number | null;
  precipitationMmh: number | null;
  rainProbabilityPercent?: number;
  rainTimeline: Array<{ time: string; precipitationMmh: number }>;
  rainCountdownMinutes?: number;
  rainOnsetLabel?: string;
  turfCondition: TurfCondition;
  turfConditionLabelFi: TurfConditionLabelFi;
  windAdvisoryBadge?: string;
  /** False when FMI did not return a reading. Never fill this with a remembered September day. */
  available: boolean;
  /** Always false: an old reading is never served as current. Kept for the v1 contract. */
  isCacheFallback: boolean;
  cacheTimestamp?: string;
  /** FMI forecast valid time (UTC ISO) the values belong to. */
  forecastTime?: string;
  /** When the FMI request was made (UTC ISO). */
  fetchedAt?: string;
  /** Finnish reason shown when FMI did not answer. */
  errorFi?: string;
  uiResourceUri: string;
}

/** One measured value with the FMI station and time it came from. */
export interface ObservedValue {
  value: number;
  /** FMI observation time (UTC ISO). */
  time: string;
  stationName: string;
  fmisid: string;
  distanceKm: number;
}

export interface VenueObservationArgs {
  lat: number;
  lng: number;
  /** Defaults to Date.now(). */
  referenceTime?: string;
  venueName?: string;
}

export interface VenueObservationResult {
  venueName?: string;
  coordinates: Coordinates;
  /** False when FMI did not answer or no station had a fresh temperature. */
  available: boolean;
  /** Station the temperature came from. */
  stationName?: string;
  fmisid?: string;
  distanceKm?: number;
  /** FMI observation time of the temperature (UTC ISO). */
  observedAt?: string;
  temperature: ObservedValue | null;
  windSpeed: ObservedValue | null;
  windGust: ObservedValue | null;
  /** ri_10min, mm/h */
  precipitationIntensity: ObservedValue | null;
  /** r_1h, mm over the last hour */
  precipitation1h: ObservedValue | null;
  fetchedAt: string;
  errorFi?: string;
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
  status: 'clear' | 'watch' | 'danger' | 'unknown';
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
  /** Always false: an old lightning check is never served as current. */
  isCacheFallback: boolean;
  cacheTimestamp?: string;
  /** When FMI answered the lightning query (UTC ISO). Missing when the check failed. */
  checkedAt?: string;
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
  basemapUrl: string;
  currentFrameUrl: string;
  animationLoop: RadarAnimationFrame[];
  uiResourceUri: string;
}
