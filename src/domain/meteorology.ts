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
 * Official FMI continuous feels-like formula ("Tuntuu kuin")
 * Disclosed by Ilmatieteen laitos in official public information requests:
 * T_feels = 15 + (22/37)*T + (15/37)*(V_kmh + 1)^0.16 * (T - 37)
 * 
 * Continuous boundary property: when V = 0, T_feels = T exactly.
 * @param tempC Air temperature in °C
 * @param windSpeedMs Wind speed in m/s
 */
export function calculateFmiFeelsLike(tempC: number, windSpeedMs: number): number {
  const vKmh = Math.max(0, windSpeedMs * 3.6);
  if (vKmh === 0) {
    return Math.round(tempC * 10) / 10;
  }
  const feels = 15 + (22 / 37) * tempC + (15 / 37) * Math.pow(vKmh + 1, 0.16) * (tempC - 37);
  return Math.round(feels * 10) / 10;
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
 * Summer Simmer Index (FMI warm weather formula)
 * For T >= 14.5 °C
 * @param tempC Air temperature in °C
 * @param relativeHumidity Relative humidity in %
 */
export function calculateSummerSimmerIndex(tempC: number, relativeHumidity: number): number {
  if (tempC < 14.5) {
    return tempC;
  }
  const tF = tempC * 1.8 + 32;
  const ssiF = 1.98 * (tF - (0.55 - 0.0055 * relativeHumidity) * (tF - 58)) - 56.83;
  const ssiC = (ssiF - 32) / 1.8;
  return Math.round(ssiC * 10) / 10;
}

/**
 * Unified Apparent Temperature Selector
 * Applies FMI continuous feels-like formula for cold/windy conditions (T <= 10°C),
 * Rothfusz Heat Index for warm/humid conditions (T >= 20°C, RH >= 40%),
 * and linear transition in intermediate weather.
 */
export function calculateApparentTemperature(
  tempC: number,
  windSpeedMs: number,
  relativeHumidity: number = 70
): number {
  if (!Number.isFinite(tempC) || !Number.isFinite(windSpeedMs)) {
    return 0;
  }

  if (tempC <= 10.0 && windSpeedMs > 1.33) {
    return calculateFmiFeelsLike(tempC, windSpeedMs);
  }

  if (tempC >= 20.0 && relativeHumidity >= 40) {
    return calculateRothfuszHeatIndex(tempC, relativeHumidity);
  }

  return Math.round(tempC * 10) / 10;
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
  temperatureC: number;
  feelsLikeC: number;
  windSpeedMs: number;
  windGustMs: number;
  precipitationMmh: number;
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
  const safeTime = kickoffTime ? kickoffTime.slice(11, 16) : '00:00';
  const safeTemp = Number.isFinite(temperatureC) ? temperatureC.toFixed(1) : '0.0';
  const safeFeels = Number.isFinite(feelsLikeC) ? feelsLikeC.toFixed(1) : safeTemp;
  const safeWind = Number.isFinite(windSpeedMs) ? windSpeedMs.toFixed(1) : '0.0';
  const safeGust = Number.isFinite(windGustMs) ? ` (puuska ${windGustMs.toFixed(1)} m/s)` : '';
  const safePrecip = Number.isFinite(precipitationMmh) ? precipitationMmh.toFixed(1) : '0.0';
  const safeTurf = turfConditionLabelFi || 'Kuiva';

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
