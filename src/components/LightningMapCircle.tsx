import React from 'react';
import { Coordinates, LightningStrikeItem } from '../types/weather';

interface LightningMapCircleProps {
  venueCoords: Coordinates;
  venueName?: string;
  strikes: LightningStrikeItem[];
  status: 'clear' | 'watch' | 'danger';
  radiusKm?: number;
}

export const LightningMapCircle: React.FC<LightningMapCircleProps> = ({
  venueCoords: _venueCoords,
  venueName = 'Pelipaikka',
  strikes,
  status,
  radiusKm = 25,
}) => {
  const size = 280;
  const center = size / 2;
  const scale = (size / 2) / radiusKm; // pixels per km

  const r10 = 10 * scale;
  const r20 = 20 * scale;

  return (
    <div className="relative flex flex-col items-center justify-center p-3 rounded-2xl bg-black/40 border border-white/10 backdrop-blur-md">
      <div className="w-full flex items-center justify-between mb-2 px-1 text-xs">
        <span className="font-semibold text-gray-300 flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              status === 'danger'
                ? 'bg-red-500 animate-ping'
                : status === 'watch'
                ? 'bg-amber-400'
                : 'bg-emerald-400'
            }`}
          />
          Salamatutka (30/30)
        </span>
        <span className="text-gray-400 font-mono">
          {strikes.length} isku{strikes.length === 1 ? '' : 'a'} ({radiusKm} km)
        </span>
      </div>

      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="overflow-visible select-none"
          viewBox={`0 0 ${size} ${size}`}
        >
          {/* Background grid circles */}
          {/* 20 km Watch Zone */}
          <circle
            cx={center}
            cy={center}
            r={r20}
            fill={status === 'watch' ? 'rgba(245, 158, 11, 0.08)' : 'transparent'}
            stroke={status === 'watch' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(255, 255, 255, 0.12)'}
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />

          {/* 10 km Danger Zone */}
          <circle
            cx={center}
            cy={center}
            r={r10}
            fill={status === 'danger' ? 'rgba(239, 68, 68, 0.12)' : 'transparent'}
            stroke={status === 'danger' ? 'rgba(239, 68, 68, 0.6)' : 'rgba(255, 255, 255, 0.2)'}
            strokeWidth={status === 'danger' ? '2' : '1.5'}
          />

          {/* Crosshairs */}
          <line
            x1={center}
            y1={10}
            x2={center}
            y2={size - 10}
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth="1"
          />
          <line
            x1={10}
            y1={center}
            x2={size - 10}
            y2={center}
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth="1"
          />

          {/* Labels */}
          <text
            x={center + r10 + 4}
            y={center - 4}
            fill="rgba(255, 255, 255, 0.4)"
            fontSize="9"
            fontFamily="monospace"
          >
            10 km
          </text>
          <text
            x={center + r20 + 4}
            y={center - 4}
            fill="rgba(255, 255, 255, 0.4)"
            fontSize="9"
            fontFamily="monospace"
          >
            20 km
          </text>

          {/* Center venue pin */}
          <circle cx={center} cy={center} r="4" fill="#38bdf8" />
          <circle cx={center} cy={center} r="8" fill="none" stroke="#38bdf8" strokeWidth="1" />

          {/* Lightning strikes plotted around venue */}
          {strikes.map((s, idx) => {
            // Pseudo angle based on index and distance for visualization if coords identical
            const angle = (idx * 137.5 * Math.PI) / 180;
            const distPx = Math.min(size / 2 - 12, s.distanceKm * scale);
            const sx = center + distPx * Math.cos(angle);
            const sy = center + distPx * Math.sin(angle);

            if (s.isFresh) {
              return (
                <g key={idx}>
                  {/* Pulsing halo */}
                  <circle
                    cx={sx}
                    cy={sy}
                    r="9"
                    fill="rgba(239, 68, 68, 0.3)"
                    className="strike-pulse-indicator"
                  />
                  {/* Bright red strike dot */}
                  <circle cx={sx} cy={sy} r="4" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                </g>
              );
            }

            // Older strike: muted amber
            return (
              <circle
                key={idx}
                cx={sx}
                cy={sy}
                r="3"
                fill="#f59e0b"
                opacity="0.7"
                stroke="rgba(0,0,0,0.5)"
                strokeWidth="1"
              />
            );
          })}
        </svg>

        <div className="absolute bottom-2 left-2 text-[10px] text-gray-400 font-medium">
          Kenttä: {venueName}
        </div>
      </div>

      <div className="w-full flex justify-around mt-2 pt-2 border-t border-white/5 text-[11px] text-gray-400">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block ring-2 ring-red-500/30" />
          <span>&lt;15 min (Pulsing)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block opacity-75" />
          <span>15–60 min (Historia)</span>
        </div>
      </div>
    </div>
  );
};
