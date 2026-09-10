# 🌦️ Weather Stats & Meteorological Intelligence

Sovereign meteorological microservice and WebMCP agent interface for the Finnish Youth Sports Federation ecosystem.

## 1. Problem
Finnish outdoor youth sports are heavily impacted by rapid weather shifts, freezing turf slickness, and sudden summer thunderstorms, yet coaches and parents lack real-time localized pitch forecasts, lightning safety alerts, and animated precipitation radars directly on their matchday event cards.

## 2. Solution
`weather-stats` is an autonomous sovereign microservice providing high-precision Finnish Meteorological Institute (FMI) weather forecasts, turf traction state calculations, 30/30 rule lightning safety proximity monitoring, and animated WMS radar/satellite viewers. Designed with the Nova liquid glassmorphic protocol, it operates as a standalone web application, an embedded drawer in Pelipäivä, and an autonomous WebMCP agent interface mounted across `document.modelContext`, `navigator.modelContext`, and `window.modelContext` with a sub-500ms cross-frame `postMessage` bridge.

## 3. Architecture
- **Framework & Runtime**: Vite 7, React 19, TypeScript strict mode, TailwindCSS v4 with Nova design tokens.
- **Meteorology Engines**:
  - Continuous FMI "Tuntuu kuin" feels-like equation & Siple-Passel / JAG/TI wind chill formulas.
  - Summer heat index (Rothfusz polynomial & Summer Simmer Index).
  - Dynamic turf slickness state machine (`frozen`, `slick`, `dry`).
  - Finnish 30/30 lightning safety engine with Haversine distance, 10 km danger / 20 km watch thresholds, and fresh strike pulsing indicator math.
  - Zero-mock fallback: on network disconnection or FMI timeout, returns deterministic cached venue observations flagged with `isCacheFallback: true`; never fabricates synthetic weather.
- **WebMCP Tri-Mount Registry**: Registers `get_venue_weather_forecast`, `get_pitch_lightning_risk`, and `get_radar_satellite_layer` on `document.modelContext`, `navigator.modelContext`, and `window.modelContext`.
- **Cross-Frame Bridge**: Bi-directional `postMessage` protocol resolving `webmcp:request` within 500 ms SLA.

## 4. Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run sovereign monastic checks (typecheck + lint + tests)
npm run check

# Run tests
npm test
```

## 5. Attribution
Built by traali.
