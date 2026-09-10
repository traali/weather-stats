/**
 * Finnish 30/30 Lightning Safety Engine
 *
 * Implements the Finnish Olympic Committee / FMI youth sports lightning standard:
 * - Danger Tier (< 10 km, < 30 min): Suspend match immediately, take shelter in indoor building / vehicle.
 *   Safe resume countdown = 30 min from most recent strike within 10 km.
 * - Watch Tier (10 - 20 km, < 30 min): Monitor storm track, prepare evacuation.
 * - Clear Tier (> 20 km or > 30 min since last strike): Normal play safe.
 */

import { Coordinates, LightningStrikeItem, PitchLightningRiskResult } from '../types/weather';

/**
 * Great-circle Haversine distance between two WGS84 coordinates in kilometers
 */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  if (lat1 === lat2 && lng1 === lng2) return 0;
  const R = 6371.0;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const clampedA = Math.min(1.0, Math.max(0.0, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(Math.max(0.0, 1.0 - clampedA)));
  return Math.round(R * c * 100) / 100;
}

export function evaluatePitchLightningRisk(
  venueCoords: Coordinates,
  rawStrikes: Array<{
    lat: number;
    lng: number;
    timeIso: string;
    peakCurrentKa?: number;
  }>,
  referenceTimeMs: number = Date.now(),
  venueName?: string,
  isCacheFallback: boolean = false,
  cacheTimestamp?: string
): PitchLightningRiskResult {
  let nearestStrikeKm: number | undefined;
  let nearestStrikeMinutesAgo: number | undefined;
  let strikesWithin10kmCount = 0;
  let strikesWithin15kmCount = 0;
  let strikesWithin30kmCount = 0;

  let mostRecent10kmTimeMs: number | undefined;
  let mostRecent30kmTimeMs: number | undefined;
  let latestStrikeTimeIso: string | undefined;

  const processedStrikes: LightningStrikeItem[] = [];

  for (const strike of rawStrikes) {
    const distKm = haversineDistanceKm(venueCoords.lat, venueCoords.lng, strike.lat, strike.lng);
    const strikeTimeMs = new Date(strike.timeIso).getTime();

    // Clamp negative elapsed time (clock skew guard per M-13 invariant)
    const elapsedMinutes = Math.max(0, Math.round((referenceTimeMs - strikeTimeMs) / 60000));
    const isFresh = elapsedMinutes < 15;

    // We track strikes within 30 km up to 60 minutes old
    if (distKm <= 30 && elapsedMinutes <= 60) {
      strikesWithin30kmCount++;

      if (nearestStrikeKm === undefined || distKm < nearestStrikeKm) {
        nearestStrikeKm = distKm;
        nearestStrikeMinutesAgo = elapsedMinutes;
      }

      if (!mostRecent30kmTimeMs || strikeTimeMs > mostRecent30kmTimeMs) {
        mostRecent30kmTimeMs = strikeTimeMs;
        latestStrikeTimeIso = strike.timeIso;
      }

      if (distKm <= 15) {
        strikesWithin15kmCount++;
      }

      if (distKm <= 10) {
        strikesWithin10kmCount++;
        if (!mostRecent10kmTimeMs || strikeTimeMs > mostRecent10kmTimeMs) {
          mostRecent10kmTimeMs = strikeTimeMs;
        }
      }

      processedStrikes.push({
        lat: strike.lat,
        lng: strike.lng,
        timeIso: strike.timeIso,
        distanceKm: distKm,
        peakCurrentKa: strike.peakCurrentKa,
        isFresh,
      });
    }
  }

  // Sort strikes by nearest distance first
  processedStrikes.sort((a, b) => a.distanceKm - b.distanceKm);

  const safeVenue = venueName || 'Kenttä';
  const resourceUri = `ui://weather/lightning-radar?lat=${venueCoords.lat}&lng=${venueCoords.lng}&status=`;

  // 1. DANGER TIER: Any strike <= 10 km within 30 minutes
  if (mostRecent10kmTimeMs !== undefined) {
    const elapsedMinutes = Math.max(0, (referenceTimeMs - mostRecent10kmTimeMs) / 60000);
    if (elapsedMinutes < 30) {
      const remainingMinutes = Math.max(1, Math.ceil(30 - elapsedMinutes));
      const distStr = nearestStrikeKm !== undefined ? `${nearestStrikeKm.toFixed(1)} km` : '<10 km';
      const alertMessage = `⚠️ SALAMAVAARA: Salama havaittu ${distStr} päässä kohteesta ${safeVenue}! Keskeytä ottelu ja siirry sisätiloihin (30/30-sääntö).`;
      const safetyAdvisoryFi = `Ottelun keskeytys pakollinen. Turvallinen paluu arviolta ${remainingMinutes} min kuluttua viimeisimmästä iskusta.`;

      return {
        status: 'danger',
        nearestStrikeKm: nearestStrikeKm !== undefined ? Math.round(nearestStrikeKm * 10) / 10 : 0,
        nearestStrikeMinutesAgo,
        strikesWithin10kmCount,
        strikesWithin15kmCount,
        strikesWithin30kmCount,
        suspendMatchRecommended: true,
        resumeCountdownMinutes: remainingMinutes,
        downpourWarning: true,
        alertMessage,
        safetyAdvisoryFi,
        latestStrikeTimeIso,
        strikes: processedStrikes,
        isCacheFallback,
        cacheTimestamp,
        uiResourceUri: `${resourceUri}danger`,
      };
    }
  }

  // 2. WATCH TIER: Nearest strike <= 20 km within 30 minutes
  if (
    nearestStrikeKm !== undefined &&
    nearestStrikeKm <= 20 &&
    mostRecent30kmTimeMs !== undefined &&
    referenceTimeMs - mostRecent30kmTimeMs <= 30 * 60 * 1000
  ) {
    const alertMessage = `⚡ UKKOSVAHTI: Ukkosrintama lähestyy kohdetta ${safeVenue} (${nearestStrikeKm.toFixed(1)} km päässä). Seuraa taivasta ja valmistaudu mahdolliseen keskeytykseen.`;
    const safetyAdvisoryFi = `Salama alle 20 km päässä. Peli voi jatkua, mutta tarkkaile tilannetta ja suojaudu välittömästi jos jyrinä kuuluu.`;

    return {
      status: 'watch',
      nearestStrikeKm: Math.round(nearestStrikeKm * 10) / 10,
      nearestStrikeMinutesAgo,
      strikesWithin10kmCount,
      strikesWithin15kmCount,
      strikesWithin30kmCount,
      suspendMatchRecommended: false,
      downpourWarning: false,
      alertMessage,
      safetyAdvisoryFi,
      latestStrikeTimeIso,
      strikes: processedStrikes,
      isCacheFallback,
      cacheTimestamp,
      uiResourceUri: `${resourceUri}watch`,
    };
  }

  // 3. CLEAR TIER
  return {
    status: 'clear',
    nearestStrikeKm: nearestStrikeKm !== undefined ? Math.round(nearestStrikeKm * 10) / 10 : undefined,
    nearestStrikeMinutesAgo,
    strikesWithin10kmCount: 0,
    strikesWithin15kmCount: 0,
    strikesWithin30kmCount,
    suspendMatchRecommended: false,
    downpourWarning: false,
    safetyAdvisoryFi: 'Ei aktiivisia salamaniskuja 20 km säteellä. Ulkopelit turvallisia.',
    latestStrikeTimeIso,
    strikes: processedStrikes,
    isCacheFallback,
    cacheTimestamp,
    uiResourceUri: `${resourceUri}clear`,
  };
}
