import { useState, useEffect, useCallback } from 'react';
import { CloudSun, Radio, Shield, Copy, Check, ExternalLink, RefreshCw } from 'lucide-react';
import { HeroMatchCardWeather } from './components/HeroMatchCardWeather';
import { ObservationCard } from './components/ObservationCard';
import { SatelliteEmbedDrawer } from './components/SatelliteEmbedDrawer';
import {
  VenueWeatherForecastResult,
  VenueObservationResult,
  PitchLightningRiskResult,
} from './types/weather';
import { VENUES, unavailableForecast } from './services/weatherCache';
import {
  fetchPitchLightningRisk,
  fetchVenueObservation,
  fetchVenueWeatherForecast,
} from './services/fmiService';
import { formatMatchdayWeatherBriefing } from './domain/meteorology';
import { unknownLightningRisk } from './domain/lightningSafety';
import { formatHelsinkiTime, helsinkiDateOf, helsinkiLocalToIso } from './domain/helsinkiTime';

/** Reads ?paikka=lauttasaari&klo=18:00 (also ?venue=…). */
function readInitialParams(): { venueKey: string; klo: string } {
  if (typeof window === 'undefined') return { venueKey: 'vaiski', klo: '' };
  const params = new URLSearchParams(window.location.search);
  const venue = (params.get('paikka') || params.get('venue') || '').toLowerCase();
  const klo = params.get('klo') || '';
  return {
    venueKey: venue && VENUES[venue] ? venue : 'vaiski',
    klo: /^\d{1,2}[:.]\d{2}$/.test(klo) ? klo.replace('.', ':').padStart(5, '0') : '',
  };
}

