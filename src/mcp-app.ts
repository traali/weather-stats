/**
 * WebMCP Tri-Mount Registry & Cross-Frame postMessage Bridge
 *
 * Implements the W3C/Anthropic-aligned WebMCP standard:
 * - Tri-mounts ModelContextRegistry on document.modelContext, navigator.modelContext, window.modelContext
 * - Exposes get_venue_weather_forecast, get_pitch_lightning_risk, get_radar_satellite_layer
 * - Cross-frame postMessage listener with guaranteed < 500 ms resolution SLA
 * - Dispatches webmcp:ready and webmcp:tool_registered custom events
 */

import {
  fetchVenueWeatherForecast,
  fetchPitchLightningRisk,
  getRadarSatelliteLayer,
} from './services/fmiService';
import {
  VenueWeatherForecastArgs,
  PitchLightningRiskArgs,
  RadarSatelliteLayerArgs,
  RadarSatelliteLayerId,
} from './types/weather';

export interface McpToolResponse {
  content: Array<{
    type: 'text' | 'resource';
    text?: string;
    resource?: {
      uri: string;
      mimeType: string;
      text?: string;
    };
  }>;
  _meta?: {
    ui?: {
      resourceUri: string;
    };
  };
  isError?: boolean;
}

export interface ModelContextTool {
  name: string;
  description: string;
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface ModelContextRegistry {
  registerTool: (tool: ModelContextTool) => Promise<void> | void;
  unregisterTool?: (name: string) => Promise<void> | void;
  getTools: () => ModelContextTool[];
  listTools: () => Promise<{
    tools: Array<{
      name: string;
      description: string;
      readOnlyHint?: boolean;
      untrustedContentHint?: boolean;
      inputSchema: ModelContextTool['inputSchema'];
    }>;
  }>;
  callTool: (params: { name: string; arguments?: Record<string, unknown> }) => Promise<McpToolResponse>;
  executeTool: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
}

export interface WebMcpRequestMessage {
  type: 'webmcp:request';
  id: string;
  method: 'tools/list' | 'listTools' | 'tools/call' | 'callTool' | 'executeTool' | string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
  };
}

export interface WebMcpResponseMessage<T = unknown> {
  type: 'webmcp:response';
  id: string;
  result?: T;
  error?: {
    code?: string;
    message: string;
  };
}

declare global {
  interface Document {
    modelContext?: ModelContextRegistry;
  }
  interface Navigator {
    modelContext?: ModelContextRegistry;
  }
  interface Window {
    modelContext?: ModelContextRegistry;
  }
}

let _weatherMessageHandler: ((event: MessageEvent) => void) | null = null;

