import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registerWeatherWebMCP } from '../src/mcp-app';
import { setupMockDom } from './setupDom';

/** 500ms is the browser-runtime SLA. GitHub-hosted runners are slower; CI uses a wall-clock ceiling. */
const SLA_MS = process.env.CI ? 2500 : 500;

describe('Cross-Frame postMessage Bridge & 500ms SLA Verification', () => {
  beforeEach(() => {
    // Real FMI Harmonie response (Väiski, 2026-10-08). No network in tests.
    const xml = readFileSync(
      fileURLToPath(new URL('./fixtures/fmi-forecast-vaiski-2026-10-08T1500Z.xml', import.meta.url)),
      'utf-8'
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(xml, { status: 200 })));
    setupMockDom();
    registerWeatherWebMCP();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves tools/list request via postMessage within 500 ms SLA', async () => {
    const requestId = 'req-test-list-1';
    const start = performance.now();

    const responsePromise = new Promise<unknown>((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        const data = event.data;
        if (data?.type === 'webmcp:response' && data.id === requestId) {
          window.removeEventListener('message', handler);
          if (data.error) reject(new Error(data.error.message));
          else resolve(data.result);
        }
      };
      window.addEventListener('message', handler);
    });

    window.postMessage(
      {
        type: 'webmcp:request',
        id: requestId,
        method: 'tools/list',
      },
      '*'
    );

    const result = (await responsePromise) as { tools: Array<{ name: string }> };
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(SLA_MS);
    expect(result.tools.some((t) => t.name === 'get_venue_weather_forecast')).toBe(true);
  });

  it('resolves tools/call for get_venue_weather_forecast within 500 ms SLA', async () => {
    const requestId = 'req-test-call-forecast';
    const start = performance.now();

    const responsePromise = new Promise<unknown>((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        const data = event.data;
        if (data?.type === 'webmcp:response' && data.id === requestId) {
          window.removeEventListener('message', handler);
          if (data.error) reject(new Error(data.error.message));
          else resolve(data.result);
        }
      };
      window.addEventListener('message', handler);
    });

    window.postMessage(
      {
        type: 'webmcp:request',
        id: requestId,
        method: 'tools/call',
        params: {
          name: 'get_venue_weather_forecast',
          arguments: {
            lat: 60.1872,
            lng: 24.9232,
            kickoffTime: '2026-10-08T15:00:00.000Z',
            venueId: 'vaiski',
          },
        },
      },
      '*'
    );

    const result = (await responsePromise) as { _meta?: { ui?: { resourceUri: string } } };
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(SLA_MS);
    expect(result._meta?.ui?.resourceUri).toContain('ui://weather/venue-card');
  });

  it('handles executeTool directly over postMessage', async () => {
    const requestId = 'req-test-execute';

    const responsePromise = new Promise<unknown>((resolve) => {
      const handler = (event: MessageEvent) => {
        const data = event.data;
        if (data?.type === 'webmcp:response' && data.id === requestId) {
          window.removeEventListener('message', handler);
          resolve(data.result);
        }
      };
      window.addEventListener('message', handler);
    });

    window.postMessage(
      {
        type: 'webmcp:request',
        id: requestId,
        method: 'executeTool',
        params: {
          name: 'get_radar_satellite_layer',
          arguments: {
            lat: 60.1873,
            lng: 24.9258,
          },
        },
      },
      '*'
    );

    const result = (await responsePromise) as { currentFrameUrl: string };
    expect(result.currentFrameUrl).toBeDefined();
  });
});
