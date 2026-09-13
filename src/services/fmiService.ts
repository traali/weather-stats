/**
 * FMI Open Data Service (WFS & WMS)
 *
 * Integrates directly with Finnish Meteorological Institute:
 * - WFS Harmonie surface point forecast: fmi::forecast::harmonie::surface::point::simple
 * - WFS Lightning discharges: fmi::observations::lightning::simple
 * - WMS Radar reflectivity: Radar:suomi_dbz_eureffin & Radar:suomi_rr_eureffin
 * - EUMETSAT satellite cloud cover layers
 *
 * Features defensive timeout controls (AbortSignal) and falls back
 * to verified deterministic cache on network failure (Zero Mock Invariant).
 */

import { XMLParser } from 'fast-xml-parser';
import {
  Coordinates,
  VenueWeatherForecastArgs,
  VenueWeatherForecastResult,
  PitchLightningRiskArgs,
  PitchLightningRiskResult,
  RadarSatelliteLayerArgs,
  RadarSatelliteLayerResult,
  RadarAnimationFrame,
  RadarSatelliteLayerId,
} from '../types/weather';
import {
  calculateApparentTemperature,
  getWindAdvisoryBadge,
  getRainOnsetLabel,
} from '../domain/meteorology';
import { evaluateTurfSlickness } from '../domain/turfSlickness';
import { evaluatePitchLightningRisk } from '../domain/lightningSafety';
import {
  getDeterministicForecastFallback,
  getDeterministicLightningFallback,
  saveForecastToCache,
  saveLightningToCache,
} from './weatherCache';

