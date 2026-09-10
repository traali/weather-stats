import { describe, it, expect } from 'vitest';
import {
  haversineDistanceKm,
  evaluatePitchLightningRisk,
} from '../src/domain/lightningSafety';

describe('Finnish 30/30 Lightning Safety Engine', () => {
  const venueCoords = { lat: 60.1873, lng: 24.9258 }; // Väiski, Helsinki

  describe('Haversine Distance', () => {
    it('returns 0 for identical coordinates', () => {
      expect(haversineDistanceKm(60.1873, 24.9258, 60.1873, 24.9258)).toBe(0);
    });

    it('calculates accurate distance between Helsinki (Kamppi) and Espoo (Otahalli)', () => {
      // Kamppi (60.1699, 24.9384) to Otahalli (60.1770, 24.8050) ~ 7.4 km
      const d = haversineDistanceKm(60.1699, 24.9384, 60.177, 24.805);
      expect(d).toBeCloseTo(7.4, 0);
    });
  });

  describe('30/30 Rule Tiering Invariants', () => {
    const refTime = new Date('2026-09-12T14:30:00.000Z').getTime();

    it('triggers DANGER and play suspension when strike is within 10 km and < 30 min old', () => {
      const strikeTime = new Date(refTime - 10 * 60 * 1000).toISOString(); // 10 min ago
      // ~6 km away
      const strikes = [{ lat: 60.22, lng: 24.93, timeIso: strikeTime }];

      const res = evaluatePitchLightningRisk(venueCoords, strikes, refTime, 'Väiski');

      expect(res.status).toBe('danger');
      expect(res.suspendMatchRecommended).toBe(true);
      expect(res.resumeCountdownMinutes).toBe(20); // 30 - 10 = 20
      expect(res.downpourWarning).toBe(true);
      expect(res.alertMessage).toContain('SALAMAVAARA');
      expect(res.uiResourceUri).toContain('status=danger');
    });

    it('triggers WATCH when strike is between 10 km and 20 km within 30 min', () => {
      const strikeTime = new Date(refTime - 12 * 60 * 1000).toISOString(); // 12 min ago
      // ~15 km away
      const strikes = [{ lat: 60.32, lng: 24.93, timeIso: strikeTime }];

      const res = evaluatePitchLightningRisk(venueCoords, strikes, refTime, 'Väiski');

      expect(res.status).toBe('watch');
      expect(res.suspendMatchRecommended).toBe(false);
      expect(res.alertMessage).toContain('UKKOSVAHTI');
      expect(res.uiResourceUri).toContain('status=watch');
    });

    it('reverts to CLEAR when strikes within 10 km are older than 30 minutes', () => {
      const strikeTime = new Date(refTime - 35 * 60 * 1000).toISOString(); // 35 min ago
      const strikes = [{ lat: 60.20, lng: 24.93, timeIso: strikeTime }];

      const res = evaluatePitchLightningRisk(venueCoords, strikes, refTime, 'Väiski');

      expect(res.status).toBe('clear');
      expect(res.suspendMatchRecommended).toBe(false);
    });

    it('handles direct hit (distance 0.0 km) without division by zero or truthiness bugs', () => {
      const strikeTime = new Date(refTime - 5 * 60 * 1000).toISOString();
      const strikes = [{ lat: venueCoords.lat, lng: venueCoords.lng, timeIso: strikeTime }];

      const res = evaluatePitchLightningRisk(venueCoords, strikes, refTime, 'Väiski');

      expect(res.status).toBe('danger');
      expect(res.nearestStrikeKm).toBe(0);
      expect(res.suspendMatchRecommended).toBe(true);
    });

    it('clamps future clock-skewed strike timestamps to prevent negative elapsed times', () => {
      // Strike timestamp is 5 minutes in the FUTURE relative to refTime
      const strikeTime = new Date(refTime + 5 * 60 * 1000).toISOString();
      const strikes = [{ lat: 60.20, lng: 24.93, timeIso: strikeTime }];

      const res = evaluatePitchLightningRisk(venueCoords, strikes, refTime, 'Väiski');

      expect(res.status).toBe('danger');
      expect(res.resumeCountdownMinutes).toBe(30); // 30 - 0 = 30
      expect(res.suspendMatchRecommended).toBe(true);
    });
  });

  describe('Strike Recency Classification (Fresh vs History)', () => {
    const refTime = new Date('2026-09-12T14:30:00.000Z').getTime();

    it('classifies strikes under 15 min old as fresh (pulsing halo)', () => {
      const freshStrikeTime = new Date(refTime - 8 * 60 * 1000).toISOString();
      const olderStrikeTime = new Date(refTime - 25 * 60 * 1000).toISOString();

      const strikes = [
        { lat: 60.20, lng: 24.93, timeIso: freshStrikeTime },
        { lat: 60.21, lng: 24.94, timeIso: olderStrikeTime },
      ];

      const res = evaluatePitchLightningRisk(venueCoords, strikes, refTime, 'Väiski');

      const fresh = res.strikes.find((s) => s.isFresh);
      const older = res.strikes.find((s) => !s.isFresh);

      expect(fresh).toBeDefined();
      expect(older).toBeDefined();
      expect(fresh?.isFresh).toBe(true);
      expect(older?.isFresh).toBe(false);
    });

    it('drops strikes older than 60 minutes from active radar tracking', () => {
      const staleStrikeTime = new Date(refTime - 75 * 60 * 1000).toISOString(); // 75 min ago
      const strikes = [{ lat: 60.20, lng: 24.93, timeIso: staleStrikeTime }];

      const res = evaluatePitchLightningRisk(venueCoords, strikes, refTime, 'Väiski');

      expect(res.strikes.length).toBe(0);
      expect(res.status).toBe('clear');
    });
  });
});
