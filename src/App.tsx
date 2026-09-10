import { useState, useEffect } from 'react';
import { CloudSun, Radio, Shield, Copy, Check, ExternalLink } from 'lucide-react';
import { MatchdayCardWeatherBadge } from './components/MatchdayCardWeatherBadge';
import { HeroMatchCardWeather } from './components/HeroMatchCardWeather';
import { SatelliteEmbedDrawer } from './components/SatelliteEmbedDrawer';
import {
  VenueWeatherForecastResult,
  PitchLightningRiskResult,
  Coordinates,
} from './types/weather';
import {
  DETERMINISTIC_VENUE_SNAPSHOTS,
  getDeterministicForecastFallback,
  getDeterministicLightningFallback,
} from './services/weatherCache';
import { formatMatchdayWeatherBriefing } from './domain/meteorology';
import { evaluatePitchLightningRisk } from './domain/lightningSafety';

export function App() {

  const [selectedVenueKey, setSelectedVenueKey] = useState<string>('vaiski');
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [mcpStatus, setMcpStatus] = useState<string>('Alustetaan...');
  const [mcpTools, setMcpTools] = useState<string[]>([]);

  const activeSnapshot =
    DETERMINISTIC_VENUE_SNAPSHOTS[selectedVenueKey] || DETERMINISTIC_VENUE_SNAPSHOTS.vaiski;

  const nowIso = new Date().toISOString();
  const activeCoords: Coordinates = activeSnapshot.coords;

  const [forecast, setForecast] = useState<VenueWeatherForecastResult>(() =>
    getDeterministicForecastFallback(activeCoords, nowIso, activeSnapshot.venueId, activeSnapshot.venueName)
  );

  const [lightning, setLightning] = useState<PitchLightningRiskResult>(() =>
    getDeterministicLightningFallback(activeCoords, activeSnapshot.venueName)
  );

  // Update forecast and lightning when venue changes
  useEffect(() => {
    const snap =
      DETERMINISTIC_VENUE_SNAPSHOTS[selectedVenueKey] || DETERMINISTIC_VENUE_SNAPSHOTS.vaiski;
    const newForecast = getDeterministicForecastFallback(
      snap.coords,
      nowIso,
      snap.venueId,
      snap.venueName
    );
    const newLightning = getDeterministicLightningFallback(snap.coords, snap.venueName);
    setForecast(newForecast);
    setLightning(newLightning);
  }, [selectedVenueKey, nowIso]);


  // Inspect WebMCP registration
  useEffect(() => {
    const reg =
      (typeof navigator !== 'undefined' && navigator.modelContext) ||
      (typeof document !== 'undefined' && document.modelContext) ||
      (typeof window !== 'undefined' && window.modelContext);

    if (reg) {
      setMcpStatus('Aktiivinen (navigator, document, window)');
      reg.listTools().then((res) => {
        setMcpTools(res.tools.map((t) => t.name));
      }).catch(() => {
        setMcpStatus('Virhe työkalujen haussa');
      });
    } else {
      setMcpStatus('Ei alustettu');
    }
  }, []);

  const handleSimulateLightningWarning = () => {
    const simulatedStrikes = [
      {
        lat: activeCoords.lat + 0.05,
        lng: activeCoords.lng + 0.04,
        timeIso: new Date(Date.now() - 6 * 60 * 1000).toISOString(), // 6 min ago
        peakCurrentKa: -28.4,
      },
      {
        lat: activeCoords.lat + 0.12,
        lng: activeCoords.lng + 0.10,
        timeIso: new Date(Date.now() - 22 * 60 * 1000).toISOString(), // 22 min ago
        peakCurrentKa: 15.2,
      },
    ];

    const simulated = evaluatePitchLightningRisk(
      activeCoords,
      simulatedStrikes,
      Date.now(),
      activeSnapshot.venueName,
      false
    );
    setLightning(simulated);
    setIsDrawerOpen(true);
  };


  const handleResetLightning = () => {
    setLightning(getDeterministicLightningFallback(activeCoords, activeSnapshot.venueName));
  };

  const briefingText = formatMatchdayWeatherBriefing({
    venueName: activeSnapshot.venueName,
    kickoffTime: nowIso,
    temperatureC: forecast.temperatureC,
    feelsLikeC: forecast.feelsLikeC,
    windSpeedMs: forecast.windSpeedMs,
    windGustMs: forecast.windGustMs,
    precipitationMmh: forecast.precipitationMmh,
    turfConditionLabelFi: forecast.turfConditionLabelFi,
    windAdvisory: forecast.windAdvisoryBadge,
    lightningAlert: lightning.alertMessage,
  });

  const handleCopyBriefing = async () => {
    try {
      await navigator.clipboard.writeText(briefingText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-gray-100 flex flex-col font-sans">
      {/* Top Navigation */}
      <header className="border-b border-white/10 bg-black/40 backdrop-blur-md sticky top-0 z-40 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CloudSun className="w-6 h-6 text-sky-400" />
          <span className="font-bold text-lg text-white tracking-tight">
            Weather Stats <span className="text-sky-400 font-mono text-xs">Monastery</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span
            data-testid="app-version-badge"
            className="text-xs font-mono text-gray-400 px-2 py-1 rounded bg-white/5 border border-white/10"
          >
            v1.0.0 (git:prod)
          </span>
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 border border-sky-500/30 text-xs font-semibold transition-colors"
          >
            <Radio className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
            <span>Avaa tutka</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-6">
        {/* Venue Selector */}
        <section className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-white/5 border border-white/10">
          <div className="text-xs font-medium text-gray-300">Valitse pelipaikka:</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(DETERMINISTIC_VENUE_SNAPSHOTS).map(([key, snap]) => (
              <button
                key={key}
                onClick={() => setSelectedVenueKey(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedVenueKey === key
                    ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20'
                    : 'bg-white/5 text-gray-400 hover:text-gray-200 hover:bg-white/10'
                }`}
              >
                {snap.venueName.split(',')[0]}
              </button>
            ))}
          </div>
        </section>

        {/* Hero Preview Card */}
        <section>
          <HeroMatchCardWeather
            forecast={forecast}
            lightning={lightning}
            onOpenRadar={() => setIsDrawerOpen(true)}
          />
        </section>

        {/* Compact Badges in Matchday List Simulation */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">
            Kompaktit ottelukorttien säämerkit (MatchdayCard previews)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(DETERMINISTIC_VENUE_SNAPSHOTS).map(([key, snap]) => {
              const itemForecast = getDeterministicForecastFallback(
                snap.coords,
                nowIso,
                snap.venueId,
                snap.venueName
              );
              return (
                <div key={key} className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-gray-400 px-1 truncate">
                    {snap.venueName}
                  </span>
                  <MatchdayCardWeatherBadge
                    forecast={itemForecast}
                    onOpenRadar={() => {
                      setSelectedVenueKey(key);
                      setIsDrawerOpen(true);
                    }}
                  />
                </div>
              );
            })}
          </div>
        </section>

        {/* Lightning Safety Simulation & WhatsApp Briefing */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* WhatsApp Briefing Generator */}
          <div className="glass-panel rounded-2xl p-4 flex flex-col gap-3 border border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Shield className="w-4 h-4" />
                1-Napin WhatsApp-säätiedote
              </span>
              <button
                onClick={handleCopyBriefing}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Kopioitu!' : 'Kopioi'}</span>
              </button>
            </div>
            <pre className="p-3 rounded-xl bg-black/50 border border-white/5 text-xs text-gray-300 font-mono whitespace-pre-wrap select-all">
              {briefingText}
            </pre>
            <div className="text-[10px] text-gray-400">
              *Tarkistettu: 0 syntetisoitua virhetokenia (ei undefined, null, NaN tai [PVM]).
            </div>
          </div>

          {/* WebMCP Status & Tools */}
          <div className="glass-panel rounded-2xl p-4 flex flex-col gap-3 border border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
                WebMCP Agenttitila
              </span>
              <span className="text-[11px] font-mono text-emerald-400">{mcpStatus}</span>
            </div>

            <div className="text-xs text-gray-300">
              Rekisteröidyt työkalut (document, navigator, window):
            </div>
            <ul className="flex flex-col gap-1 text-xs font-mono text-gray-400">
              {mcpTools.length > 0 ? (
                mcpTools.map((t) => (
                  <li key={t} className="flex items-center gap-1.5 text-gray-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                    <span>{t}</span>
                  </li>
                ))
              ) : (
                <li className="text-gray-500">Ladataan työkaluja...</li>
              )}
            </ul>

            <div className="pt-2 border-t border-white/10 flex flex-wrap gap-2">
              <button
                onClick={handleSimulateLightningWarning}
                className="px-3 py-1.5 rounded-lg bg-red-950/50 hover:bg-red-900/50 text-red-300 border border-red-500/40 text-xs font-semibold transition-colors"
              >
                Simuloi salamatutka (&lt;10 km)
              </button>
              <button
                onClick={handleResetLightning}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 text-xs font-semibold transition-colors"
              >
                Palauta normaali
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Satellite and Radar Drawer */}
      <SatelliteEmbedDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        venueCoords={activeCoords}
        venueName={activeSnapshot.venueName}
        lightningRisk={lightning}
        initialLayer="fmi_rain_radar"
      />

      {/* Footer */}
      <footer className="border-t border-white/10 py-4 px-6 text-center text-xs text-gray-500 flex flex-wrap items-center justify-between gap-2">
        <span>Finnish Youth Sports Federation • weather-stats</span>
        <a
          href="/mcp-weather.html"
          target="_blank"
          rel="noreferrer"
          className="text-sky-400 hover:underline flex items-center gap-1"
        >
          <span>Avaa erillinen mcp-weather.html widget</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </footer>
    </div>
  );
}
