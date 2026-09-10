import { describe, it, expect } from 'vitest';
import { formatMatchdayWeatherBriefing } from '../src/domain/meteorology';
import {
  getDeterministicForecastFallback,
  getDeterministicLightningFallback,
  DETERMINISTIC_VENUE_SNAPSHOTS,
} from '../src/services/weatherCache';

describe('Domain Safety Invariants & Anti-Slop Token Gates', () => {
  describe('Zero-Token-Leak WhatsApp Briefing Formatter (MATH-10)', () => {
    it('generates pristine briefing with full real data', () => {
      const brief = formatMatchdayWeatherBriefing({
        venueName: 'Töölön Pallokenttä (Väiski)',
        kickoffTime: '2026-09-12T14:00:00.000Z',
        temperatureC: 14.5,
        feelsLikeC: 13.2,
        windSpeedMs: 4.5,
        windGustMs: 8.2,
        precipitationMmh: 0.0,
        turfConditionLabelFi: 'Kuiva',
        windAdvisory: '💨 Kova tuuli',
        lightningAlert: '⚡ UKKOSVAHTI: Ukkosrintama lähestyy',
      });

      expect(brief).toContain('SÄÄTIEDOTE');
      expect(brief).toContain('14.5°C');
      expect(brief).toContain('Töölön Pallokenttä');

      // Strict Anti-Slop Assertions
      expect(brief).not.toContain('undefined');
      expect(brief).not.toContain('null');
      expect(brief).not.toContain('NaN');
      expect(brief).not.toContain('[object Object]');
      expect(brief).not.toContain('[PVM]');
      expect(brief).not.toContain('[SYÖTÄ TULOS]');
    });

    it('generates safe briefing even with degenerate / NaN / empty inputs', () => {
      const brief = formatMatchdayWeatherBriefing({
        venueName: '',
        kickoffTime: '',
        temperatureC: NaN,
        feelsLikeC: NaN,
        windSpeedMs: NaN,
        windGustMs: NaN,
        precipitationMmh: NaN,
        turfConditionLabelFi: '',
      });

      // Strict assertions against token leaks
      expect(brief).not.toContain('undefined');
      expect(brief).not.toContain('null');
      expect(brief).not.toContain('NaN');
      expect(brief).not.toContain('[object Object]');
      expect(brief).not.toContain('[PVM]');
      expect(brief).toContain('0.0°C');
    });
  });

  describe('Cache Fallback Honesty & Zero-Mock Invariant', () => {
    it('sets isCacheFallback: true on all fallback snapshots', () => {
      const coords = { lat: 60.1873, lng: 24.9258 };
      const fallback = getDeterministicForecastFallback(
        coords,
        '2026-09-12T14:00:00.000Z',
        'vaiski',
        'Väiski'
      );

      expect(fallback.isCacheFallback).toBe(true);
      expect(fallback.cacheTimestamp).toBeDefined();
      expect(fallback.temperatureC).toBe(DETERMINISTIC_VENUE_SNAPSHOTS.vaiski.temperatureC);
    });

    it('never invents synthetic lightning strikes in offline fallback', () => {
      const coords = { lat: 60.1873, lng: 24.9258 };
      const lightningFallback = getDeterministicLightningFallback(coords, 'Väiski');

      expect(lightningFallback.isCacheFallback).toBe(true);
      expect(lightningFallback.strikes.length).toBe(0);
      expect(lightningFallback.strikesWithin10kmCount).toBe(0);
      expect(lightningFallback.status).toBe('clear');
    });
  });
});
