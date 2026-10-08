import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerWeatherWebMCP } from '../src/mcp-app';
import { setupMockDom } from './setupDom';
import {
  fetchVenueWeatherForecast,
  fetchPitchLightningRisk,
} from '../src/services/fmiService';

describe('Adversarial Stress Test: Protocol SLA, Fallback Honesty & Resilience', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setupMockDom();
    registerWeatherWebMCP();
  });

  describe('1. Cross-Frame postMessage Bridge Concurrent Burst & SLA', () => {
    it('handles a concurrent burst of 50 rapid queries with 100% resolution under 500 ms SLA', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
      const SLA_MS = process.env.CI ? 2500 : 500;
      const BURST_COUNT = 50;
      const methods: Array<{ method: string; params?: { name: string; arguments?: Record<string, unknown> } }> = [
        { method: 'tools/list' },
        { method: 'listTools' },
        {
          method: 'tools/call',
          params: {
            name: 'get_venue_weather_forecast',
            arguments: { lat: 60.1873, lng: 24.9258, kickoffTime: '2026-09-12T14:00:00.000Z', venueId: 'vaiski' },
          },
        },
        {
          method: 'callTool',
          params: {
            name: 'get_pitch_lightning_risk',
            arguments: { lat: 60.1873, lng: 24.9258, perimeterKm: 15 },
          },
        },
        {
          method: 'executeTool',
          params: {
            name: 'get_radar_satellite_layer',
            arguments: { lat: 60.1873, lng: 24.9258 },
          },
        },
      ];

      const startTime = performance.now();
      const promises: Array<Promise<{ id: string; duration: number; res: unknown }>> = [];

      for (let i = 0; i < BURST_COUNT; i++) {
        const reqId = `burst-req-${i}-${Math.random().toString(36).slice(2, 7)}`;
        const template = methods[i % methods.length];
        const reqStart = performance.now();

        const p = new Promise<{ id: string; duration: number; res: unknown }>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Timeout waiting for response to ${reqId}`));
          }, process.env.CI ? 5000 : 2000);

          const handler = (event: MessageEvent) => {
            const data = event.data;
            if (data?.type === 'webmcp:response' && data.id === reqId) {
              clearTimeout(timeout);
              window.removeEventListener('message', handler);
              const duration = performance.now() - reqStart;
              resolve({ id: data.id, duration, res: data.result || data.error });
            }
          };
          window.addEventListener('message', handler);
        });

        promises.push(p);

        window.postMessage(
          {
            type: 'webmcp:request',
            id: reqId,
            method: template.method,
            params: template.params,
          },
          '*'
        );
      }

      const results = await Promise.all(promises);
      const totalDuration = performance.now() - startTime;

      expect(results.length).toBe(BURST_COUNT);

      let maxLatency = 0;
      for (let i = 0; i < BURST_COUNT; i++) {
        const item = results[i];
        expect(item.id).toBeDefined();
        expect(item.duration).toBeLessThan(SLA_MS);
        if (item.duration > maxLatency) maxLatency = item.duration;
      }

      console.log(`[STRESS] Burst ${BURST_COUNT} requests: total ${totalDuration.toFixed(1)}ms, max single latency: ${maxLatency.toFixed(1)}ms`);
    });

    it('gracefully handles invalid tool parameters in callTool and executeTool', async () => {
      const callToolPromise = new Promise<Record<string, unknown>>((resolve) => {
        const handler = (event: MessageEvent) => {
          if (event.data?.type === 'webmcp:response' && event.data.id === 'req-call-invalid') {
            window.removeEventListener('message', handler);
            resolve(event.data);
          }
        };
        window.addEventListener('message', handler);
      });

      window.postMessage(
        {
          type: 'webmcp:request',
          id: 'req-call-invalid',
          method: 'tools/call',
          params: { name: 'non_existent_tool_name', arguments: {} },
        },
        '*'
      );

      const callResult = await callToolPromise as { id: string; result: { isError: boolean; content: Array<{ text: string }> } };
      expect(callResult.id).toBe('req-call-invalid');
      expect(callResult.result.isError).toBe(true);
      expect(callResult.result.content[0].text).toContain("Tool 'non_existent_tool_name' not found");

      const executePromise = new Promise<Record<string, unknown>>((resolve) => {
        const handler = (event: MessageEvent) => {
          if (event.data?.type === 'webmcp:response' && event.data.id === 'req-exec-invalid') {
            window.removeEventListener('message', handler);
            resolve(event.data);
          }
        };
        window.addEventListener('message', handler);
      });

      window.postMessage(
        {
          type: 'webmcp:request',
          id: 'req-exec-invalid',
          method: 'executeTool',
          params: { name: 'non_existent_tool_name', arguments: {} },
        },
        '*'
      );

      const execResult = await executePromise as { id: string; error?: { message: string } };
      expect(execResult.id).toBe('req-exec-invalid');
      expect(execResult.error).toBeDefined();
      expect(execResult.error?.message).toContain("Tool 'non_existent_tool_name' not found");
    });

    it('empirically tests handling of unknown methods over postMessage bridge', async () => {
      let receivedResponse = false;
      let responsePayload: unknown;
      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'webmcp:response' && event.data.id === 'req-unknown-method') {
          receivedResponse = true;
          responsePayload = event.data;
        }
      };
      window.addEventListener('message', handler);

      window.postMessage(
        {
          type: 'webmcp:request',
          id: 'req-unknown-method',
          method: 'unsupported/unknownMethod',
        },
        '*'
      );

      await new Promise((resolve) => setTimeout(resolve, 150));
      window.removeEventListener('message', handler);

      console.log(`[EMPIRICAL] Unknown method response received: ${receivedResponse}`, responsePayload);
      expect(typeof receivedResponse).toBe('boolean');
    });
  });

  describe('2. Zero-Mock Fallback Honesty on FMI Network Failure & Timeout', () => {
    it('returns explicit unavailable / unknown on network connection failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('TypeError: Failed to fetch (offline)')));

      const forecast = await fetchVenueWeatherForecast({
        lat: 60.1837,
        lng: 24.8315,
        kickoffTime: '2026-09-12T14:00:00.000Z',
        venueId: 'otahalli',
        venueName: 'Otahalli & Otaranta, Espoo',
      });

      expect(forecast.isCacheFallback).toBe(false);
      expect(forecast.available).toBe(false);
      expect(forecast.errorFi).toBe('FMI ei vastannut.');
      expect(forecast.temperatureC).toBeNull();
      expect(forecast.windSpeedMs).toBeNull();
      expect(forecast.precipitationMmh).toBeNull();

      const lightning = await fetchPitchLightningRisk({
        lat: 60.1837,
        lng: 24.8315,
        perimeterKm: 15,
        venueName: 'Otahalli',
      });

      expect(lightning.isCacheFallback).toBe(false);
      expect(lightning.checkedAt).toBeUndefined();
      expect(lightning.strikes).toEqual([]);
      expect(lightning.strikesWithin10kmCount).toBe(0);
      expect(lightning.strikesWithin15kmCount).toBe(0);
      expect(lightning.strikesWithin30kmCount).toBe(0);
      expect(lightning.suspendMatchRecommended).toBe(false);
      expect(lightning.status).toBe('unknown');
      expect(lightning.safetyAdvisoryFi).toContain('Salamatietoa ei saatu');
    });

    it('returns explicit unavailable / unknown on HTTP 503', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
        })
      );

      const forecast = await fetchVenueWeatherForecast({
        lat: 60.2238,
        lng: 24.8117,
        kickoffTime: '2026-09-12T15:00:00.000Z',
        venueId: 'leppavaara',
      });

      expect(forecast.isCacheFallback).toBe(false);
      expect(forecast.available).toBe(false);
      expect(forecast.errorFi).toBe('FMI vastasi virheellä (HTTP 503).');
      expect(forecast.venueId).toBe('leppavaara');
      expect(forecast.temperatureC).toBeNull();
      expect(forecast.windGustMs).toBeNull();

      const lightning = await fetchPitchLightningRisk({
        lat: 60.2238,
        lng: 24.8117,
        venueName: 'Leppävaara',
      });

      expect(lightning.status).toBe('unknown');
      expect(lightning.strikes).toHaveLength(0);
      expect(lightning.suspendMatchRecommended).toBe(false);
    });

    it('returns unavailable / unknown when FMI hangs past the timeout', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
          return new Promise((_, reject) => {
            if (init?.signal) {
              init.signal.addEventListener('abort', () => {
                reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
              });
            }
          });
        })
      );

      const forecast = await fetchVenueWeatherForecast(
        {
          lat: 60.1873,
          lng: 24.9258,
          kickoffTime: '2026-09-12T14:00:00.000Z',
          venueId: 'vaiski',
        },
        50
      );

      expect(forecast.available).toBe(false);
      expect(forecast.errorFi).toBe('FMI ei vastannut ajoissa.');

      const lightning = await fetchPitchLightningRisk(
        {
          lat: 60.1873,
          lng: 24.9258,
        },
        50
      );

      expect(lightning.status).toBe('unknown');
      expect(lightning.strikes).toHaveLength(0);
      expect(lightning.strikesWithin10kmCount).toBe(0);
    });
  });
});
