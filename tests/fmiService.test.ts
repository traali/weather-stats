import { describe, it, expect } from 'vitest';
import {
  calculateWeatherBbox,
  buildWmsTileUrl,
  getRadarSatelliteLayer,
  fetchVenueWeatherForecast,
  fetchPitchLightningRisk,
} from '../src/services/fmiService';

describe('FMI Service & WMS Layer Projection Invariants', () => {
  const testCoords = { lat: 60.1873, lng: 24.9258 };

  describe('BBOX Projection Math', () => {
    it('applies 1.8 longitude aspect ratio compensation at Finnish 60°N latitude', () => {
      const bbox = calculateWeatherBbox(testCoords, 50);
      const deltaLat = bbox.maxLat - bbox.minLat;
      const deltaLng = bbox.maxLng - bbox.minLng;

      // Expect deltaLng / deltaLat ~= 1.8
      const ratio = deltaLng / deltaLat;
      expect(ratio).toBeCloseTo(1.8, 1);
    });

    it('centers bounding box correctly around venue coordinates', () => {
      const bbox = calculateWeatherBbox(testCoords, 25);
      const centerLat = (bbox.minLat + bbox.maxLat) / 2;
      const centerLng = (bbox.minLng + bbox.maxLng) / 2;

      expect(centerLat).toBeCloseTo(testCoords.lat, 2);
      expect(centerLng).toBeCloseTo(testCoords.lng, 2);
    });
  });

  describe('WMS Tile URL Construction', () => {
    it('generates valid FMI radar GetMap URL with CRS:84 and full ISO timestamp', () => {
      const bbox = { minLng: 24.1, minLat: 59.7, maxLng: 25.7, maxLat: 60.6 };
      const timeIso = '2026-09-12T14:15:00.000Z';
      const url = buildWmsTileUrl('fmi_rain_radar', bbox, timeIso);

      expect(url).toContain('openwms.fmi.fi/geoserver/wms');
      expect(url).toContain('LAYERS=Radar:suomi_dbz_eureffin');
      expect(url).toContain('CRS=CRS:84');
      expect(url).toContain('BBOX=24.1,59.7,25.7,60.6');
      expect(url).toContain('TIME=2026-09-12T14%3A15%3A00.000Z');
    });

    it('generates valid EUMETSAT satellite cloud cover URL', () => {
      const bbox = { minLng: 24.1, minLat: 59.7, maxLng: 25.7, maxLat: 60.6 };
      const url = buildWmsTileUrl('eumetsat_natural', bbox, '2026-09-12T14:00:00.000Z');

      expect(url).toContain('eumetview.eumetsat.int');
      expect(url).toContain('LAYERS=msg_fes:rgb_natural');
    });
  });

  describe('Radar & Satellite Animation Loop Generation', () => {
    it('generates 6 animation frames ending with latest frame', () => {
      const res = getRadarSatelliteLayer({
        layer: 'fmi_rain_radar',
        lat: testCoords.lat,
        lng: testCoords.lng,
        radiusKm: 50,
        frameCount: 6,
      });

      expect(res.animationLoop.length).toBe(6);
      expect(res.animationLoop[res.animationLoop.length - 1].label).toBe('Nyt (viimeisin)');
      expect(res.currentFrameUrl).toBe(res.animationLoop[res.animationLoop.length - 1].wmsUrl);
      expect(res.uiResourceUri).toContain('ui://weather/radar-drawer');
    });

    it('rounds animation timestamps down to 5-minute intervals matching FMI radar cadence', () => {
      const res = getRadarSatelliteLayer({
        lat: testCoords.lat,
        lng: testCoords.lng,
      });

      for (const frame of res.animationLoop) {
        const frameDate = new Date(frame.timestampIso);
        expect(frameDate.getMinutes() % 5).toBe(0);
        expect(frameDate.getSeconds()).toBe(0);
      }
    });
  });

  describe('Zero-Mock Fallback Invariant (Offline Resilience)', () => {
    it('falls back seamlessly to verified cached snapshot on offline network', async () => {
      // Offline / unresolvable address
      const res = await fetchVenueWeatherForecast(
        {
          lat: testCoords.lat,
          lng: testCoords.lng,
          kickoffTime: '2026-09-12T14:00:00.000Z',
          venueId: 'vaiski',
        },
        10 // very low timeout forces fallback
      );

      expect(res.isCacheFallback).toBe(true);
      expect(res.venueId).toBe('vaiski');
      expect(res.temperatureC).toBeGreaterThan(-30);
      expect(res.temperatureC).toBeLessThan(40);
      expect(res.uiResourceUri).toContain('ui://weather/venue-card');
    });

    it('returns deterministic lightning fallback without fabricating fake strikes', async () => {
      const res = await fetchPitchLightningRisk(
        {
          lat: testCoords.lat,
          lng: testCoords.lng,
          perimeterKm: 15,
        },
        10
      );

      expect(res.isCacheFallback).toBe(true);
      expect(res.status).toBe('clear');
      expect(res.strikes.length).toBe(0); // Zero fabricated strikes
    });
  });
});
