import React from 'react';
import { CloudRain, Wind, ShieldAlert, Radio } from 'lucide-react';
import { VenueWeatherForecastResult, PitchLightningRiskResult } from '../types/weather';
import { formatHelsinkiTime } from '../domain/helsinkiTime';
import { fmt1, lightningStatusTextFi, MISSING } from './weatherText';

interface HeroMatchCardWeatherProps {
  forecast: VenueWeatherForecastResult;
  lightning?: PitchLightningRiskResult;
  onOpenRadar?: () => void;
  loading?: boolean;
  className?: string;
}

export const HeroMatchCardWeather: React.FC<HeroMatchCardWeatherProps> = ({
  forecast,
  lightning,
  onOpenRadar,
  loading = false,
  className = '',
}) => {
  const {
    venueName,
    kickoffTime,
    forecastTime,
    temperatureC,
    feelsLikeC,
    windSpeedMs,
    windGustMs,
    precipitationMmh,
    turfConditionLabelFi,
    windAdvisoryBadge,
    rainOnsetLabel,
    available,
    errorFi,
  } = forecast;

  const known = available && !loading;
  const tempText = known ? fmt1(temperatureC, '°C') : MISSING;
  const feelsText = known && feelsLikeC != null ? `Tuntuu kuin ${fmt1(feelsLikeC, '°C')}` : '';
  const windText = known && windSpeedMs != null ? `${fmt1(windSpeedMs)} m/s` : MISSING;
  const gustText = known && windGustMs != null ? `${fmt1(windGustMs)} m/s` : MISSING;
  const rainText = known ? fmt1(precipitationMmh, ' mm/h') : MISSING;
  const lightningStatus = loading ? undefined : lightning?.status;
  const kickoffLabel = formatHelsinkiTime(kickoffTime);
  const forecastLabel = formatHelsinkiTime(forecastTime);

  return (
    <div
      className={`glass-panel rounded-2xl p-5 border border-white/10 flex flex-col gap-4 shadow-xl ${className}`}
      data-testid="forecast-card"
    >
      {/* Top Meta Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[var(--nv-text-xs)] font-bold uppercase tracking-wider text-sky-400">
          {loading ? 'Haetaan FMI:stä…' : known ? `FMI-ennuste klo ${kickoffLabel}` : 'Ennustetta ei saatu'}
        </span>

        {/* Lightning badge: only a successful FMI check may say there are no strikes */}
        {loading ? (
          <div className="px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300 border border-white/10 text-[var(--nv-text-xs)]">
            Tarkistetaan salamat…
          </div>
        ) : lightningStatus === 'danger' ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-950/60 text-red-300 border border-red-500/40 text-[var(--nv-text-xs)] font-bold animate-pulse">
            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            <span>{lightningStatusTextFi('danger')}</span>
          </div>
        ) : lightningStatus === 'watch' ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950/60 text-amber-300 border border-amber-500/40 text-[var(--nv-text-xs)] font-semibold">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span>{lightningStatusTextFi('watch')}</span>
          </div>
        ) : lightningStatus === 'clear' ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 text-[var(--nv-text-xs)] font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>{lightningStatusTextFi('clear')}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800 text-amber-200 border border-amber-500/40 text-[var(--nv-text-xs)] font-semibold" data-testid="lightning-unknown">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-300" />
            <span>{lightningStatusTextFi('unknown')}</span>
          </div>
        )}
      </div>

      {lightningStatus === 'unknown' && lightning?.safetyAdvisoryFi && (
        <div className="text-[var(--nv-text-xs)] text-amber-200/90">{lightning.safetyAdvisoryFi}</div>
      )}

      {/* Main Temp & Turf Metrics */}
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-[var(--nv-text-2xl)] font-extrabold text-white">{tempText}</span>
            <span className="text-[var(--nv-text-sm)] text-gray-300">{feelsText}</span>
          </div>
          <div className="text-[var(--nv-text-xs)] text-gray-400 mt-0.5">
            {venueName || 'Kenttä'}
            {known && forecastLabel ? ` • ennusteaika klo ${forecastLabel}` : ''}
          </div>
          {!loading && !available && (
            <div className="text-[var(--nv-text-xs)] text-amber-200 mt-1" data-testid="forecast-error">
              {errorFi || 'FMI ei vastannut.'} Lukemia ei arvata.
            </div>
          )}
        </div>

        <div className="flex flex-col items-end">
          <span className="text-[10px] text-gray-400 uppercase tracking-wider">Kenttä</span>
          <span className="text-[var(--nv-text-sm)] font-bold text-white px-3 py-1 rounded-lg bg-white/10 border border-white/15 mt-1">
            {known && turfConditionLabelFi !== '—' ? turfConditionLabelFi : MISSING}
          </span>
        </div>
      </div>

      {/* Grid of Weather Values */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-white/10 text-[var(--nv-text-xs)]">
        <div className="flex items-center gap-2 p-2 rounded-xl bg-black/20 border border-white/5">
          <Wind className="w-4 h-4 text-sky-400 flex-shrink-0" />
          <div>
            <div className="text-gray-400">Tuuli</div>
            <div className="font-semibold text-gray-200" data-testid="forecast-wind">{windText}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 p-2 rounded-xl bg-black/20 border border-white/5">
          <Wind className="w-4 h-4 text-sky-300 flex-shrink-0" />
          <div>
            <div className="text-gray-400">Puuska</div>
            <div className="font-semibold text-gray-200" data-testid="forecast-gust">{gustText}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 p-2 rounded-xl bg-black/20 border border-white/5">
          <CloudRain className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <div>
            <div className="text-gray-400">Sade</div>
            <div className="font-semibold text-gray-200" data-testid="forecast-rain">{rainText}</div>
          </div>
        </div>
      </div>

      {known && (rainOnsetLabel || windAdvisoryBadge) && (
        <div className="text-[var(--nv-text-xs)] font-semibold text-amber-300">
          {[rainOnsetLabel, windAdvisoryBadge].filter(Boolean).join(' • ')}
        </div>
      )}

      {onOpenRadar && (
        <button
          onClick={onOpenRadar}
          className="mt-1 w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-sky-600/30 to-blue-600/30 hover:from-sky-600/40 hover:to-blue-600/40 border border-sky-500/30 text-sky-200 text-[var(--nv-text-sm)] font-semibold flex items-center justify-center gap-2 transition-all duration-200 min-h-[44px]"
        >
          <Radio className="w-4 h-4 text-sky-400" />
          <span>Avaa sadetutka & salamakartta</span>
        </button>
      )}
    </div>
  );
};