export const FMI_ENDPOINTS = {
  wfs: 'https://opendata.fmi.fi/wfs',
  openWms: 'https://openwms.fmi.fi/geoserver/wms',
  eumetWms: 'https://eumetview.eumetsat.int/geoserv/wms',
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

/**
 * Computes bounding box around pitch with aspect ratio compensation for Finnish latitude (~60°N)
 * Longitude converges at higher latitudes: DeltaLng = DeltaLat * 1.8
 */
export function calculateWeatherBbox(
  coords: Coordinates,
  radiusKm: number = 18
): { minLng: number; minLat: number; maxLng: number; maxLat: number; crs: 'CRS:84' } {
  const deltaLat = radiusKm / 111.32;
  const cosLat = Math.cos((coords.lat * Math.PI) / 180);
  const deltaLng = radiusKm / (111.32 * Math.max(0.2, cosLat));

  return {
    minLng: Math.round((coords.lng - deltaLng) * 10000) / 10000,
    minLat: Math.round((coords.lat - deltaLat) * 10000) / 10000,
    maxLng: Math.round((coords.lng + deltaLng) * 10000) / 10000,
    maxLat: Math.round((coords.lat + deltaLat) * 10000) / 10000,
    crs: 'CRS:84',
  };
}

/**
 * Builds WMS imagery URL for radar or satellite
 */
export function buildWmsTileUrl(
  layer: RadarSatelliteLayerId,
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
  timestampIso: string
): string {
  const bboxStr = `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`;
  const size = 'WIDTH=768&HEIGHT=576';

  switch (layer) {
    case 'fmi_rain_radar':
      return `${FMI_ENDPOINTS.openWms}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=Radar:suomi_dbz_eureffin&STYLES=&CRS=CRS:84&BBOX=${bboxStr}&${size}&FORMAT=image/png&TRANSPARENT=TRUE&TIME=${encodeURIComponent(timestampIso)}`;

    case 'eumetsat_fog':
      return `${FMI_ENDPOINTS.eumetWms}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=msg_fes:rgb_fog&STYLES=&CRS=CRS:84&BBOX=${bboxStr}&${size}&FORMAT=image/jpeg&TIME=${encodeURIComponent(timestampIso)}`;

    case 'eumetsat_natural':
      return `${FMI_ENDPOINTS.eumetWms}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=msg_fes:rgb_natural&STYLES=&CRS=CRS:84&BBOX=${bboxStr}&${size}&FORMAT=image/jpeg&TIME=${encodeURIComponent(timestampIso)}`;

    case 'fmi_lightning':
      return `${FMI_ENDPOINTS.openWms}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=Observation:lightning&STYLES=&CRS=CRS:84&BBOX=${bboxStr}&${size}&FORMAT=image/png&TRANSPARENT=TRUE&TIME=${encodeURIComponent(timestampIso)}`;
  }
}

/**
 * Fetches Harmonie surface point forecast from FMI WFS
 */
export async function fetchVenueWeatherForecast(
  args: VenueWeatherForecastArgs,
  timeoutMs: number = 3000
): Promise<VenueWeatherForecastResult> {
  const { lat, lng, kickoffTime, venueId, venueName } = args;
  const coords: Coordinates = { lat, lng };

  const kickoffDate = new Date(kickoffTime);
  const startTime = new Date(kickoffDate.getTime() - 30 * 60 * 1000).toISOString();
  const endTime = new Date(kickoffDate.getTime() + 120 * 60 * 1000).toISOString();

  const queryUrl = `${FMI_ENDPOINTS.wfs}?service=WFS&version=2.0.0&request=getFeature&storedquery_id=fmi::forecast::harmonie::surface::point::simple&latlon=${lat},${lng}&starttime=${encodeURIComponent(startTime)}&endtime=${encodeURIComponent(endTime)}&timestep=15`;

  try {
    const res = await fetch(queryUrl, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`FMI WFS error: HTTP ${res.status}`);

    const xmlText = await res.text();
    const parsed = xmlParser.parse(xmlText);

    const members = parsed?.['wfs:FeatureCollection']?.['wfs:member'];
    const memberArray = Array.isArray(members) ? members : members ? [members] : [];

    let temp = Number.NaN;
    let wind = Number.NaN;
    let gust = Number.NaN;
    let rain = 0.0;
    let humidity = 70;
    const rainTimeline: Array<{ time: string; precipitationMmh: number }> = [];

    for (const member of memberArray) {
      const bsWfs = member?.['BsWfs:BsWfsElement'];
      if (!bsWfs) continue;
      const param = String(bsWfs['BsWfs:ParameterName'] || '');
      const val = parseFloat(String(bsWfs['BsWfs:ParameterValue'] || 'NaN'));
      const time = String(bsWfs['BsWfs:Time'] || '');

      if (!Number.isFinite(val)) continue;

      if (param === 'Temperature' && Number.isNaN(temp)) temp = val;
      if (param === 'WindSpeedMS' && Number.isNaN(wind)) wind = val;
      if (param === 'WindGust' && Number.isNaN(gust)) gust = val;
      if (param === 'Humidity') humidity = val;
      if (param === 'PrecipitationAmount') {
        const pVal = Math.max(0, val);
        if (Number.isNaN(rain)) rain = pVal;
        rainTimeline.push({ time, precipitationMmh: pVal });
      }
    }

    if (!Number.isFinite(temp) || !Number.isFinite(wind)) {
      throw new Error('FMI forecast payload missing valid Temperature or WindSpeed');
    }

    const feelsLike = calculateApparentTemperature(temp, wind, humidity);
    const turf = evaluateTurfSlickness(temp, rain);
    const windAdvisoryBadge = getWindAdvisoryBadge(gust);
    const { label: rainOnsetLabel, minutesUntilRain: rainCountdownMinutes } = getRainOnsetLabel(
      kickoffTime,
      rainTimeline
    );

    const uiResourceUri = `ui://weather/venue-card?venueId=${venueId || 'venue'}&lat=${lat}&lng=${lng}&kickoff=${encodeURIComponent(kickoffTime)}`;

    const result: VenueWeatherForecastResult = {
      venueId,
      venueName,
      coordinates: coords,
      kickoffTime,
      temperatureC: Math.round(temp * 10) / 10,
      feelsLikeC: feelsLike,
      windSpeedMs: Math.round(wind * 10) / 10,
      windGustMs: Number.isFinite(gust) ? Math.round(gust * 10) / 10 : Math.round(wind * 1.5 * 10) / 10,
      precipitationMmh: Math.round(rain * 10) / 10,
      rainTimeline: rainTimeline.length > 0 ? rainTimeline : [{ time: kickoffTime, precipitationMmh: rain }],
      rainCountdownMinutes,
      rainOnsetLabel,
      turfCondition: turf.condition,
      turfConditionLabelFi: turf.labelFi,
      windAdvisoryBadge,
      isCacheFallback: false,
      uiResourceUri,
    };

    saveForecastToCache(result);
    return result;
  } catch {
    // Zero-mock fallback: Retrieve deterministic cached snapshot
    return getDeterministicForecastFallback(coords, kickoffTime, venueId, venueName);
  }

}

/**
 * Fetches lightning discharges from FMI WFS and evaluates 30/30 safety rule
 */
export async function fetchPitchLightningRisk(
  args: PitchLightningRiskArgs,
  timeoutMs: number = 3000
): Promise<PitchLightningRiskResult> {
  const { lat, lng, perimeterKm = 15, referenceTime, venueName } = args;
  const coords: Coordinates = { lat, lng };

  const refMs = referenceTime ? new Date(referenceTime).getTime() : Date.now();
  const startTime = new Date(refMs - 60 * 60 * 1000).toISOString();
  const endTime = new Date(refMs + 5 * 60 * 1000).toISOString();

  // Bbox around pitch for lightning query
  const bbox = calculateWeatherBbox(coords, Math.min(30, perimeterKm * 1.5));
  const queryUrl = `${FMI_ENDPOINTS.wfs}?service=WFS&version=2.0.0&request=getFeature&storedquery_id=fmi::observations::lightning::simple&bbox=${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}&starttime=${encodeURIComponent(startTime)}&endtime=${encodeURIComponent(endTime)}`;

  try {
    const res = await fetch(queryUrl, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`FMI Lightning query error: HTTP ${res.status}`);

    const xmlText = await res.text();
    const parsed = xmlParser.parse(xmlText);

    const members = parsed?.['wfs:FeatureCollection']?.['wfs:member'];
    const memberArray = Array.isArray(members) ? members : members ? [members] : [];

    const rawStrikes: Array<{ lat: number; lng: number; timeIso: string; peakCurrentKa?: number }> = [];

    for (const member of memberArray) {
      const bsWfs = member?.['BsWfs:BsWfsElement'];
      if (!bsWfs) continue;
      const pos = String(bsWfs['gml:pos'] || '').trim();
      const timeIso = String(bsWfs['BsWfs:Time'] || '');
      const param = String(bsWfs['BsWfs:ParameterName'] || '');
      const val = parseFloat(String(bsWfs['BsWfs:ParameterValue'] || 'NaN'));

      if (!pos || !timeIso) continue;
      const [posLat, posLng] = pos.split(/\s+/).map((n) => parseFloat(n));
      if (!posLat || !posLng || Number.isNaN(posLat) || Number.isNaN(posLng)) continue;

      let currentKa: number | undefined;
      if (param === 'peak_current' && Number.isFinite(val)) {
        currentKa = val;
      }

      rawStrikes.push({
        lat: posLat,
        lng: posLng,
        timeIso,
        peakCurrentKa: currentKa,
      });
    }

    const result = evaluatePitchLightningRisk(
      coords,
      rawStrikes,
      refMs,
      venueName,
      false
    );

    saveLightningToCache(coords, result);
    return result;
  } catch {
    return getDeterministicLightningFallback(coords, venueName);
  }

}

/**
 * Builds Radar & Satellite Layer configuration with dynamic animation loop frames
 */
export function buildBasemapUrl(bbox: {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}): string {
  const bboxStr = `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`
  return `https://ows.terrestris.de/osm/service?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=OSM-WMS&STYLES=&SRS=EPSG:4326&BBOX=${bboxStr}&WIDTH=768&HEIGHT=576&FORMAT=image/png`
}

export function getRadarSatelliteLayer(
  args: RadarSatelliteLayerArgs
): RadarSatelliteLayerResult {
  const {
    layer = 'fmi_rain_radar',
    lat,
    lng,
    radiusKm = 18,
    timestamp,
    frameCount = 6,
  } = args;

  const center: Coordinates = { lat, lng };
  const bbox = calculateWeatherBbox(center, radiusKm);

  const refDate = timestamp ? new Date(timestamp) : new Date();
  // Safe offset: latest completed frame lags by ~10 min
  const safeEndTimeMs = refDate.getTime() - 10 * 60 * 1000;
  const loopCount = Math.min(12, Math.max(3, frameCount));

  const animationLoop: RadarAnimationFrame[] = [];

  for (let i = loopCount - 1; i >= 0; i--) {
    const frameDate = new Date(safeEndTimeMs - i * 5 * 60 * 1000);
    // Round to nearest 5 minutes
    const mins = Math.floor(frameDate.getMinutes() / 5) * 5;
    frameDate.setMinutes(mins, 0, 0);

    const iso = frameDate.toISOString();
    const label = i === 0 ? 'Nyt (viimeisin)' : `-${i * 5} min`;
    const wmsUrl = buildWmsTileUrl(layer, bbox, iso);

    animationLoop.push({
      label,
      timestampIso: iso,
      wmsUrl,
      isForecast: false,
    });
  }

  const currentFrameUrl = animationLoop[animationLoop.length - 1]?.wmsUrl || '';
  const uiResourceUri = `ui://weather/radar-drawer?layer=${layer}&lat=${lat}&lng=${lng}&radius=${radiusKm}`;

  const layerMeta: Record<RadarSatelliteLayerId, { title: string; provider: 'FMI (Ilmatieteen laitos)' | 'EUMETSAT (Euroopan sääsatelliittijärjestö)'; refresh: number; desc: string; legend: string }> = {
    fmi_rain_radar: {
      title: '🌧️ FMI Sadetutka (5 min)',
      provider: 'FMI (Ilmatieteen laitos)',
      refresh: 5,
      desc: 'Reaaliaikainen tutkaheijastavuus Suomen 11 säätutka-asemalta. Erottaa tihkun, rankkasateen ja raekuuron.',
      legend: '0.1 mm/h (vihreä) ➔ >20 mm/h (violetti rankkasade)',
    },
    eumetsat_fog: {
      title: '🛰️ EUMETSAT Sumu & Matala pilvi',
      provider: 'EUMETSAT (Euroopan sääsatelliittijärjestö)',
      refresh: 15,
      desc: 'Meteosat-geostationäärisatelliitin RGB-yhdistelmä matalien sumupilvien tunnistamiseen.',
      legend: 'Keltainen/Oranssi = Sumu/Matala pilvi • Sininen/Syaani = Yläpilvet',
    },
    eumetsat_natural: {
      title: '☁️ EUMETSAT Luonnollinen väri',
      provider: 'EUMETSAT (Euroopan sääsatelliittijärjestö)',
      refresh: 15,
      desc: 'Luonnollisen värin satelliittikuva. Erottaa maaston, lumipeitteen ja ukkossolut.',
      legend: 'Turkoosi = Lumi/Jää • Valkoinen = Pilvet • Vihreä = Maasto',
    },
    fmi_lightning: {
      title: '⚡ FMI Salamatutka',
      provider: 'FMI (Ilmatieteen laitos)',
      refresh: 5,
      desc: 'NORDLIS-salamapaikannusverkon purkaukset ja iskutiheys.',
      legend: 'Punainen = <5 min • Oranssi = <15 min • Keltainen = <30 min',
    },
  };

  const meta = layerMeta[layer] || layerMeta.fmi_rain_radar;

  return {
    layer,
    layerTitle: meta.title,
    provider: meta.provider,
    refreshIntervalMinutes: meta.refresh,
    description: meta.desc,
    legendText: meta.legend,
    center,
    bbox,
    basemapUrl: buildBasemapUrl(bbox),
    currentFrameUrl,
    animationLoop,
    uiResourceUri,
  };
}
