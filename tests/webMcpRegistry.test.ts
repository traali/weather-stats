import { describe, it, expect, beforeEach } from 'vitest';
import { registerWeatherWebMCP } from '../src/mcp-app';
import { setupMockDom } from './setupDom';

describe('WebMCP Tri-Mount Registry & Model Context Standards', () => {
  beforeEach(() => {
    setupMockDom();
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
      kickoffTime: '2026-09-12T14:00:00.000Z',
      venueId: 'vaiski',
    })) as {
      temperatureC: number;
      feelsLikeC: number;
      turfCondition: string;
      uiResourceUri: string;
    };

    expect(typeof result.temperatureC).toBe('number');
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

    expect(['clear', 'watch', 'danger']).toContain(result.status);
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
        kickoffTime: '2026-09-12T14:00:00.000Z',
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
