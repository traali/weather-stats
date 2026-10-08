import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isNativeModelContext, registerWeatherWebMCP } from '../src/mcp-app';
import { setupMockDom } from './setupDom';

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf-8');

/** Real FMI responses recorded 2026-10-08. Tests never call opendata.fmi.fi (it made CI flaky). */
const FORECAST_XML = fixture('fmi-forecast-vaiski-2026-10-08T1500Z.xml');
const LIGHTNING_EMPTY_XML = fixture('fmi-lightning-vaiski-empty-2026-10-08.xml');
const KICKOFF = '2026-10-08T15:00:00.000Z';

describe('WebMCP Tri-Mount Registry & Model Context Standards', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url);
        if (u.includes('harmonie')) return new Response(FORECAST_XML, { status: 200 });
        if (u.includes('lightning')) return new Response(LIGHTNING_EMPTY_XML, { status: 200 });
        throw new Error(`unexpected network call in test: ${u}`);
      })
    );
    setupMockDom();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });


  it('does not replace a host that already has registerTool', () => {
    const names: string[] = [];
    const host = {
      registerTool(tool: { name: string }) {
        names.push(tool.name);
      },
    };
    (document as unknown as { modelContext?: unknown }).modelContext = host;
    const registry = registerWeatherWebMCP();
    expect(isNativeModelContext(host)).toBe(true);
    expect(registry).toBeUndefined();
    expect((document as unknown as { modelContext?: unknown }).modelContext).toBe(host);
    expect(navigator.modelContext).toBeUndefined();
    expect(names).toEqual([
      'get_venue_weather_forecast',
      'get_pitch_lightning_risk',
      'get_radar_satellite_layer',
    ]);
  });

  it('tri-mounts ModelContextRegistry on document, navigator, and window', () => {
    const registry = registerWeatherWebMCP();

    expect(registry).toBeDefined();
    expect(document.modelContext).toBe(registry);
    expect(window.modelContext).toBe(registry);
    expect(navigator.modelContext).toBe(registry);
  });

  it('listTools() exposes all 3 required weather tools with JSON schemas', async () => {
    const registry = registerWeatherWebMCP()!;
    const { tools } = await registry.listTools();

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain('get_venue_weather_forecast');
    expect(toolNames).toContain('get_pitch_lightning_risk');
    expect(toolNames).toContain('get_radar_satellite_layer');

    // Inspect get_venue_weather_forecast schema
    const forecastTool = tools.find((t) => t.name === 'get_venue_weather_forecast');
    expect(forecastTool?.readOnlyHint).toBe(true);
    expect(forecastTool?.untrustedContentHint).toBe(false);
    expect(forecastTool?.inputSchema.required).toEqual(['lat', 'lng', 'kickoffTime']);
  });

  it('executeTool runs get_venue_weather_forecast and returns structured domain result', async () => {
    const registry = registerWeatherWebMCP()!;

    const result = (await registry.executeTool('get_venue_weather_forecast', {
      lat: 60.1873,
      lng: 24.9258,
      kickoffTime: KICKOFF,
      venueId: 'vaiski',
    })) as {
      temperatureC: number | null;
      feelsLikeC: number | null;
      available?: boolean;
      turfCondition: string;
      uiResourceUri: string;
    };

    // FMI Harmonie value for Väiski at 15:00Z in the recorded response.
    expect(result.temperatureC).toBe(12.4);
    expect(typeof result.feelsLikeC).toBe('number');
    expect(['dry', 'slick', 'frozen', 'snowy']).toContain(result.turfCondition);
    expect(result.uiResourceUri).toContain('ui://weather/venue-card');
  });

  it('executeTool runs get_pitch_lightning_risk and returns 30/30 safety result', async () => {
    const registry = registerWeatherWebMCP()!;

    const result = (await registry.executeTool('get_pitch_lightning_risk', {
      lat: 60.1873,
      lng: 24.9258,
      perimeterKm: 15,
    })) as {
      status: string;
      suspendMatchRecommended: boolean;
      uiResourceUri: string;
    };

    // FMI answered with no strikes: clear is allowed only because FMI answered.
    expect(result.status).toBe('clear');
    expect(typeof result.suspendMatchRecommended).toBe('boolean');
    expect(result.uiResourceUri).toContain('ui://weather/lightning-radar');
  });

  it('executeTool runs get_radar_satellite_layer and returns animated WMS frames', async () => {
    const registry = registerWeatherWebMCP()!;

    const result = (await registry.executeTool('get_radar_satellite_layer', {
      layer: 'fmi_rain_radar',
      lat: 60.1873,
      lng: 24.9258,
    })) as {
      currentFrameUrl: string;
      animationLoop: unknown[];
      uiResourceUri: string;
    };

    expect(result.currentFrameUrl).toContain('openwms.fmi.fi');
    expect(result.animationLoop.length).toBeGreaterThanOrEqual(3);
    expect(result.uiResourceUri).toContain('ui://weather/radar-drawer');
  });

  it('callTool() formats responses per MCP JSON-RPC protocol with _meta.ui.resourceUri', async () => {
    const registry = registerWeatherWebMCP()!;

    const mcpRes = await registry.callTool({
      name: 'get_venue_weather_forecast',
      arguments: {
        lat: 60.1873,
        lng: 24.9258,
        kickoffTime: KICKOFF,
      },
    });

    expect(mcpRes.content).toBeDefined();
    expect(mcpRes.content[0].type).toBe('text');
    expect(mcpRes._meta?.ui?.resourceUri).toContain('ui://weather/venue-card');
    expect(mcpRes.isError).toBeFalsy();
  });

  it('returns isError: true when calling an unregistered tool', async () => {
    const registry = registerWeatherWebMCP()!;

    const mcpRes = await registry.callTool({
      name: 'unknown_tool',
      arguments: {},
    });

    expect(mcpRes.isError).toBe(true);
    expect(mcpRes.content[0].text).toContain('not found');
  });
});
