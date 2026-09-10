import React from 'react';
import { CloudRain, Wind, ShieldAlert, Radio } from 'lucide-react';
import { VenueWeatherForecastResult, PitchLightningRiskResult } from '../types/weather';

interface HeroMatchCardWeatherProps {
  forecast: VenueWeatherForecastResult;
  lightning?: PitchLightningRiskResult;
  onOpenRadar?: () => void;
  className?: string;
}

export const HeroMatchCardWeather: React.FC<HeroMatchCardWeatherProps> = ({
  forecast,
  lightning,
  onOpenRadar,
  className = '',
}) => {
  const {
    venueName,
    temperatureC,
    feelsLikeC,
    windSpeedMs,
    windGustMs,
    precipitationMmh,
    turfConditionLabelFi,
    windAdvisoryBadge,
    rainOnsetLabel,
    isCacheFallback,
  } = forecast;

  const lightningStatus = lightning?.status || 'clear';

  return (
    <div
      className={`glass-panel rounded-2xl p-5 border border-white/10 flex flex-col gap-4 shadow-xl ${className}`}
    >
      {/* Top Meta Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[var(--nv-text-xs)] font-bold uppercase tracking-wider text-sky-400">
            FMI Säätiedot
          </span>
          {isCacheFallback && (
            <span className="text-[10px] text-amber-300 bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-500/30">
              Välimuistissa
            </span>
          )}
        </div>

        {/* Lightning Threat Badge */}
        {lightningStatus === 'danger' ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-950/60 text-red-300 border border-red-500/40 text-[var(--nv-text-xs)] font-bold animate-pulse">
            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            <span>SALAMAVAARA (&lt;10 km)</span>
          </div>
        ) : lightningStatus === 'watch' ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950/60 text-amber-300 border border-amber-500/40 text-[var(--nv-text-xs)] font-semibold">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span>Ukkosvahti (&lt;20 km)</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 text-[var(--nv-text-xs)] font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Sää turvallinen</span>
          </div>
        )}
      </div>

      {/* Main Temp & Turf Metrics */}
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-[var(--nv-text-2xl)] font-extrabold text-white">
              {temperatureC.toFixed(1)}°C
            </span>
            <span className="text-[var(--nv-text-sm)] text-gray-300">
              Tuntuu kuin {feelsLikeC.toFixed(1)}°C
            </span>
          </div>
          <div className="text-[var(--nv-text-xs)] text-gray-400 mt-0.5">
            {venueName || 'Kenttä'} • Kickoff-ennuste
          </div>
        </div>

        {/* Kenttäpinta Pill */}
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-gray-400 uppercase tracking-wider">Kenttä</span>
          <span className="text-[var(--nv-text-sm)] font-bold text-white px-3 py-1 rounded-lg bg-white/10 border border-white/15 mt-1">
            {turfConditionLabelFi}
          </span>
        </div>
      </div>

      {/* Grid of Weather Invariants */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-white/10 text-[var(--nv-text-xs)]">
        <div className="flex items-center gap-2 p-2 rounded-xl bg-black/20 border border-white/5">
          <Wind className="w-4 h-4 text-sky-400 flex-shrink-0" />
          <div>
            <div className="text-gray-400">Tuuli / Puuska</div>
            <div className="font-semibold text-gray-200">
              {windSpeedMs.toFixed(1)} / {windGustMs.toFixed(1)} m/s
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 p-2 rounded-xl bg-black/20 border border-white/5">
          <CloudRain className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <div>
            <div className="text-gray-400">Sade-ennuste</div>
            <div className="font-semibold text-gray-200">
              {precipitationMmh.toFixed(1)} mm/h
            </div>
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1 flex items-center justify-between sm:justify-start gap-2 p-2 rounded-xl bg-black/20 border border-white/5">
          <div>
            <div className="text-gray-400">Huomio</div>
            <div className="font-semibold text-amber-300 truncate">
              {rainOnsetLabel || windAdvisoryBadge || 'Normaali sää'}
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Action: Open Radar Drawer */}
      {onOpenRadar && (
        <button
          onClick={onOpenRadar}
          className="mt-1 w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-sky-600/30 to-blue-600/30 hover:from-sky-600/40 hover:to-blue-600/40 border border-sky-500/30 text-sky-200 text-[var(--nv-text-sm)] font-semibold flex items-center justify-center gap-2 transition-all duration-200 min-h-[44px]"
        >
          <Radio className="w-4 h-4 text-sky-400 animate-pulse" />
          <span>Avaa reaaliaikainen tutka & salamakartta</span>
        </button>
      )}
    </div>
  );
};
