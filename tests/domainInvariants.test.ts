import { describe, it, expect } from 'vitest';
import { formatMatchdayWeatherBriefing } from '../src/domain/meteorology';
import { unavailableForecast } from '../src/services/weatherCache';
import { unknownLightningRisk } from '../src/domain/lightningSafety';

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
      expect(brief).toContain('–°C');
      expect(brief).not.toContain('0.0°C');
    });
  });

  describe('FMI failure stays a failure (no remembered values)', () => {
    it('unavailable forecast has only nulls and says why', () => {
      const coords = { lat: 60.1873, lng: 24.9258 };
      const fallback = unavailableForecast(coords, '2026-09-12T14:00:00.000Z', 'vaiski', 'Väiski');

      expect(fallback.isCacheFallback).toBe(false);
      expect(fallback.available).toBe(false);
      expect(fallback.temperatureC).toBeNull();
      expect(fallback.windSpeedMs).toBeNull();
      expect(fallback.windGustMs).toBeNull();
      expect(fallback.precipitationMmh).toBeNull();
      expect(fallback.errorFi).toBe('FMI ei vastannut.');
    });

    it('failed lightning check is unknown, never clear, never invented strikes', () => {
      const coords = { lat: 60.1873, lng: 24.9258 };
      const lightningFallback = unknownLightningRisk(coords, 'Väiski');

      expect(lightningFallback.status).toBe('unknown');
      expect(lightningFallback.strikes.length).toBe(0);
      expect(lightningFallback.safetyAdvisoryFi).toContain('Salamatietoa ei saatu');
      expect(lightningFallback.safetyAdvisoryFi).not.toMatch(/turvalli/i);
      expect(lightningFallback.uiResourceUri).toContain('status=unknown');
    });
  });

  describe('Briefing uses Helsinki time', () => {
    it('shows 18.00 for a 15:00Z kickoff in October (EEST)', () => {
      const brief = formatMatchdayWeatherBriefing({
        venueName: 'Väiski',
        kickoffTime: '2026-10-08T15:00:00.000Z',
        temperatureC: 10,
        feelsLikeC: 8,
        windSpeedMs: 3,
        windGustMs: null,
        precipitationMmh: 0,
        turfConditionLabelFi: 'Kuiva',
      });
      expect(brief).toContain('klo 18.00');
      expect(brief).not.toContain('15:00');
    });
  });
});
