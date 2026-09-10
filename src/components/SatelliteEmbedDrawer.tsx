import React, { useState, useEffect } from 'react';
import { X, ShieldAlert, Radio, AlertTriangle } from 'lucide-react';
import { RadarPlayer } from './RadarPlayer';
import { LightningMapCircle } from './LightningMapCircle';
import {
  Coordinates,
  RadarSatelliteLayerId,
  RadarSatelliteLayerResult,
  PitchLightningRiskResult,
} from '../types/weather';
import { getRadarSatelliteLayer } from '../services/fmiService';

interface SatelliteEmbedDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  venueCoords: Coordinates;
  venueName?: string;
  lightningRisk?: PitchLightningRiskResult;
  initialLayer?: RadarSatelliteLayerId;
}

export const SatelliteEmbedDrawer: React.FC<SatelliteEmbedDrawerProps> = ({
  isOpen,
  onClose,
  venueCoords,
  venueName = 'Pelipaikka',
  lightningRisk,
  initialLayer = 'fmi_rain_radar',
}) => {
  const [activeLayer, setActiveLayer] = useState<RadarSatelliteLayerId>(initialLayer);
  const [radarData, setRadarData] = useState<RadarSatelliteLayerResult>(() =>
    getRadarSatelliteLayer({
      layer: initialLayer,
      lat: venueCoords.lat,
      lng: venueCoords.lng,
      radiusKm: 50,
      frameCount: 6,
    })
  );

  // Update radar data when active layer or coordinates change
  useEffect(() => {
    const data = getRadarSatelliteLayer({
      layer: activeLayer,
      lat: venueCoords.lat,
      lng: venueCoords.lng,
      radiusKm: 50,
      frameCount: 6,
    });
    setRadarData(data);
  }, [activeLayer, venueCoords.lat, venueCoords.lng]);

  // Handle Escape key to close drawer (WCAG 2.2 AA)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isDanger = lightningRisk?.status === 'danger';
  const isWatch = lightningRisk?.status === 'watch';

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm transition-opacity animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-label="Sää- ja tutkatiedot"
    >
      {/* Slide-over panel */}
      <div className="relative w-full max-w-lg h-full bg-[#090d16] border-l border-white/10 shadow-2xl flex flex-col overflow-y-auto p-4 sm:p-6 text-gray-100">
        {/* Drawer Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-sky-400 animate-pulse" />
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                {venueName} — Tutka & Salama
              </h2>
              <p className="text-xs text-gray-400">Ilmatieteen laitos (FMI) reaaliaikakuva</p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Sulje ikkuna"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Safety Alert Banner (if lightning detected) */}
        {isDanger && (
          <div className="mb-4 p-4 rounded-xl bg-red-950/60 border border-red-500/50 text-red-200 flex items-start gap-3">
            <ShieldAlert className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5 animate-bounce" />
            <div>
              <div className="font-bold text-sm">SALAMAVAARA (30/30-sääntö)</div>
              <div className="text-xs mt-1">
                {lightningRisk?.alertMessage ||
                  'Salama havaittu alle 10 km päässä. Keskeytä ottelu ja siirry sisätiloihin.'}
              </div>
              {lightningRisk?.resumeCountdownMinutes && (
                <div className="text-xs font-semibold mt-1 text-red-300">
                  Turvallinen paluu arviolta {lightningRisk.resumeCountdownMinutes} min kuluttua.
                </div>
              )}
            </div>
          </div>
        )}

        {isWatch && (
          <div className="mb-4 p-3 rounded-xl bg-amber-950/60 border border-amber-500/50 text-amber-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold">Ukkosvahti (&lt;20 km): </span>
              {lightningRisk?.alertMessage || 'Ukkosrintama lähestyy. Tarkkaile taivasta.'}
            </div>
          </div>
        )}

        {/* 1. Radar Animation Player */}
        <div className="mb-6">
          <RadarPlayer
            layer={activeLayer}
            animationLoop={radarData.animationLoop}
            layerTitle={radarData.layerTitle}
            onLayerChange={(l) => setActiveLayer(l)}
          />
          <div className="text-[11px] text-gray-500 mt-2 px-1">
            {radarData.description} • Päivitysväli {radarData.refreshIntervalMinutes} min.
          </div>
        </div>

        {/* 2. Lightning Map Circle Component */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            Salamaturvallisuuden etäisyyskehä (10 / 20 km)
          </h3>
          <LightningMapCircle
            venueCoords={venueCoords}
            venueName={venueName}
            strikes={lightningRisk?.strikes || []}
            status={lightningRisk?.status || 'clear'}
            radiusKm={25}
          />
        </div>

        {/* Footer Actions */}
        <div className="mt-auto pt-4 border-t border-white/10 flex justify-between items-center text-xs text-gray-500">
          <span>weather-stats monastery v1.0.0</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 font-medium transition-colors"
          >
            Sulje näkymä
          </button>
        </div>
      </div>
    </div>
  );
};
