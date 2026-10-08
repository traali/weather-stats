/**
 * Meteorological Domain Engine
 *
 * Implements authoritative mathematical models:
 * - Siple-Passel Wind Chill (1945)
 * - JAG/TI Metric Wind Chill (2001)
 * - Official FMI continuous feels-like formula ("Tuntuu kuin")
 * - Rothfusz Heat Index & Summer Simmer Index
 * - Wind gust advisories & zero-token-leak WhatsApp briefings
 */

import { formatHelsinkiTime } from './helsinkiTime';

/**
 * Siple-Passel empirical wind chill formula (1945)
 * @param tempC Air temperature in °C
 * @param windSpeedMs Wind speed in m/s
 */
export function calculateSiplePasselWindChill(tempC: number, windSpeedMs: number): number {
  if (tempC > 10.0 || windSpeedMs < 1.79) {
    return tempC;
  }
  const v = Math.max(0.1, windSpeedMs);
  const coolingRate = (10.45 + 10 * Math.sqrt(v) - v) * (33 - tempC);
  const wc = 33 - coolingRate / 22.04;
  return Math.round(wc * 10) / 10;
}

/**
 * JAG/TI metric wind chill formula (2001)
 * Valid for T <= 10.0 °C and V >= 4.8 km/h (1.33 m/s)
 * @param tempC Air temperature in °C
 * @param windSpeedMs Wind speed in m/s
 */
export function calculateJagtiWindChill(tempC: number, windSpeedMs: number): number {
  const vKmh = windSpeedMs * 3.6;
  if (tempC > 10.0 || vKmh < 4.8) {
    return tempC;
  }
  const vPow = Math.pow(vKmh, 0.16);
  const wc = 13.12 + 0.6215 * tempC - 11.37 * vPow + 0.3965 * tempC * vPow;
  return Math.round(wc * 10) / 10;
}

/**
 * FMI wind-chill part of the "Tuntuu kuin" temperature.
 * Same as FmiFeelsLikeTemperature in fmidev/smartmet-library-newbase (NFmiMetMath.cpp):
 *   chill = a + (1 - a/t0)*T + (a/t0)*(V + 1)^0.16 * (T - t0),  a = 15, t0 = 37
 * V is in m/s. FMI fitted the coefficients for m/s; feeding km/h makes it several degrees too cold.
 * Continuous boundary property: when V = 0, the result is T exactly.
 * @param tempC Air temperature in °C
 * @param windSpeedMs Wind speed in m/s
 */
export function calculateFmiFeelsLike(tempC: number, windSpeedMs: number): number {
  const v = Math.max(0, windSpeedMs);
  const a = 15.0;
  const t0 = 37.0;
  const chill = a + (1 - a / t0) * tempC + (a / t0) * Math.pow(v + 1, 0.16) * (tempC - t0);
  return Math.round(chill * 10) / 10;
}

/**
 * Rothfusz 9-term polynomial heat index (Steadman/NOAA in Celsius)
 * Valid for T >= 20.0 °C and RH >= 40 %
 * @param tempC Air temperature in °C
 * @param relativeHumidity Relative humidity in % (0 - 100)
 */
export function calculateRothfuszHeatIndex(tempC: number, relativeHumidity: number): number {
  if (tempC < 20.0 || relativeHumidity < 40) {
    return tempC;
  }
  const T = tempC;
  const R = relativeHumidity;

  const c1 = -8.78469475556;
  const c2 = 1.61139411;
  const c3 = 2.33854883889;
  const c4 = -0.14611605;
  const c5 = -0.012308094;
  const c6 = -0.0164248277778;
  const c7 = 0.002211732;
  const c8 = 0.00072546;
  const c9 = -0.000003582;

  const hi =
    c1 +
    c2 * T +
    c3 * R +
    c4 * T * R +
    c5 * T * T +
    c6 * R * R +
    c7 * T * T * R +
    c8 * T * R * R +
    c9 * T * T * R * R;

  return Math.round(hi * 10) / 10;
}

/**
 * Summer Simmer Index as FMI computes it (FmiSummerSimmerIndex, NFmiMetMath.cpp).
 * Returns the air temperature at or below 14.5 °C.
 * @param tempC Air temperature in °C
 * @param relativeHumidity Relative humidity in % (0 - 100)
 */
export function calculateSummerSimmerIndex(tempC: number, relativeHumidity: number): number {
  if (tempC <= 14.5) {
    return tempC;
  }
  const rhRef = 0.5;
  const r = relativeHumidity / 100;
  const ssi =
    (1.8 * tempC - 0.55 * (1 - r) * (1.8 * tempC - 26) - 0.55 * (1 - rhRef) * 26) /
    (1.8 * (1 - 0.55 * (1 - rhRef)));
  return Math.round(ssi * 10) / 10;
}

/**
 * FMI "Tuntuu kuin" temperature without the radiation term:
 *   feels = T + (chill - T) + (SSI - T)
 * as in FmiFeelsLikeTemperature. Needs temperature, wind (m/s) and humidity (%).
 * Returns null when any input is missing, never a made-up number.
 */
