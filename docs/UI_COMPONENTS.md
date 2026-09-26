# weather-stats UI components

Status: **component catalog 2026-09-26**. Every file under `src/components/`. One screen: `src/App.tsx`.

Job: FMI weather, pitch grip, and the Finnish 30/30 lightning rule for a venue Pelipäivä can embed. Never invent a strike or a temperature. A cache hit is marked `isCacheFallback`.

## Screen (`App.tsx`)

| Element | Why |
|---|---|
| Valitse pelipaikka | Picks a venue snapshot. The hero and the badges follow that venue |
| `HeroMatchCardWeather` | The big card |
| Kompaktit ottelukorttien säämerkit | One `MatchdayCardWeatherBadge` per snapshot, so the list chip can be seen without Pelipäivä |
| Avaa erillinen mcp-weather.html widget | Standalone tool page. Not a second forecast |

## Components

| File | Mounted by | What the parent sees | Why |
|---|---|---|---|
| `HeroMatchCardWeather.tsx` | App | SALAMAVAARA under 10 km, Ukkosvahti under 20 km, or Sää turvallinen. Kenttä, Tuuli / Puuska, Sade-ennuste, Huomio. Button opens the radar | The decision a parent needs before leaving |
| `MatchdayCardWeatherBadge.tsx` | App | Compact chip for a match card | Same facts, less space. Pelipäivä has its own badge. This one is the reference |
| `SatelliteEmbedDrawer.tsx` | App | FMI live image, SALAMAVAARA (30/30-sääntö), Ukkosvahti | The drawer. Hosts the two pieces below |
| `RadarPlayer.tsx` | Drawer | Tutkakuva, or Ladataan tutkakuvaa | Playback. No frame means loading, not clear sky |
| `LightningMapCircle.tsx` | Drawer | Strike rings, 15–60 min history | Distance for the 30/30 rule. Do not draw a ring with no strike |

## What not to "improve"

- Do not fabricate lightning to make the danger state visible.
- Do not merge this badge into Pelipäivä by copying markup. Pelipäivä already has `MatchdayCardWeatherBadge`.
- WebMCP tools stay on `document.modelContext`. Do not replace a native host.
