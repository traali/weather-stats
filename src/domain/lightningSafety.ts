/**
 * Finnish 30/30 Lightning Safety Engine
 *
 * Implements the Finnish Olympic Committee / FMI youth sports lightning standard:
 * - Danger Tier (< 10 km, < 30 min): Suspend match immediately, take shelter in indoor building / vehicle.
 *   Safe resume countdown = 30 min from most recent strike within 10 km.
 * - Watch Tier (10 - 20 km, < 30 min): Monitor storm track, prepare evacuation.
 * - Clear Tier: FMI answered and reported no strike <= 20 km in the last 30 min.
 * - Unknown: the FMI check failed. This is never shown as clear.
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

/**
 * Evaluates the 30/30 rule from strikes FMI actually returned.
 * Only call this when the FMI query succeeded. A failed query is `unknownLightningRisk`, never 'clear'.
 *
 * - danger: any strike <= 10 km in the last 30 min
 * - watch:  any strike <= 20 km in the last 30 min
 * - clear:  FMI answered and neither of the above
 * Counts and the strike list cover strikes <= 30 km in the last 60 min.
 */
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
  cacheTimestamp?: string,
  checkedAt?: string
): PitchLightningRiskResult {
  let strikesWithin10kmCount = 0;
  let strikesWithin15kmCount = 0;
  let strikesWithin30kmCount = 0;
  let nearestAnyKm: number | undefined;
  let nearestAnyMinutesAgo: number | undefined;
  let latestStrikeMs: number | undefined;
  let latestStrikeTimeIso: string | undefined;

  // Strikes in the last 30 min, used for the tier decision
  let nearestRecentKm: number | undefined;
  let nearestRecentMinutesAgo: number | undefined;
  let mostRecentDangerMs: number | undefined;

  const processedStrikes: LightningStrikeItem[] = [];

  for (const strike of rawStrikes) {
    const strikeTimeMs = new Date(strike.timeIso).getTime();
    if (!Number.isFinite(strikeTimeMs)) continue;
    const distKm = haversineDistanceKm(venueCoords.lat, venueCoords.lng, strike.lat, strike.lng);

    // Clamp negative elapsed time (clock skew guard per M-13 invariant)
    const elapsedMs = Math.max(0, referenceTimeMs - strikeTimeMs);
    const elapsedMinutes = Math.round(elapsedMs / 60000);
    if (distKm > 30 || elapsedMs > 60 * 60 * 1000) continue;

    strikesWithin30kmCount++;
    if (distKm <= 15) strikesWithin15kmCount++;
    if (distKm <= 10) strikesWithin10kmCount++;

    if (nearestAnyKm === undefined || distKm < nearestAnyKm) {
      nearestAnyKm = distKm;
      nearestAnyMinutesAgo = elapsedMinutes;
    }
    if (latestStrikeMs === undefined || strikeTimeMs > latestStrikeMs) {
      latestStrikeMs = strikeTimeMs;
      latestStrikeTimeIso = strike.timeIso;
    }

    if (elapsedMs < 30 * 60 * 1000) {
      if (nearestRecentKm === undefined || distKm < nearestRecentKm) {
        nearestRecentKm = distKm;
        nearestRecentMinutesAgo = elapsedMinutes;
      }
      if (distKm <= 10 && (mostRecentDangerMs === undefined || strikeTimeMs > mostRecentDangerMs)) {
        mostRecentDangerMs = strikeTimeMs;
      }
    }

    processedStrikes.push({
      lat: strike.lat,
      lng: strike.lng,
      timeIso: strike.timeIso,
      distanceKm: distKm,
      peakCurrentKa: strike.peakCurrentKa,
      isFresh: elapsedMinutes < 15,
    });
  }

  processedStrikes.sort((a, b) => a.distanceKm - b.distanceKm);

  const safeVenue = venueName || 'Kenttä';
  const resourceUri = `ui://weather/lightning-radar?lat=${venueCoords.lat}&lng=${venueCoords.lng}&status=`;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const common = {
    strikesWithin10kmCount,
    strikesWithin15kmCount,
    strikesWithin30kmCount,
    latestStrikeTimeIso,
    strikes: processedStrikes,
    isCacheFallback,
    cacheTimestamp,
    checkedAt,
  };

  // 1. DANGER: strike <= 10 km in the last 30 min
  if (mostRecentDangerMs !== undefined && nearestRecentKm !== undefined) {
    const elapsedMinutes = Math.max(0, (referenceTimeMs - mostRecentDangerMs) / 60000);
    const remainingMinutes = Math.max(1, Math.ceil(30 - elapsedMinutes));
    const distStr = `${nearestRecentKm.toFixed(1)} km`;
    return {
      ...common,
      status: 'danger',
      nearestStrikeKm: round1(nearestRecentKm),
      nearestStrikeMinutesAgo: nearestRecentMinutesAgo,
      suspendMatchRecommended: true,
      resumeCountdownMinutes: remainingMinutes,
      downpourWarning: true,
      alertMessage: `⚠️ SALAMAVAARA: Salama havaittu ${distStr} päässä kohteesta ${safeVenue}! Keskeytä ottelu ja siirry sisätiloihin (30/30-sääntö).`,
      safetyAdvisoryFi: `Ottelun keskeytys pakollinen. Peliä voi jatkaa aikaisintaan ${remainingMinutes} min kuluttua, jos uusia salamoita ei havaita 10 km säteellä.`,
      uiResourceUri: `${resourceUri}danger`,
    };
  }

  // 2. WATCH: strike <= 20 km in the last 30 min
  if (nearestRecentKm !== undefined && nearestRecentKm <= 20) {
    return {
      ...common,
      status: 'watch',
      nearestStrikeKm: round1(nearestRecentKm),
      nearestStrikeMinutesAgo: nearestRecentMinutesAgo,
      suspendMatchRecommended: false,
      downpourWarning: false,
      alertMessage: `⚡ UKKOSVAHTI: Ukkosrintama lähellä kohdetta ${safeVenue} (${nearestRecentKm.toFixed(1)} km päässä). Seuraa taivasta ja valmistaudu keskeytykseen.`,
      safetyAdvisoryFi: 'Salama alle 20 km päässä viimeisen 30 min aikana. Tarkkaile tilannetta ja suojaudu heti, jos jyrinä kuuluu.',
      uiResourceUri: `${resourceUri}watch`,
    };
  }

  // 3. CLEAR: FMI answered and reported no strike <= 20 km in the last 30 min
  return {
    ...common,
    status: 'clear',
    nearestStrikeKm: nearestAnyKm !== undefined ? round1(nearestAnyKm) : undefined,
    nearestStrikeMinutesAgo: nearestAnyMinutesAgo,
    suspendMatchRecommended: false,
    downpourWarning: false,
    safetyAdvisoryFi: 'FMI: ei salamahavaintoja 20 km säteellä viimeisen 30 min aikana. Seuraa silti taivasta.',
    uiResourceUri: `${resourceUri}clear`,
  };
}

/** Result for a lightning check that failed. Never 'clear', never invented strikes. */
export function unknownLightningRisk(
  venueCoords: Coordinates,
  venueName?: string,
  reasonFi: string = 'FMI ei vastannut.'
): PitchLightningRiskResult {
  const where = venueName ? ` (${venueName})` : '';
  return {
    status: 'unknown',
    nearestStrikeKm: undefined,
    nearestStrikeMinutesAgo: undefined,
    strikesWithin10kmCount: 0,
    strikesWithin15kmCount: 0,
    strikesWithin30kmCount: 0,
    suspendMatchRecommended: false,
    downpourWarning: false,
    safetyAdvisoryFi: `Salamatietoa ei saatu${where}. ${reasonFi} Älä oleta, että ukkosta ei ole.`,
    strikes: [],
    isCacheFallback: false,
    uiResourceUri: `ui://weather/lightning-radar?lat=${venueCoords.lat}&lng=${venueCoords.lng}&status=unknown`,
  };
}
