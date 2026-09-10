import { describe, it, expect } from 'vitest';
import {
  calculateSiplePasselWindChill,
  calculateJagtiWindChill,
  calculateFmiFeelsLike,
  calculateRothfuszHeatIndex,
  calculateSummerSimmerIndex,
  calculateApparentTemperature,
} from '../src/domain/meteorology';
import { evaluateTurfSlickness } from '../src/domain/turfSlickness';
import { haversineDistanceKm, evaluatePitchLightningRisk } from '../src/domain/lightningSafety';

describe('⚡ Empirical Challenger Adversarial Stress Test Suite', () => {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. Wind Chill & Feels-Like Continuity & Extremes
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Wind Chill & Feels-Like Engine Invariants', () => {
    it('guarantees calm wind V=0 continuity across all temperatures in FMI formula', () => {
      const temps = [-35, -20, -10, -1.0, 0.0, 5.0, 10.0, 15.0, 20.0, 30.0];
      for (const t of temps) {
        const feels = calculateFmiFeelsLike(t, 0);
        expect(feels).toBe(t);
      }
    });

    it('guarantees epsilon convergence as V -> 0+ with zero jump', () => {
      const temps = [-10.0, 0.0, 10.0];
      for (const t of temps) {
        const feelsEps = calculateFmiFeelsLike(t, 0.0001);
        const feels0 = calculateFmiFeelsLike(t, 0);
        expect(Math.abs(feelsEps - feels0)).toBeLessThan(0.01);
      }
    });

    it('evaluates extreme cold (-35°C, 20 m/s and 30 m/s) with physical monotonicity', () => {
      const fmi20 = calculateFmiFeelsLike(-35.0, 20.0);
      const fmi30 = calculateFmiFeelsLike(-35.0, 30.0);
      const jagti20 = calculateJagtiWindChill(-35.0, 20.0);
      const jagti30 = calculateJagtiWindChill(-35.0, 30.0);

      // FMI feels-like values: -63.8°C at 20 m/s, -67.6°C at 30 m/s
      expect(fmi20).toBe(-63.8);
      expect(fmi30).toBe(-67.6);
      expect(fmi30).toBeLessThan(fmi20); // strictly monotonic

      // JAG/TI wind chill: -58.7°C at 20 m/s, -62.0°C at 30 m/s
      expect(jagti20).toBe(-58.7);
      expect(jagti30).toBe(-62.0);
      expect(jagti30).toBeLessThan(jagti20); // strictly monotonic
    });

    it('demonstrates known physical cooling rate inversion in Siple-Passel (1945) above 25 m/s', () => {
      const siple25 = calculateSiplePasselWindChill(-10.0, 25.0);
      const siple35 = calculateSiplePasselWindChill(-10.0, 35.0);
      // At 25 m/s: coolingRate is maximized. At 35 m/s: formula factor decreases, yielding a warmer value!
      expect(siple35).toBeGreaterThanOrEqual(siple25);
    });

    it('detects step discontinuity in calculateApparentTemperature at 1.33 m/s threshold', () => {
      // In calculateApparentTemperature: windSpeedMs > 1.33 threshold creates step jump
      const app1_33 = calculateApparentTemperature(5.0, 1.33); // 5.0°C (raw air temp)
      const app1_34 = calculateApparentTemperature(5.0, 1.34); // ~0.8°C (FMI feels-like)
      expect(app1_33).toBe(5.0);
      expect(app1_34).toBeLessThan(1.0);
      expect(app1_33 - app1_34).toBeGreaterThan(4.0); // 4.2°C jump across 0.01 m/s!
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Summer Heat Index & Simmer Index
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Summer Heat Index & Simmer Index Invariants', () => {
    it('evaluates extreme heat stress (35°C, 90% RH) correctly in both models', () => {
      const hi = calculateRothfuszHeatIndex(35.0, 90);
      const ssi = calculateSummerSimmerIndex(35.0, 90);

      expect(hi).toBeCloseTo(63.7, 1);
      expect(ssi).toBeCloseTo(52.9, 1);
      expect(hi).toBeGreaterThan(50.0);
      expect(ssi).toBeGreaterThan(45.0);
    });

    it('verifies boundary behavior of Rothfusz heat index at 20.0°C and 40% RH', () => {
      const hiExact = calculateRothfuszHeatIndex(20.0, 40);
      const hiSubTemp = calculateRothfuszHeatIndex(19.99, 40);
      const hiSubRh = calculateRothfuszHeatIndex(20.0, 39.9);

      // Sub-threshold reverts to air temperature
      expect(hiSubTemp).toBe(19.99);
      expect(hiSubRh).toBe(20.0);

      // At boundary, polynomial evaluates to 25.2°C (5.2°C step discontinuity)
      expect(hiExact).toBe(25.2);
    });

    it('verifies smooth continuity of Summer Simmer Index at 14.5°C boundary', () => {
      const ssiBelow = calculateSummerSimmerIndex(14.49, 50);
      const ssiAt = calculateSummerSimmerIndex(14.5, 50);

      expect(ssiBelow).toBe(14.49);
      expect(Math.abs(ssiAt - ssiBelow)).toBeLessThan(0.2); // smooth transition
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Turf Slickness State Machine
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Turf Slickness State Machine Invariants', () => {
    it('verifies strict temperature boundary at -1.0001°C vs -0.9999°C vs exact -1.0000°C', () => {
      const sub1 = evaluateTurfSlickness(-1.0001, 0.0);
      const above1 = evaluateTurfSlickness(-0.9999, 0.0);
      const exact1Dry = evaluateTurfSlickness(-1.0000, 0.0);
      const exact1Rain = evaluateTurfSlickness(-1.0000, 1.0);

      expect(sub1.condition).toBe('frozen');
      expect(sub1.labelFi).toBe('Jäätynyt');

      expect(above1.condition).toBe('dry');
      expect(above1.labelFi).toBe('Kuiva');

      // Exact -1.0000 is not strictly < -1.0
      expect(exact1Dry.condition).toBe('dry');
      expect(exact1Rain.condition).toBe('slick');
    });

    it('verifies strict precipitation boundary at 0.299 vs 0.300 vs 0.301 mm/h', () => {
      const p299 = evaluateTurfSlickness(10.0, 0.299);
      const p300 = evaluateTurfSlickness(10.0, 0.300);
      const p301 = evaluateTurfSlickness(10.0, 0.301);

      expect(p299.condition).toBe('dry');
      expect(p300.condition).toBe('dry'); // <= 0.300 is dry
      expect(p301.condition).toBe('slick'); // > 0.300 is slick
      expect(p301.labelFi).toBe('Liukas');
    });

    it('enforces compound event invariant: freezing rain classifies as frozen (ground hardness dominates)', () => {
      const freezingHeavy = evaluateTurfSlickness(-2.0, 5.0);
      const freezingMarginal = evaluateTurfSlickness(-1.05, 1.5);

      expect(freezingHeavy.condition).toBe('frozen');
      expect(freezingHeavy.labelFi).toBe('Jäätynyt');
      expect(freezingHeavy.cleatRecommendationFi).toContain('TF (turf)');

      expect(freezingMarginal.condition).toBe('frozen');
      expect(freezingMarginal.labelFi).toBe('Jäätynyt');
    });

    it('enforces snow cover dominance over frozen ground and rain slickness', () => {
      const res = evaluateTurfSlickness(-8.0, 2.0, 3.0); // 3 cm snow
      expect(res.condition).toBe('snowy');
      expect(res.labelFi).toBe('Luminen');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Finnish 30/30 Lightning Safety Rule
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Finnish 30/30 Lightning Safety Engine Invariants', () => {
    const venue = { lat: 60.1873, lng: 24.9258 }; // Väiski
    const refTime = new Date('2026-09-12T14:30:00.000Z').getTime();

    it('handles direct hit (0.0 km) without NaN or division by zero', () => {
      const strike = [{ lat: venue.lat, lng: venue.lng, timeIso: new Date(refTime - 2 * 60000).toISOString() }];
      const res = evaluatePitchLightningRisk(venue, strike, refTime, 'Väiski');

      expect(res.status).toBe('danger');
      expect(res.nearestStrikeKm).toBe(0);
      expect(res.suspendMatchRecommended).toBe(true);
      expect(res.alertMessage).toContain('0.0 km');
      expect(res.alertMessage).not.toContain('NaN');
    });

    it('enforces sharp 10.00 km danger threshold boundary (9.99 km vs 10.01 km)', () => {
      const lat9_99 = venue.lat + (9.99 / 111.195);
      const lat10_01 = venue.lat + (10.01 / 111.195);

      const strike9_99 = [{ lat: lat9_99, lng: venue.lng, timeIso: new Date(refTime - 5 * 60000).toISOString() }];
      const strike10_01 = [{ lat: lat10_01, lng: venue.lng, timeIso: new Date(refTime - 5 * 60000).toISOString() }];

      const res9_99 = evaluatePitchLightningRisk(venue, strike9_99, refTime, 'Väiski');
      const res10_01 = evaluatePitchLightningRisk(venue, strike10_01, refTime, 'Väiski');

      expect(res9_99.status).toBe('danger');
      expect(res9_99.suspendMatchRecommended).toBe(true);

      expect(res10_01.status).toBe('watch');
      expect(res10_01.suspendMatchRecommended).toBe(false);
    });

    it('enforces sharp 20.00 km watch threshold boundary (19.99 km vs 20.01 km)', () => {
      const lat19_99 = venue.lat + (19.99 / 111.195);
      const lat20_01 = venue.lat + (20.01 / 111.195);

      const strike19_99 = [{ lat: lat19_99, lng: venue.lng, timeIso: new Date(refTime - 5 * 60000).toISOString() }];
      const strike20_01 = [{ lat: lat20_01, lng: venue.lng, timeIso: new Date(refTime - 5 * 60000).toISOString() }];

      const res19_99 = evaluatePitchLightningRisk(venue, strike19_99, refTime, 'Väiski');
      const res20_01 = evaluatePitchLightningRisk(venue, strike20_01, refTime, 'Väiski');

      expect(res19_99.status).toBe('watch');
      expect(res20_01.status).toBe('clear');
    });

    it('clamps future clock skew timestamps to prevent negative elapsed times and oversized countdowns', () => {
      const futureStrike = [{ lat: venue.lat + 0.02, lng: venue.lng, timeIso: new Date(refTime + 8 * 60000).toISOString() }];
      const res = evaluatePitchLightningRisk(venue, futureStrike, refTime, 'Väiski');

      expect(res.status).toBe('danger');
      expect(res.nearestStrikeMinutesAgo).toBe(0);
      expect(res.resumeCountdownMinutes).toBe(30); // clamped at 30 min ceiling
    });

    it('accurately categorizes fresh strikes (<15 min) vs older (15-60 min) vs dropped (>60 min)', () => {
      const s14m = { lat: venue.lat + 0.02, lng: venue.lng, timeIso: new Date(refTime - 14 * 60000).toISOString() };
      const s15m = { lat: venue.lat + 0.03, lng: venue.lng, timeIso: new Date(refTime - 15 * 60000).toISOString() };
      const s59m = { lat: venue.lat + 0.04, lng: venue.lng, timeIso: new Date(refTime - 59 * 60000).toISOString() };
      const s61m = { lat: venue.lat + 0.05, lng: venue.lng, timeIso: new Date(refTime - 61 * 60000).toISOString() };

      const res = evaluatePitchLightningRisk(venue, [s14m, s15m, s59m, s61m], refTime, 'Väiski');

      const item14m = res.strikes.find((s) => s.lat === s14m.lat);
      const item15m = res.strikes.find((s) => s.lat === s15m.lat);
      const item59m = res.strikes.find((s) => s.lat === s59m.lat);
      const item61m = res.strikes.find((s) => s.lat === s61m.lat);

      expect(item14m?.isFresh).toBe(true);
      expect(item15m?.isFresh).toBe(false);
      expect(item59m?.isFresh).toBe(false);
      expect(item61m).toBeUndefined(); // dropped from tracking
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Haversine Distance: Numerical Stability & Extremes
  // ───────────────────────────────────────────────────────────────────────────
  describe('5. Haversine Distance Stability & Poles', () => {
    it('returns exact 0 for identical coordinates', () => {
      expect(haversineDistanceKm(0, 0, 0, 0)).toBe(0);
      expect(haversineDistanceKm(60.1873, 24.9258, 60.1873, 24.9258)).toBe(0);
    });

    it('converges to 0 distance at the North Pole and South Pole across varying longitudes', () => {
      const dNorth = haversineDistanceKm(90, 0, 90, 120);
      const dSouth = haversineDistanceKm(-90, -30, -90, 150);
      expect(dNorth).toBeLessThan(0.01);
      expect(dSouth).toBeLessThan(0.01);
    });

    it('calculates antipodal distance accurately (~20015.09 km)', () => {
      const dPoles = haversineDistanceKm(90, 0, -90, 0);
      const dEquator = haversineDistanceKm(0, 0, 0, 180);
      const dArbitrary = haversineDistanceKm(45, 10, -45, -170);

      expect(dPoles).toBeCloseTo(20015.09, 0);
      expect(dEquator).toBeCloseTo(20015.09, 0);
      expect(dArbitrary).toBeCloseTo(20015.09, 0);
    });

    it('guarantees numerical stability on antipodal coordinates without producing NaN (clamped a <= 1)', () => {
      // Deterministic antipodal coordinates that previously triggered floating-point a = 1.0000000000000002 > 1.0
      const triggerCoords = [
        { lat: 59.48314840799105, lng: 137.3559650773181, antiLat: -59.48314840799105, antiLng: -42.6440349226819 },
        { lat: 16.041879659059703, lng: -135.5611925299476, antiLat: -16.041879659059703, antiLng: 44.43880747005241 },
        { lat: 1.978333718075362, lng: 35.64181157818598, antiLat: -1.978333718075362, antiLng: -144.35818842181402 },
      ];

      for (const { lat, lng, antiLat, antiLng } of triggerCoords) {
        const d = haversineDistanceKm(lat, lng, antiLat, antiLng);
        // Empirically confirms that clamped Math.sqrt(1 - a) evaluates cleanly without NaN
        expect(Number.isNaN(d)).toBe(false);
        expect(Number.isFinite(d)).toBe(true);
        expect(d).toBeCloseTo(20015.09, 0);
      }
    });

    it('verifies zero NaN occurrences across 1,000 randomized antipodal pairs on the sphere', () => {
      let nanCount = 0;
      const samples = 1000;
      for (let i = 0; i < samples; i++) {
        const lat = Math.random() * 180 - 90;
        const lng = Math.random() * 360 - 180;
        const antiLat = -lat;
        const antiLng = lng > 0 ? lng - 180 : lng + 180;

        const d = haversineDistanceKm(lat, lng, antiLat, antiLng);
        if (Number.isNaN(d) || !Number.isFinite(d)) {
          nanCount++;
        }
      }
      // Confirms numerical stability across the entire sphere with 0 NaNs
      expect(nanCount).toBe(0);
    });

    it('evaluates sub-centimeter micro-distance without numerical underflow', () => {
      const d = haversineDistanceKm(60.1873, 24.9258, 60.18730001, 24.9258);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(d)).toBe(false);
    });
  });
});
