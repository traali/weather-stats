import { describe, it, expect } from 'vitest';
import { evaluateTurfSlickness } from '../src/domain/turfSlickness';

describe('Turf Slickness State Machine', () => {
  describe('Frozen Boundary Tests (T < -1.0°C)', () => {
    it('classifies sub-minus-one temperatures as frozen', () => {
      const res = evaluateTurfSlickness(-1.01, 0.0);
      expect(res.condition).toBe('frozen');
      expect(res.labelFi).toBe('Jäätynyt');
      expect(res.cleatRecommendationFi).toContain('TF (turf)');
    });

    it('treats exact -1.0°C with rain as slick (boundary condition)', () => {
      const res = evaluateTurfSlickness(-1.0, 1.5);
      expect(res.condition).toBe('slick');
      expect(res.labelFi).toBe('Liukas');
    });

    it('treats exact -1.0°C without rain as dry', () => {
      const res = evaluateTurfSlickness(-1.0, 0.0);
      expect(res.condition).toBe('dry');
      expect(res.labelFi).toBe('Kuiva');
    });
  });

  describe('Precipitation Slick Boundary Tests (r > 0.3 mm/h)', () => {
    it('classifies precipitation strictly greater than 0.3 mm/h as slick', () => {
      const res = evaluateTurfSlickness(8.0, 0.31);
      expect(res.condition).toBe('slick');
      expect(res.labelFi).toBe('Liukas');
    });

    it('classifies precipitation exactly 0.3 mm/h as dry', () => {
      const res = evaluateTurfSlickness(8.0, 0.3);
      expect(res.condition).toBe('dry');
      expect(res.labelFi).toBe('Kuiva');
    });

    it('classifies heavy rain (5.0 mm/h) as slick', () => {
      const res = evaluateTurfSlickness(14.0, 5.0);
      expect(res.condition).toBe('slick');
      expect(res.labelFi).toBe('Liukas');
      expect(res.cleatRecommendationFi).toContain('märän kelin');
    });
  });

  describe('Snowy Invariant', () => {
    it('classifies pitch with snow cover as snowy', () => {
      const res = evaluateTurfSlickness(-0.5, 0.0, 3.5);
      expect(res.condition).toBe('snowy');
      expect(res.labelFi).toBe('Luminen');
    });
  });

  describe('Degraded/Invalid Inputs Resilience', () => {
    it('falls back safely when inputs are NaN', () => {
      const res = evaluateTurfSlickness(NaN, NaN);
      expect(res.condition).toBe('dry');
      expect(res.labelFi).toBe('Kuiva');
      expect(res.descriptionFi).not.toContain('NaN');
    });
  });
});
