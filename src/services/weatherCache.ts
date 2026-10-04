/**
 * Deterministic Weather Cache & Invariant Fallback Store
 *
 * Implements strict Zero-Mock Fallback:
 * - On FMI network failure or timeout, provides verified historical/cached snapshots
 *   explicitly flagged with `isCacheFallback: true`.
 * - NEVER fabricates synthetic random weather or fake lightning strikes.
 */

import {
  Coordinates,
  VenueWeatherForecastResult,
  PitchLightningRiskResult,
} from '../types/weather';

export interface CachedVenueSnapshot {
  venueId: string;
  venueName: string;
  coords: Coordinates;
}

/**
 * Real Helsinki-region halls. Coordinates only — weather is never stored here.
 */
export const DETERMINISTIC_VENUE_SNAPSHOTS: Record<string, CachedVenueSnapshot> = {
  vaiski: {
    venueId: 'vaiski',
    venueName: 'Töölön Pallokenttä (Väiski)',
    coords: { lat: 60.1873, lng: 24.9258 },
  },
  otahalli: {
    venueId: 'otahalli',
    venueName: 'Otahalli & Otaranta, Espoo',
    coords: { lat: 60.1837, lng: 24.8315 },
  },
  kamppi: {
    venueId: 'kamppi',
    venueName: 'Kamppi Sports Center, Helsinki',
    coords: { lat: 60.1685, lng: 24.9312 },
  },
  leppavaara: {
    venueId: 'leppavaara',
    venueName: 'Leppävaaran Urheilupuisto, Espoo',
    coords: { lat: 60.2238, lng: 24.8117 },
  },
  kisahalli: {
    venueId: 'kisahalli',
    venueName: 'Töölön Kisahalli, Helsinki',
    coords: { lat: 60.1852, lng: 24.9261 },
  },
  tapiola: {
    venueId: 'tapiola',
    venueName: 'Tapiolan Urheilupuisto, Espoo',
    coords: { lat: 60.1772, lng: 24.7854 },
  },
};

const memoryForecastCache = new Map<string, VenueWeatherForecastResult>();
const memoryLightningCache = new Map<string, PitchLightningRiskResult>();

/**
 * Clears all in-memory weather and lightning forecast caches.
 * Ensures isolation between test cases and avoids cross-query state contamination.
 */
export function clearWeatherCache(): void {
  memoryForecastCache.clear();
  memoryLightningCache.clear();
}

/**
 * Generates coordinate hash key with 4 decimal places (~11m spatial resolution).
 * Distinguishes adjacent urban sports venues (e.g. Väiski and Kisahalli ~230m apart)
 * while tolerating minor floating-point coordinate representations.
 */
function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

export function saveForecastToCache(result: VenueWeatherForecastResult): void {
  const key = coordKey(result.coordinates.lat, result.coordinates.lng);
  memoryForecastCache.set(key, result);
  if (result.venueId) {
    memoryForecastCache.set(result.venueId.toLowerCase(), result);
  }
}

export function saveLightningToCache(coords: Coordinates, result: PitchLightningRiskResult): void {
  const key = coordKey(coords.lat, coords.lng);
  memoryLightningCache.set(key, result);
}

export function unavailableForecast(
  coords: Coordinates,
  kickoffTimeIso: string,
  venueId?: string,
  venueName?: string
): VenueWeatherForecastResult {
  return {
    venueId,
    venueName,
    coordinates: coords,
    kickoffTime: kickoffTimeIso,
    temperatureC: null,
    feelsLikeC: null,
    windSpeedMs: null,
    windGustMs: null,
    precipitationMmh: null,
    rainTimeline: [],
    turfCondition: 'dry',
    turfConditionLabelFi: '—',
    available: false,
    isCacheFallback: true,
    cacheTimestamp: new Date().toISOString(),
    uiResourceUri: `ui://weather/venue-card?venueId=${venueId || 'venue'}&lat=${coords.lat}&lng=${coords.lng}&unavailable=1`,
  };
}

/**
 * Returns the last real FMI reading for this venue, or an explicit unavailable result.
 * Never copies a hardcoded temperature.
 */
export function getDeterministicForecastFallback(
  coords: Coordinates,
  kickoffTimeIso: string,
  venueId?: string,
  venueName?: string
): VenueWeatherForecastResult {
  const venueHit = venueId ? memoryForecastCache.get(venueId.toLowerCase()) : undefined;
  const coordHit = memoryForecastCache.get(coordKey(coords.lat, coords.lng));
  const memoryHit = venueHit || coordHit;

  if (memoryHit && memoryHit.available && memoryHit.temperatureC != null) {
    return {
      ...memoryHit,
      isCacheFallback: true,
      cacheTimestamp: memoryHit.cacheTimestamp || new Date().toISOString(),
    };
  }

  return unavailableForecast(coords, kickoffTimeIso, venueId, venueName);
}

/**
 * Retrieves cached lightning risk or deterministic fallback
 * INVARIANT: NEVER fabricates fake strikes during offline mode.
 */
export function getDeterministicLightningFallback(
  coords: Coordinates,
  venueName?: string
): PitchLightningRiskResult {
  const key = coordKey(coords.lat, coords.lng);
  const memoryHit = memoryLightningCache.get(key);

  if (memoryHit) {
    return {
      ...memoryHit,
      isCacheFallback: true,
      cacheTimestamp: memoryHit.cacheTimestamp || new Date().toISOString(),
    };
  }

  const safeVenue = venueName ? `kohteessa ${venueName}` : 'välimuistissa';

  return {
    status: 'unknown',
    nearestStrikeKm: undefined,
    nearestStrikeMinutesAgo: undefined,
    strikesWithin10kmCount: 0,
    strikesWithin15kmCount: 0,
    strikesWithin30kmCount: 0,
    suspendMatchRecommended: false,
    downpourWarning: false,
    safetyAdvisoryFi: `Salamatilaa ei saatu (${safeVenue}). FMI-yhteys katkennut. Älä oleta, että sää on turvallinen.`,
    strikes: [],
    isCacheFallback: true,
    cacheTimestamp: new Date().toISOString(),
    uiResourceUri: `ui://weather/lightning-radar?lat=${coords.lat}&lng=${coords.lng}&status=clear&cache=true`,
  };
}

