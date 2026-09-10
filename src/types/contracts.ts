/**
 * Sovereign Contract Adapter for Weather Stats
 * Conforms to canonical contracts in contracts/index.ts.
 */

export const CONTRACT_VERSION = '1.0.0' as const;

export type SupportedSport = 'football' | 'volleyball' | 'floorball' | 'basketball' | 'other';

export interface MatchdayContextContract {
  eventId: string;
  sport: SupportedSport;
  startTime: string;
  warmupTime?: string;
  homeTeam: string;
  awayTeam: string;
  venueName: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  association?: 'palloliitto' | 'salibandy' | 'basket' | 'torneopal' | 'other';
  externalId?: string;
}

export interface WeatherForecastContract {
  venueId?: string;
  venueName?: string;
  coordinates: { latitude: number; longitude: number };
  kickoffTime: string;
  temperatureC: number;
  feelsLikeC: number;
  windSpeedMs: number;
  windGustMs: number;
  precipitationMmh: number;
  turfCondition: 'dry' | 'slick' | 'frozen' | 'snowy';
  turfConditionLabelFi: string;
  lightningRiskStatus: 'clear' | 'watch' | 'danger';
  suspendMatchRecommended: boolean;
  deepLinkUrl: string;
  isCacheFallback: boolean;
  updatedAt?: string;
}

export interface CrossRepoQueryContract {
  theme?: string;
  embed?: boolean;
  parentOrigin?: string;
  targetId?: string;
}