export function calculateApparentTemperature(
  tempC: number | null | undefined,
  windSpeedMs: number | null | undefined,
  relativeHumidity: number | null | undefined
): number | null {
  if (
    tempC == null ||
    windSpeedMs == null ||
    relativeHumidity == null ||
    !Number.isFinite(tempC) ||
    !Number.isFinite(windSpeedMs) ||
    !Number.isFinite(relativeHumidity)
  ) {
    return null;
  }
  const chill = calculateFmiFeelsLike(tempC, windSpeedMs);
  const heat = calculateSummerSimmerIndex(tempC, relativeHumidity);
  const feels = tempC + (chill - tempC) + (heat - tempC);
  return Math.round(feels * 10) / 10;
}

/**
 * Evaluates wind gust advisory severity
 * @param windGustMs 10-minute maximum gust in m/s
 */
export function getWindAdvisoryBadge(windGustMs: number): string | undefined {
  if (!Number.isFinite(windGustMs)) return undefined;
  if (windGustMs >= 21.0) {
    return '🌪️ Myrskypuuskat';
  }
  if (windGustMs >= 14.0) {
    return '💨 Kova tuuli';
  }
  if (windGustMs >= 10.0) {
    return '🌬️ Puuskainen';
  }
  return undefined;
}

/**
 * Formats rain onset label relative to kickoff time
 * @param kickoffTimeIso Match start time
 * @param rainTimeline List of forecast timestamps and precipitation
 */
export function getRainOnsetLabel(
  kickoffTimeIso: string,
  rainTimeline: Array<{ time: string; precipitationMmh: number }>
): { label?: string; minutesUntilRain?: number } {
  if (!rainTimeline || rainTimeline.length === 0) return {};

  const kickoffMs = new Date(kickoffTimeIso).getTime();
  const firstRainPoint = rainTimeline.find((p) => p.precipitationMmh > 0.2);

  if (!firstRainPoint) return {};

  const rainMs = new Date(firstRainPoint.time).getTime();
  const diffMinutes = Math.round((rainMs - kickoffMs) / 60000);

  if (diffMinutes < -60) {
    return { label: '🌧️ Sataa jo kentällä', minutesUntilRain: diffMinutes };
  }
  if (diffMinutes < 0) {
    return {
      label: `🌧️ Sade alkaa ${Math.abs(diffMinutes)} min ennen peliä`,
      minutesUntilRain: diffMinutes,
    };
  }
  if (diffMinutes === 0) {
    return { label: '🌧️ Sade alkaa aloituksen aikaan', minutesUntilRain: 0 };
  }
  if (diffMinutes <= 90) {
    return {
      label: `🌧️ Sade alkaa n. ${diffMinutes} min pelin alettua`,
      minutesUntilRain: diffMinutes,
    };
  }

  return {};
}

/**
 * Formats a clean, safe matchday WhatsApp weather snippet
 * GUARANTEED ZERO TOKEN LEAKS (no undefined, null, NaN, [object Object], [PVM])
 */
export function formatMatchdayWeatherBriefing(params: {
  venueName: string;
  kickoffTime: string;
  temperatureC: number | null;
  feelsLikeC: number | null;
  windSpeedMs: number | null;
  windGustMs: number | null;
  precipitationMmh: number | null;
  turfConditionLabelFi: string;
  windAdvisory?: string;
  lightningAlert?: string;
}): string {
  const {
    venueName,
    kickoffTime,
    temperatureC,
    feelsLikeC,
    windSpeedMs,
    windGustMs,
    precipitationMmh,
    turfConditionLabelFi,
    windAdvisory,
    lightningAlert,
  } = params;

  const safeVenue = venueName || 'Kenttä';
  // kickoffTime is UTC ISO; people read Helsinki time.
  const safeTime = formatHelsinkiTime(kickoffTime) || '–';
  const safeTemp = temperatureC != null && Number.isFinite(temperatureC) ? temperatureC.toFixed(1) : '–';
  const safeFeels = feelsLikeC != null && Number.isFinite(feelsLikeC) ? feelsLikeC.toFixed(1) : '–';
  const safeWind = windSpeedMs != null && Number.isFinite(windSpeedMs) ? windSpeedMs.toFixed(1) : '–';
  const safeGust = windGustMs != null && Number.isFinite(windGustMs) ? ` (puuska ${windGustMs.toFixed(1)} m/s)` : '';
  const safePrecip = precipitationMmh != null && Number.isFinite(precipitationMmh) ? precipitationMmh.toFixed(1) : '–';
  const safeTurf = turfConditionLabelFi || '–';

  const lines: string[] = [
    `🌦️ SÄÄTIEDOTE — ${safeVenue} klo ${safeTime}`,
    `• Lämpötila: ${safeTemp}°C (Tuntuu kuin: ${safeFeels}°C)`,
    `• Tuuli: ${safeWind} m/s${safeGust}`,
    `• Sade-ennuste: ${safePrecip} mm/h`,
    `• Kentän pinta: ${safeTurf}`,
  ];

  if (windAdvisory) {
    lines.push(`• Tuulivaroitus: ${windAdvisory}`);
  }

  if (lightningAlert) {
    lines.push(`• ${lightningAlert}`);
  }

  return lines.join('\n');
}
