import { describe, it, expect } from 'vitest';
import {
  calculateSiplePasselWindChill,
  calculateJagtiWindChill,
  calculateFmiFeelsLike,
  calculateRothfuszHeatIndex,
  calculateApparentTemperature,
  getWindAdvisoryBadge,
  getRainOnsetLabel,
} from '../src/domain/meteorology';

describe('Meteorological Domain Invariants', () => {
  describe('Siple-Passel Wind Chill', () => {
    it('calculates wind chill for sub-zero windy conditions', () => {
      const wc = calculateSiplePasselWindChill(-5.0, 5.0);
      expect(wc).toBeLessThan(-5.0);
      expect(wc).toBeGreaterThan(-25.0);
    });

    it('returns air temperature when temperature exceeds 10°C', () => {
      expect(calculateSiplePasselWindChill(12.0, 6.0)).toBe(12.0);
    });

    it('returns air temperature when wind speed is below walking threshold (1.79 m/s)', () => {
      expect(calculateSiplePasselWindChill(2.0, 1.0)).toBe(2.0);
    });
  });

  describe('JAG/TI Metric Wind Chill', () => {
    it('calculates standard JAG/TI wind chill at -10°C and 10 m/s', () => {
      const wc = calculateJagtiWindChill(-10.0, 10.0);
      expect(wc).toBeCloseTo(-20.3, 0);
    });

    it('clamps to air temperature when wind speed is under 1.33 m/s (4.8 km/h)', () => {
      expect(calculateJagtiWindChill(0.0, 1.0)).toBe(0.0);
    });

    it('clamps to air temperature when temperature is above 10°C', () => {
      expect(calculateJagtiWindChill(15.0, 10.0)).toBe(15.0);
    });
  });

  describe('Official FMI Continuous Feels-Like Formula', () => {
    it('converges continuously to air temperature at calm wind (zero wind speed)', () => {
      // Critical invariant: 15 + (22/37)*5 + (15/37)*(0+1)^0.16*(5-37) = 5.0
      expect(calculateFmiFeelsLike(5.0, 0.0)).toBe(5.0);
      expect(calculateFmiFeelsLike(-2.0, 0.0)).toBe(-2.0);
      expect(calculateFmiFeelsLike(18.5, 0.0)).toBe(18.5);
    });

    it('accurately evaluates cold windy conditions (-10°C at 10 m/s = -24.9°C)', () => {
      // 15 + (22/37)*(-10) + (15/37)*(37)^0.16*(-47) = -24.90
      const feels = calculateFmiFeelsLike(-10.0, 10.0);
      expect(feels).toBe(-24.9);
    });


    it('calculates moderate chill at 4°C with 6 m/s wind', () => {
      const feels = calculateFmiFeelsLike(4.0, 6.0);
      expect(feels).toBeLessThan(4.0);
      expect(feels).toBeGreaterThan(-5.0);
    });
  });

  describe('Rothfusz Heat Index', () => {
    it('calculates significant heat stress at 30°C and 70% humidity', () => {
      const hi = calculateRothfuszHeatIndex(30.0, 70);
      expect(hi).toBeGreaterThan(34.0);
    });

    it('reverts to air temperature below 20°C', () => {
      expect(calculateRothfuszHeatIndex(18.0, 80)).toBe(18.0);
    });

    it('reverts to air temperature below 40% humidity', () => {
      expect(calculateRothfuszHeatIndex(25.0, 30)).toBe(25.0);
    });
  });

  describe('Unified Apparent Temperature Selector', () => {
    it('selects FMI feels-like for cold windy kickoff', () => {
      const apparent = calculateApparentTemperature(2.0, 5.0, 60);
      expect(apparent).toBeLessThan(2.0);
    });

    it('selects heat index for hot humid summer game', () => {
      const apparent = calculateApparentTemperature(28.0, 2.0, 65);
      expect(apparent).toBeGreaterThan(28.0);
    });

    it('returns air temperature in mild neutral conditions', () => {
      expect(calculateApparentTemperature(15.0, 1.0, 50)).toBe(15.0);
    });
  });

  describe('Wind Advisory Badges', () => {
    it('triggers storm gust alert at >= 21 m/s', () => {
      expect(getWindAdvisoryBadge(22.5)).toBe('🌪️ Myrskypuuskat');
    });

    it('triggers high wind alert at >= 14 m/s', () => {
      expect(getWindAdvisoryBadge(15.2)).toBe('💨 Kova tuuli');
    });

    it('triggers gusty alert at >= 10 m/s', () => {
      expect(getWindAdvisoryBadge(11.0)).toBe('🌬️ Puuskainen');
    });

    it('returns undefined for mild wind gusts', () => {
      expect(getWindAdvisoryBadge(6.5)).toBeUndefined();
    });
  });

  describe('Rain Onset Countdown', () => {
    it('computes minutes until rain onset before kickoff', () => {
      const kickoff = '2026-09-12T14:00:00.000Z';
      const rainTimeline = [
        { time: '2026-09-12T13:45:00.000Z', precipitationMmh: 0.8 },
      ];
      const res = getRainOnsetLabel(kickoff, rainTimeline);
      expect(res.label).toBe('🌧️ Sade alkaa 15 min ennen peliä');
      expect(res.minutesUntilRain).toBe(-15);
    });

    it('computes rain onset after kickoff during match', () => {
      const kickoff = '2026-09-12T14:00:00.000Z';
      const rainTimeline = [
        { time: '2026-09-12T14:20:00.000Z', precipitationMmh: 1.2 },
      ];
      const res = getRainOnsetLabel(kickoff, rainTimeline);
      expect(res.label).toBe('🌧️ Sade alkaa n. 20 min pelin alettua');
      expect(res.minutesUntilRain).toBe(20);
    });

    it('returns empty when no rain is forecasted', () => {
      const kickoff = '2026-09-12T14:00:00.000Z';
      const rainTimeline = [
        { time: '2026-09-12T14:00:00.000Z', precipitationMmh: 0.0 },
      ];
      expect(getRainOnsetLabel(kickoff, rainTimeline)).toEqual({});
    });
  });
});