export function App() {
  const initial = readInitialParams();
  const [selectedVenueKey, setSelectedVenueKey] = useState<string>(initial.venueKey);
  /** '' = now, otherwise today's kickoff "HH:MM" in Helsinki time */
  const [kickoffHm, setKickoffHm] = useState<string>(initial.klo);
  const [refreshTick, setRefreshTick] = useState(0);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [mcpStatus, setMcpStatus] = useState<string>('Alustetaan...');
  const [mcpTools, setMcpTools] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const activeSnapshot = VENUES[selectedVenueKey] || VENUES.vaiski;
  const activeCoords = activeSnapshot.coords;

  const [kickoffIso, setKickoffIso] = useState(() => new Date().toISOString());
  const [forecast, setForecast] = useState<VenueWeatherForecastResult>(() =>
    unavailableForecast(activeCoords, new Date().toISOString(), activeSnapshot.venueId, activeSnapshot.venueName, 'Haetaan…')
  );
  const [observation, setObservation] = useState<VenueObservationResult | null>(null);
  const [lightning, setLightning] = useState<PitchLightningRiskResult>(() =>
    unknownLightningRisk(activeCoords, activeSnapshot.venueName, 'Tarkistetaan.')
  );

  useEffect(() => {
    const snap = VENUES[selectedVenueKey] || VENUES.vaiski;
    let cancel = false;
    const nowMs = Date.now();
    const kickoff = (kickoffHm && helsinkiLocalToIso(helsinkiDateOf(nowMs), kickoffHm)) || new Date(nowMs).toISOString();
    setKickoffIso(kickoff);
    setLoading(true);
    setObservation(null);

    // Every refresh starts from "unknown": the previous venue's or previous minute's values are never kept.
    setForecast(unavailableForecast(snap.coords, kickoff, snap.venueId, snap.venueName, 'Haetaan…'));
    setLightning(unknownLightningRisk(snap.coords, snap.venueName, 'Tarkistetaan.'));

    Promise.all([
      fetchVenueWeatherForecast({
        lat: snap.coords.lat,
        lng: snap.coords.lng,
        kickoffTime: kickoff,
        venueId: snap.venueId,
        venueName: snap.venueName,
      }),
      fetchVenueObservation({ lat: snap.coords.lat, lng: snap.coords.lng, venueName: snap.venueName }),
      fetchPitchLightningRisk({ lat: snap.coords.lat, lng: snap.coords.lng, venueName: snap.venueName }),
    ]).then(([nextForecast, nextObservation, nextLightning]) => {
      if (cancel) return;
      setForecast(nextForecast);
      setObservation(nextObservation);
      setLightning(nextLightning);
      setLoading(false);
    });

    return () => {
      cancel = true;
    };
  }, [selectedVenueKey, kickoffHm, refreshTick]);

  // Keep the URL shareable: ?paikka=…&klo=…
  useEffect(() => {
    if (typeof window === 'undefined' || !window.history?.replaceState) return;
    const params = new URLSearchParams(window.location.search);
    params.set('paikka', selectedVenueKey);
    if (kickoffHm) params.set('klo', kickoffHm);
    else params.delete('klo');
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }, [selectedVenueKey, kickoffHm]);

  // Inspect WebMCP registration
  useEffect(() => {
    const reg =
      (typeof navigator !== 'undefined' && navigator.modelContext) ||
      (typeof document !== 'undefined' && document.modelContext) ||
      (typeof window !== 'undefined' && window.modelContext);

    if (reg) {
      setMcpStatus('Aktiivinen');
      reg.listTools().then((res) => {
        setMcpTools(res.tools.map((t) => t.name));
      }).catch(() => {
        setMcpStatus('Virhe työkalujen haussa');
      });
    } else {
      setMcpStatus('Ei alustettu');
    }
  }, []);

  const refresh = useCallback(() => setRefreshTick((n) => n + 1), []);

  const lightningLine =
    lightning.status === 'danger' || lightning.status === 'watch'
      ? lightning.alertMessage
      : lightning.status === 'clear'
      ? 'Salamat: ei havaintoja 20 km säteellä (FMI)'
      : 'Salamatietoa ei saatu';

  const briefingText = loading
    ? 'Haetaan FMI:stä…'
    : forecast.available
    ? formatMatchdayWeatherBriefing({
        venueName: activeSnapshot.venueName,
        kickoffTime: kickoffIso,
        temperatureC: forecast.temperatureC,
        feelsLikeC: forecast.feelsLikeC,
        windSpeedMs: forecast.windSpeedMs,
        windGustMs: forecast.windGustMs,
        precipitationMmh: forecast.precipitationMmh,
        turfConditionLabelFi: forecast.turfConditionLabelFi,
        windAdvisory: forecast.windAdvisoryBadge,
        lightningAlert: lightningLine,
      })
    : `🌦️ SÄÄTIEDOTE — ${activeSnapshot.venueName}\nEnnustetta ei saatu: ${forecast.errorFi || 'FMI ei vastannut.'}\n• ${lightningLine}`;

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
      <header className="border-b border-white/10 bg-black/40 backdrop-blur-md sticky top-0 z-40 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CloudSun className="w-6 h-6 text-sky-400" />
          <span className="font-bold text-lg text-white tracking-tight">Sää kentällä</span>
        </div>

        <div className="flex items-center gap-2">
          <span
            data-testid="app-version-badge"
            className="hidden sm:inline text-xs font-mono text-gray-400 px-2 py-1 rounded bg-white/5 border border-white/10"
          >
            v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'} (git:
            {typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : 'prod'})
          </span>
          <button
            onClick={refresh}
            aria-label="Päivitä"
            className="min-h-11 min-w-11 flex items-center justify-center gap-1.5 px-3 rounded-lg bg-white/5 text-gray-200 border border-white/10 text-xs font-semibold"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Päivitä</span>
          </button>
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="min-h-11 flex items-center gap-1.5 px-3 rounded-lg bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 border border-sky-500/30 text-xs font-semibold transition-colors"
          >
            <Radio className="w-4 h-4 text-sky-400" />
            <span>Tutka</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-5">
        {/* Venue Selector */}
        <section className="flex flex-col gap-2 p-3 rounded-2xl bg-white/5 border border-white/10">
          <div className="text-xs font-medium text-gray-300">Pelipaikka</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(VENUES).map(([key, snap]) => (
              <button
                key={key}
                onClick={() => setSelectedVenueKey(key)}
                className={`min-h-11 px-3 rounded-lg text-sm font-semibold transition-all ${
                  selectedVenueKey === key
                    ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20'
                    : 'bg-white/5 text-gray-300 hover:text-white hover:bg-white/10'
                }`}
              >
                {snap.venueName.split(',')[0]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <label htmlFor="kickoff" className="text-xs font-medium text-gray-300">
              Pelin alku tänään
            </label>
            <input
              id="kickoff"
              type="time"
              value={kickoffHm}
              onChange={(e) => setKickoffHm(e.target.value)}
              className="min-h-11 px-3 rounded-lg bg-black/40 border border-white/15 text-white text-sm"
            />
            <button
              onClick={() => setKickoffHm('')}
              className={`min-h-11 px-3 rounded-lg text-sm font-semibold ${
                kickoffHm ? 'bg-white/5 text-gray-300' : 'bg-sky-500 text-white'
              }`}
            >
              Nyt
            </button>
            <span className="text-xs text-gray-400">Ennuste klo {formatHelsinkiTime(kickoffIso)} (Suomen aikaa)</span>
          </div>
        </section>

        {/* Current observation from the nearest FMI station */}
        <section>
          <ObservationCard observation={observation} loading={loading} />
        </section>

        {/* Forecast for kickoff + lightning */}
        <section>
          <HeroMatchCardWeather
            forecast={forecast}
            lightning={lightning}
            loading={loading}
            onOpenRadar={() => setIsDrawerOpen(true)}
          />
        </section>

        {/* WhatsApp Briefing */}
        <section className="glass-panel rounded-2xl p-4 flex flex-col gap-3 border border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Shield className="w-4 h-4" />
              Säätiedote WhatsAppiin
            </span>
            <button
              onClick={handleCopyBriefing}
              className="min-h-11 flex items-center gap-1 text-xs font-semibold px-3 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Kopioitu!' : 'Kopioi'}</span>
            </button>
          </div>
          <pre className="p-3 rounded-xl bg-black/50 border border-white/5 text-xs text-gray-300 font-mono whitespace-pre-wrap select-all">
            {briefingText}
          </pre>
        </section>

        <details className="glass-panel rounded-2xl p-4 flex flex-col gap-3 border border-white/10">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-sky-400">
            WebMCP
            <span className="ml-2 normal-case tracking-normal font-mono text-emerald-400">{mcpStatus}</span>
          </summary>
          <ul className="flex flex-col gap-1 text-xs font-mono text-gray-400 mt-2">
            {mcpTools.map((t) => (
              <li key={t} className="text-gray-200">{t}</li>
            ))}
          </ul>
        </details>

        <p className="text-[11px] text-gray-500 px-1">
          Lähde: Ilmatieteen laitoksen avoin data (opendata.fmi.fi). Havainto on lähimmältä FMI-asemalta,
          ennuste Harmonie-mallista kentän koordinaateille. Jos FMI ei vastaa, lukemia ei näytetä eikä arvata.
        </p>
      </main>

      <SatelliteEmbedDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        venueCoords={activeCoords}
        venueName={activeSnapshot.venueName}
        lightningRisk={loading ? undefined : lightning}
        initialLayer="fmi_rain_radar"
      />

      <footer className="border-t border-white/10 py-4 px-6 text-xs text-gray-500 flex flex-wrap items-center justify-between gap-2">
        <span>weather-stats</span>
        <a
          href="/mcp-weather.html"
          target="_blank"
          rel="noreferrer"
          className="text-sky-400 hover:underline flex items-center gap-1 min-h-11"
        >
          <span>Sääwidget</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </footer>
    </div>
  );
}
