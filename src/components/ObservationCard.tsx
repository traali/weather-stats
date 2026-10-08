import React from 'react';
import { Thermometer, Wind, CloudRain } from 'lucide-react';
import { ObservedValue, VenueObservationResult } from '../types/weather';
import { formatHelsinkiDateTime, formatHelsinkiTime } from '../domain/helsinkiTime';
import { fmt1, MISSING } from './weatherText';

interface ObservationCardProps {
  observation: VenueObservationResult | null;
  loading?: boolean;
}

function sourceText(v: ObservedValue | null, primaryFmisid?: string): string {
  if (!v) return '';
  const time = formatHelsinkiTime(v.time);
  if (v.fmisid === primaryFmisid) return `klo ${time}`;
  return `${v.stationName} ${v.distanceKm.toFixed(1)} km, klo ${time}`;
}

export const ObservationCard: React.FC<ObservationCardProps> = ({ observation, loading = false }) => {
  if (loading || !observation) {
    return (
      <div className="glass-panel rounded-2xl p-4 border border-white/10 text-sm text-gray-300" data-testid="observation-card">
        Haetaan FMI:n havaintoa…
      </div>
    );
  }

  if (!observation.available) {
    return (
      <div className="glass-panel rounded-2xl p-4 border border-amber-500/30 text-sm text-amber-200" data-testid="observation-card">
        <div className="font-bold">Havaintoa ei saatu</div>
        <div className="text-xs mt-1 text-amber-100/80">{observation.errorFi || 'FMI ei vastannut.'} Lukemia ei arvata.</div>
      </div>
    );
  }

  const { temperature, windSpeed, windGust, precipitationIntensity, precipitation1h, fmisid } = observation;
  const windText = windSpeed ? `${fmt1(windSpeed.value)} m/s` : MISSING;
  const gustText = windGust ? ` (puuska ${fmt1(windGust.value)})` : '';
  const rainNow = precipitationIntensity ? `${fmt1(precipitationIntensity.value)} mm/h` : MISSING;
  const rain1h = precipitation1h ? `${fmt1(precipitation1h.value)} mm / 1 h` : '';

  return (
    <div className="glass-panel rounded-2xl p-4 border border-white/10 flex flex-col gap-3" data-testid="observation-card">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-sky-400">Havainto nyt (FMI)</span>
        <span className="text-xs text-gray-400" data-testid="observation-time">
          {formatHelsinkiDateTime(observation.observedAt)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <Thermometer className="w-5 h-5 text-sky-300" />
        <span className="text-3xl font-extrabold text-white">{fmt1(temperature?.value, '°C')}</span>
      </div>
      <div className="text-xs text-gray-400">
        Asema: {observation.stationName}, {observation.distanceKm?.toFixed(1)} km kentältä
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        <div className="flex items-start gap-2 p-2 rounded-xl bg-black/20 border border-white/5">
          <Wind className="w-4 h-4 text-sky-400 mt-0.5" />
          <div>
            <div className="text-gray-400 text-xs">Tuuli</div>
            <div className="font-semibold text-gray-100">{windText}{gustText}</div>
            <div className="text-[11px] text-gray-500">{sourceText(windSpeed, fmisid)}</div>
          </div>
        </div>
        <div className="flex items-start gap-2 p-2 rounded-xl bg-black/20 border border-white/5">
          <CloudRain className="w-4 h-4 text-blue-400 mt-0.5" />
          <div>
            <div className="text-gray-400 text-xs">Sade nyt</div>
            <div className="font-semibold text-gray-100">{rainNow}</div>
            <div className="text-[11px] text-gray-500">
              {[rain1h, sourceText(precipitationIntensity ?? precipitation1h, fmisid)].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
