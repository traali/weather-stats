import React from 'react';
import { CloudRain, Wind, AlertTriangle } from 'lucide-react';
import { VenueWeatherForecastResult } from '../types/weather';

interface MatchdayCardWeatherBadgeProps {
  forecast: VenueWeatherForecastResult;
  onOpenRadar?: () => void;
  className?: string;
}

export const MatchdayCardWeatherBadge: React.FC<MatchdayCardWeatherBadgeProps> = ({
  forecast,
  onOpenRadar,
  className = '',
}) => {
  const {
    temperatureC,
    feelsLikeC,
    windSpeedMs,
    windGustMs,
    precipitationMmh,
    turfCondition,
    turfConditionLabelFi,
    windAdvisoryBadge,
    rainOnsetLabel,
    isCacheFallback,
  } = forecast;

  // Turf badge color mapping
  const turfColors: Record<string, string> = {
    frozen: 'bg-cyan-950/40 text-cyan-300 border-cyan-500/30',
    slick: 'bg-blue-950/40 text-blue-300 border-blue-500/30',
    dry: 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30',
    snowy: 'bg-indigo-950/40 text-indigo-300 border-indigo-500/30',
  };

  const turfClass = turfColors[turfCondition] || turfColors.dry;

  return (
    <div
      onClick={onOpenRadar}
      className={`glass-panel rounded-xl p-3 flex flex-col gap-2 cursor-pointer transition-all duration-200 hover:border-sky-500/40 hover:bg-slate-900/80 select-none ${className}`}
      role="button"
      tabIndex={0}
      aria-label="Avaa sää- ja sadetutka"
    >
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <span className="font-bold text-[var(--nv-text-lg)] text-white tracking-tight">
            {temperatureC.toFixed(1)}°C
          </span>
          <span className="text-[var(--nv-text-xs)] text-gray-400">
            (tuntuu {feelsLikeC.toFixed(1)}°C)
          </span>
        </div>

        {/* Turf Status Pill */}
        <span
          className={`text-[var(--nv-text-xs)] font-medium px-2 py-0.5 rounded-full border ${turfClass}`}
        >
          {turfConditionLabelFi}
        </span>
      </div>

      {/* Rain & Wind Row */}
      <div className="flex items-center justify-between text-[var(--nv-text-xs)] text-gray-300">
        <div className="flex items-center gap-1">
          <Wind className="w-3.5 h-3.5 text-gray-400" />
          <span>
            {windSpeedMs.toFixed(1)} m/s
            {windGustMs ? ` (${windGustMs.toFixed(1)})` : ''}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <CloudRain className="w-3.5 h-3.5 text-sky-400" />
          <span>{precipitationMmh.toFixed(1)} mm/h</span>
        </div>
      </div>

      {/* Dynamic Advisories (Rain Onset Countdown or Wind Gust Warning) */}
      {(rainOnsetLabel || windAdvisoryBadge || isCacheFallback) && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/5 text-[var(--nv-text-xs)]">
          {rainOnsetLabel && (
            <span className="text-sky-300 font-medium">{rainOnsetLabel}</span>
          )}

          {windAdvisoryBadge && (
            <span className="text-amber-300 font-medium flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              {windAdvisoryBadge}
            </span>
          )}

          {isCacheFallback && (
            <span className="text-[10px] text-amber-400/80 bg-amber-950/30 px-1.5 py-0.5 rounded border border-amber-500/20">
              Välimuisti
            </span>
          )}
        </div>
      )}
    </div>
  );
};