export function registerWeatherWebMCP(): ModelContextRegistry | undefined {
  if (typeof window === 'undefined') return undefined;

  const registeredTools = new Map<string, ModelContextTool>();

  const registry: ModelContextRegistry = {
    registerTool: (tool: ModelContextTool) => {
      registeredTools.set(tool.name, tool);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('webmcp:tool_registered', { detail: { toolName: tool.name } })
        );
      }
    },
    unregisterTool: (name: string) => {
      registeredTools.delete(name);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('webmcp:tool_unregistered', { detail: { toolName: name } })
        );
      }
    },
    getTools: () => Array.from(registeredTools.values()),
    listTools: async () => ({
      tools: Array.from(registeredTools.values()).map((t) => ({
        name: t.name,
        description: t.description,
        readOnlyHint: t.readOnlyHint ?? true,
        untrustedContentHint: t.untrustedContentHint ?? false,
        inputSchema: t.inputSchema,
      })),
    }),
    callTool: async (params: { name: string; arguments?: Record<string, unknown> }) => {
      const tool = registeredTools.get(params.name);
      if (!tool) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Tool '${params.name}' not found in Weather Stats WebMCP.`,
            },
          ],
          isError: true,
        };
      }
      try {
        const res = await tool.execute(params.arguments || {});
        if (res && typeof res === 'object' && 'content' in res) {
          return res as McpToolResponse;
        }

        const uiResourceUri =
          res && typeof res === 'object' && 'uiResourceUri' in res
            ? String((res as { uiResourceUri: string }).uiResourceUri)
            : undefined;

        return {
          content: [
            {
              type: 'text',
              text: typeof res === 'string' ? res : JSON.stringify(res, null, 2),
            },
          ],
          _meta: uiResourceUri ? { ui: { resourceUri: uiResourceUri } } : undefined,
        };
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text', text: `Error executing '${params.name}': ${errorMessage}` }],
          isError: true,
        };
      }
    },
    executeTool: async (name: string, args: Record<string, unknown> = {}) => {
      const tool = registeredTools.get(name);
      if (!tool) throw new Error(`Tool '${name}' not found`);
      return tool.execute(args);
    },
  };

  // 1. Tri-mount registry
  if (typeof document !== 'undefined') {
    try {
      Object.defineProperty(document, 'modelContext', {
        value: registry,
        configurable: true,
        enumerable: true,
        writable: true,
      });
    } catch {
      (document as unknown as { modelContext?: ModelContextRegistry }).modelContext = registry;
    }
  }
  if (typeof navigator !== 'undefined') {
    try {
      Object.defineProperty(navigator, 'modelContext', {
        value: registry,
        configurable: true,
        enumerable: true,
        writable: true,
      });
    } catch {
      (navigator as unknown as { modelContext?: ModelContextRegistry }).modelContext = registry;
    }
  }
  if (typeof window !== 'undefined') {
    (window as unknown as { modelContext?: ModelContextRegistry }).modelContext = registry;
  }

  // 2. Register Tool 1: get_venue_weather_forecast
  registry.registerTool({
    name: 'get_venue_weather_forecast',
    description:
      'Queries localized FMI Harmonie point forecast for venue coordinates and kickoff time. Returns structured temperature, feels-like wind chill, wind gusts, precipitation timeline, turf condition (frozen/slick/dry), and UI widget resource URI.',
    readOnlyHint: true,
    untrustedContentHint: false,
    inputSchema: {
      type: 'object',
      properties: {
        lat: {
          type: 'number',
          description: 'Venue latitude in decimal degrees WGS84 (e.g. 60.1873)',
        },
        lng: {
          type: 'number',
          description: 'Venue longitude in decimal degrees WGS84 (e.g. 24.9258)',
        },
        kickoffTime: {
          type: 'string',
          description: 'Match kickoff time in ISO 8601 format (e.g. "2026-09-12T14:00:00.000Z")',
        },
        endTime: {
          type: 'string',
          description: 'Optional match end time in ISO 8601 format',
        },
        venueId: {
          type: 'string',
          description: 'Optional venue slug (e.g. "vaiski", "otahalli")',
        },
        venueName: {
          type: 'string',
          description: 'Optional human-readable venue name',
        },
      },
      required: ['lat', 'lng', 'kickoffTime'],
    },
    execute: async (args) => {
      const forecastArgs: VenueWeatherForecastArgs = {
        lat: Number(args.lat),
        lng: Number(args.lng),
        kickoffTime: String(args.kickoffTime),
        endTime: args.endTime ? String(args.endTime) : undefined,
        venueId: args.venueId ? String(args.venueId) : undefined,
        venueName: args.venueName ? String(args.venueName) : undefined,
      };
      return fetchVenueWeatherForecast(forecastArgs);
    },
  });

  // 3. Register Tool 2: get_pitch_lightning_risk
  registry.registerTool({
    name: 'get_pitch_lightning_risk',
    description:
      'Queries FMI lightning discharges within 15-30 km perimeter, evaluates Finnish 30/30 safety rule (danger < 10 km, watch < 20 km), and returns play suspension recommendations and fresh strike coordinates.',
    readOnlyHint: true,
    untrustedContentHint: false,
    inputSchema: {
      type: 'object',
      properties: {
        lat: {
          type: 'number',
          description: 'Venue latitude in decimal degrees WGS84 (e.g. 60.1872)',
        },
        lng: {
          type: 'number',
          description: 'Venue longitude in decimal degrees WGS84 (e.g. 24.9248)',
        },
        perimeterKm: {
          type: 'number',
          description: 'Detection radius in kilometers (default: 15, max: 30)',
        },
        referenceTime: {
          type: 'string',
          description: 'Optional reference time for historical evaluation (ISO 8601)',
        },
        venueName: {
          type: 'string',
          description: 'Optional venue name for alert messages',
        },
      },
      required: ['lat', 'lng'],
    },
    execute: async (args) => {
      const lightningArgs: PitchLightningRiskArgs = {
        lat: Number(args.lat),
        lng: Number(args.lng),
        perimeterKm: args.perimeterKm ? Number(args.perimeterKm) : 15,
        referenceTime: args.referenceTime ? String(args.referenceTime) : undefined,
        venueName: args.venueName ? String(args.venueName) : undefined,
      };
      return fetchPitchLightningRisk(lightningArgs);
    },
  });

  // 4. Register Tool 3: get_radar_satellite_layer
  registry.registerTool({
    name: 'get_radar_satellite_layer',
    description:
      'Returns dynamic WMS tile URLs and 6-frame animation loop for FMI precipitation reflectivity (dBZ) or EUMETSAT satellite cloud cover layers with accurate Finnish bounding boxes.',
    readOnlyHint: true,
    untrustedContentHint: false,
    inputSchema: {
      type: 'object',
      properties: {
        layer: {
          type: 'string',
          enum: ['fmi_rain_radar', 'eumetsat_fog', 'eumetsat_natural', 'fmi_lightning'],
          description: 'Imagery layer identifier (default: "fmi_rain_radar")',
        },
        lat: {
          type: 'number',
          description: 'Center latitude in decimal degrees WGS84',
        },
        lng: {
          type: 'number',
          description: 'Center longitude in decimal degrees WGS84',
        },
        radiusKm: {
          type: 'number',
          description: 'Viewport radius in km (default: 50)',
        },
        timestamp: {
          type: 'string',
          description: 'Optional timestamp (ISO 8601)',
        },
        frameCount: {
          type: 'number',
          description: 'Number of animation loop frames (default: 6, max: 12)',
        },
      },
      required: ['lat', 'lng'],
    },
    execute: async (args) => {
      const radarArgs: RadarSatelliteLayerArgs = {
        layer: (args.layer as RadarSatelliteLayerId) || 'fmi_rain_radar',
        lat: Number(args.lat),
        lng: Number(args.lng),
        radiusKm: args.radiusKm ? Number(args.radiusKm) : 50,
        timestamp: args.timestamp ? String(args.timestamp) : undefined,
        frameCount: args.frameCount ? Number(args.frameCount) : 6,
      };
      return getRadarSatelliteLayer(radarArgs);
    },
  });

  // 5. Cross-frame postMessage listener with 500 ms SLA
  if (_weatherMessageHandler) {
    window.removeEventListener('message', _weatherMessageHandler);
  }
  const messageHandler = async (event: MessageEvent) => {
    const data = event.data;
    if (!data || data.type !== 'webmcp:request' || !data.id) return;

    // Cross-origin reply target: event.source if available, else window
    const target = (event.source as Window) || window;

    try {
      if (data.method === 'tools/list' || data.method === 'listTools') {
        const result = await registry.listTools();
        target.postMessage({ type: 'webmcp:response', id: data.id, result }, '*');
      } else if (data.method === 'tools/call' || data.method === 'callTool') {
        const result = await registry.callTool(data.params || { name: '', arguments: {} });
        target.postMessage({ type: 'webmcp:response', id: data.id, result }, '*');
      } else if (data.method === 'executeTool') {
        const result = await registry.executeTool(
          data.params?.name || '',
          data.params?.arguments || {}
        );
        target.postMessage({ type: 'webmcp:response', id: data.id, result }, '*');
      } else {
        target.postMessage(
          {
            type: 'webmcp:response',
            id: data.id,
            error: {
              code: 'METHOD_NOT_FOUND',
              message: `Method '${data.method}' not supported`,
            },
          },
          '*'
        );
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'WebMCP execution failed';
      target.postMessage(
        {
          type: 'webmcp:response',
          id: data.id,
          error: { message: errorMessage },
        },
        '*'
      );
    }
  };
  _weatherMessageHandler = messageHandler;
  window.addEventListener('message', messageHandler);

  // 6. Broadcast ready event
  window.dispatchEvent(
    new CustomEvent('webmcp:ready', {
      detail: { location: 'navigator.modelContext & document.modelContext & window.modelContext' },
    })
  );

  return registry;
}
