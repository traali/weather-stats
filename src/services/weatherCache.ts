/**
 * Venue list and "FMI did not answer" results.
 *
 * There is deliberately no weather cache here. An old temperature or an old
 * lightning check is never shown as current: when FMI fails, the result says so.
 */

import { Coordinates, VenueWeatherForecastResult } from '../types/weather';

export interface CachedVenueSnapshot {
  venueId: string;
  venueName: string;
  coords: Coordinates;
}

/**
 * Real Helsinki-region venues. Coordinates only — weather is never stored here.
 * Töölö and Lauttasaari coordinates checked against OpenStreetMap (2026-10-08).
 */
export const DETERMINISTIC_VENUE_SNAPSHOTS: Record<string, CachedVenueSnapshot> = {
  vaiski: {
    venueId: 'vaiski',
    venueName: 'Töölön Pallokenttä (Väiski)',
    coords: { lat: 60.1872, lng: 24.9232 },
  },
  lauttasaari: {
    venueId: 'lauttasaari',
    venueName: 'Lauttasaaren liikuntapuisto, Helsinki',
    coords: { lat: 60.1633, lng: 24.8662 },
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
    coords: { lat: 60.1834, lng: 24.9257 },
  },
  tapiola: {
    venueId: 'tapiola',
    venueName: 'Tapiolan Urheilupuisto, Espoo',
    coords: { lat: 60.1772, lng: 24.7854 },
  },
};

/** Venues in display order. */
export const VENUES = DETERMINISTIC_VENUE_SNAPSHOTS;

/** Forecast result for "FMI did not answer". Every value is null; nothing is remembered. */
export function unavailableForecast(
  coords: Coordinates,
  kickoffTimeIso: string,
  venueId?: string,
  venueName?: string,
  errorFi: string = 'FMI ei vastannut.'
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
    isCacheFallback: false,
    fetchedAt: new Date().toISOString(),
    errorFi,
    uiResourceUri: `ui://weather/venue-card?venueId=${venueId || 'venue'}&lat=${coords.lat}&lng=${coords.lng}&unavailable=1`,
  };
}
