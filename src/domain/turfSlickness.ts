/**
 * Dynamic Pitch Turf Slickness Engine
 *
 * Deterministic three-state classifier:
 * - frozen: T_a < -1.0 °C (infill and ground frozen, no cleat penetration)
 * - slick: T_a >= -1.0 °C and r > 0.3 mm/h (aquaplaning risk)
 * - dry: otherwise
 */

import { TurfCondition, TurfConditionLabelFi } from '../types/weather';

export interface TurfSlicknessEvaluation {
  condition: TurfCondition;
  labelFi: TurfConditionLabelFi;
  descriptionFi: string;
  badgeClass: string;
  cleatRecommendationFi: string;
}

export function evaluateTurfSlickness(
  tempC: number,
  precipitationMmh: number,
  snowDepthCm?: number
): TurfSlicknessEvaluation {
  const safeTemp = Number.isFinite(tempC) ? tempC : 10.0;
  const safePrecip = Number.isFinite(precipitationMmh) ? Math.max(0, precipitationMmh) : 0.0;
  const safeSnow = Number.isFinite(snowDepthCm) ? Math.max(0, snowDepthCm ?? 0) : 0.0;

  // Snow on ground
  if (safeSnow > 0.5) {
    return {
      condition: 'snowy',
      labelFi: 'Luminen',
      descriptionFi: `Kentällä lunta (${safeSnow.toFixed(1)} cm). Pito ja pallon liike heikentynyt.`,
      badgeClass: 'bg-cyan-950/40 text-cyan-300 border-cyan-500/30',
      cleatRecommendationFi: 'Nappulakengät / talvikenkä, suositellaan aurausta',
    };
  }

  // Frozen turf: strictly < -1.0 °C
  if (safeTemp < -1.0) {
    return {
      condition: 'frozen',
      labelFi: 'Jäätynyt',
      descriptionFi: `Pakkaskenttä (${safeTemp.toFixed(1)}°C). Tekonurmen kumi ja hiekka kovettuneet.`,
      badgeClass: 'bg-sky-950/40 text-sky-300 border-sky-500/30',
      cleatRecommendationFi: 'TF (turf) / matalat kumitassut, vältä pitkiä rautanappeja',
    };
  }

  // Slick turf: T >= -1.0 °C AND precip > 0.3 mm/h
  if (safePrecip > 0.3) {
    return {
      condition: 'slick',
      labelFi: 'Liukas',
      descriptionFi: `Märkä kenttä (${safePrecip.toFixed(1)} mm/h sade). Liukastumis- ja vesiliirtoriski.`,
      badgeClass: 'bg-blue-950/40 text-blue-300 border-blue-500/30',
      cleatRecommendationFi: 'FG/AG pitävät nappulat, maalivahdeille märän kelin hanskat',
    };
  }

  // Dry turf: default
  return {
    condition: 'dry',
    labelFi: 'Kuiva',
    descriptionFi: 'Kenttäolosuhde optimaalinen, normaali kitka.',
    badgeClass: 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30',
    cleatRecommendationFi: 'Normaali AG / FG tekonurminappula',
  };
}
