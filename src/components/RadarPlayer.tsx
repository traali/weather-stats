import React, { useState, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, CloudRain } from 'lucide-react';
import { RadarAnimationFrame, RadarSatelliteLayerId } from '../types/weather';

interface RadarPlayerProps {
  layer: RadarSatelliteLayerId;
  animationLoop: RadarAnimationFrame[];
  layerTitle: string;
  onLayerChange?: (layer: RadarSatelliteLayerId) => void;
  basemapUrl?: string;
  venueName?: string;
  radiusKm?: number;
}

export const RadarPlayer: React.FC<RadarPlayerProps> = ({
  layer,
  animationLoop,
  layerTitle,
  onLayerChange,
  basemapUrl,
  venueName,
  radiusKm = 18,
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(() =>
    Math.max(0, animationLoop.length - 1)
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [playbackSpeedMs, setPlaybackSpeedMs] = useState<number>(800);

  // Sync current frame index if loop length changes
  useEffect(() => {
    if (currentIndex >= animationLoop.length) {
      setCurrentIndex(Math.max(0, animationLoop.length - 1));
    }
  }, [animationLoop.length, currentIndex]);

  // Animation interval loop
  useEffect(() => {
    if (!isPlaying || animationLoop.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % animationLoop.length);
    }, playbackSpeedMs);

    return () => clearInterval(timer);
  }, [isPlaying, animationLoop.length, playbackSpeedMs]);

  const currentFrame = animationLoop[currentIndex] || animationLoop[0];

  const handleStepBack = () => {
    setIsPlaying(false);
    setCurrentIndex((prev) => (prev === 0 ? animationLoop.length - 1 : prev - 1));
  };

  const handleStepForward = () => {
    setIsPlaying(false);
    setCurrentIndex((prev) => (prev + 1) % animationLoop.length);
  };

  const togglePlay = () => {
    setIsPlaying((prev) => !prev);
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-black/60 border border-white/10 p-4 backdrop-blur-xl shadow-2xl">
      {/* Top Bar: Layer Title & Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <CloudRain className="w-5 h-5 text-sky-400" />
          <span className="font-semibold text-sm text-gray-200">{layerTitle}</span>
        </div>

        {onLayerChange && (
          <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/10 text-xs">
            <button
              onClick={() => onLayerChange('fmi_rain_radar')}
              className={`px-2.5 py-1 rounded transition-colors ${
                layer === 'fmi_rain_radar' ? 'bg-sky-500/20 text-sky-300 font-medium' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Sadetutka
            </button>
            <button
              onClick={() => onLayerChange('eumetsat_natural')}
              className={`px-2.5 py-1 rounded transition-colors ${
                layer === 'eumetsat_natural' ? 'bg-sky-500/20 text-sky-300 font-medium' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Satelliitti
            </button>
            <button
              onClick={() => onLayerChange('eumetsat_fog')}
              className={`px-2.5 py-1 rounded transition-colors ${
                layer === 'eumetsat_fog' ? 'bg-sky-500/20 text-sky-300 font-medium' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Sumu/Pilvi
            </button>
          </div>
        )}
      </div>

      {/* Frame Display Viewport */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-slate-950 border border-white/10">
        {basemapUrl && (
          <img
            src={basemapUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-fill select-none pointer-events-none"
          />
        )}
        {currentFrame?.wmsUrl ? (
          <img
            src={currentFrame.wmsUrl}
            alt={`Tutkakuva ${currentFrame.label}`}
            className="absolute inset-0 w-full h-full object-fill select-none mix-blend-screen opacity-90"
            loading="eager"
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="text-xs text-gray-500">Ladataan tutkakuvaa...</div>
        )}
        {venueName && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none z-10">
            <div className="w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-white shadow-md" />
            <div className="mt-1 px-2 py-0.5 rounded-full bg-black/80 text-[10px] font-bold text-white max-w-[200px] truncate">
              {venueName}
            </div>
          </div>
        )}
        <div className="absolute bottom-2.5 left-2.5 px-2 py-1 rounded-lg bg-black/70 text-[10px] text-gray-300">
          Säde: {radiusKm} km • Keskipiste: {venueName || 'Kenttä'}
        </div>

        {/* Current Frame Timestamp Pill */}
        <div className="absolute top-3 right-3 flex items-center gap-2 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-mono font-medium text-gray-200">{currentFrame?.label || 'Nyt'}</span>
          <span className="text-[10px] text-gray-400">
            {currentFrame?.timestampIso ? new Date(currentFrame.timestampIso).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' }) : ''}
          </span>
        </div>
      </div>

      {/* Timeline Controls */}
      <div className="flex flex-col gap-2 pt-1">
        {/* Progress Slider */}
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="0"
            max={Math.max(0, animationLoop.length - 1)}
            value={currentIndex}
            onChange={(e) => {
              setIsPlaying(false);
              setCurrentIndex(Number(e.target.value));
            }}
            className="w-full accent-sky-400 h-1.5 bg-gray-700 rounded-lg cursor-pointer"
          />
        </div>

        {/* Playback Buttons */}
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-2">
            <button
              onClick={handleStepBack}
              aria-label="Edellinen kuva"
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-colors"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pysäytä' : 'Toista'}
              className="px-4 py-2 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 font-medium flex items-center gap-2 border border-sky-500/30 transition-colors min-h-[44px]"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span className="text-xs">{isPlaying ? 'Pysäytä' : 'Toista animaatio'}</span>
            </button>

            <button
              onClick={handleStepForward}
              aria-label="Seuraava kuva"
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-colors"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Speed Toggle */}
          <button
            onClick={() => setPlaybackSpeedMs((s) => (s === 800 ? 400 : 800))}
            className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 rounded bg-white/5 border border-white/10"
          >
            Nopeus: {playbackSpeedMs === 800 ? '1x' : '2x'}
          </button>
        </div>
      </div>
    </div>
  );
};
