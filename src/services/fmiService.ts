/**
 * FMI Open Data Service (WFS & WMS)
 *
 * Integrates directly with Finnish Meteorological Institute open data (opendata.fmi.fi/wfs):
 * - Harmonie point forecast: fmi::forecast::harmonie::surface::point::simple
 *   (Temperature °C, WindSpeedMS m/s, WindGust m/s, Humidity %, Precipitation1h mm/h)
 * - Station observations: fmi::observations::weather::timevaluepair, nearest station by distance
 *   (t2m °C, ws_10min m/s, wg_10min m/s, ri_10min mm/h, r_1h mm)
 * - Lightning: fmi::observations::lightning::simple (4 rows per flash, grouped back to one)
 * - WMS Radar reflectivity: Radar:suomi_dbz_eureffin
 * - EUMETSAT satellite cloud cover layers
 *
 * All times from FMI are UTC. Every request has a timeout. When FMI fails, the result
 * says so: no remembered values, no "no data = safe".
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
  ObservedValue,
  VenueObservationArgs,
  VenueObservationResult,
} from '../types/weather';
import {
  calculateApparentTemperature,
  getWindAdvisoryBadge,
  getRainOnsetLabel,
} from '../domain/meteorology';
import { evaluateTurfSlickness } from '../domain/turfSlickness';
import {
  evaluatePitchLightningRisk,
  haversineDistanceKm,
  unknownLightningRisk,
} from '../domain/lightningSafety';
import { unavailableForecast } from './weatherCache';

export const FMI_ENDPOINTS = {
  wfs: 'https://opendata.fmi.fi/wfs',
  openWms: 'https://openwms.fmi.fi/geoserver/wms',
  eumetWms: 'https://eumetview.eumetsat.int/geoserv/wms',
};

export const FMI_TIMEOUT_MS = 5000;

/** Forecast parameters requested from Harmonie. Precipitation1h is mm/h (sum over the previous hour). */
export const FORECAST_PARAMETERS = ['Temperature', 'WindSpeedMS', 'WindGust', 'Humidity', 'Precipitation1h'] as const;
/** Observation parameters. ri_10min is mm/h, r_1h is mm in the last hour. */
export const OBSERVATION_PARAMETERS = ['t2m', 'ws_10min', 'wg_10min', 'ri_10min', 'r_1h'] as const;
/** An observation older than this is not shown as current. */
export const OBSERVATION_MAX_AGE_MINUTES = 40;
export const OBSERVATION_RADIUS_KM = 25;
export const LIGHTNING_RADIUS_KM = 30;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => name === 'wfs:member' || name === 'wml2:point' || name === 'gml:name',
});

export class FmiError extends Error {
  constructor(message: string, public readonly reasonFi: string) {
    super(message);
    this.name = 'FmiError';
  }
}

type XmlNode = Record<string, unknown>;

function asNode(value: unknown): XmlNode | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as XmlNode) : undefined;
}

function nodeAt(value: unknown, ...path: string[]): unknown {
  let cur: unknown = value;
  for (const key of path) {
    const node = asNode(cur);
    if (!node) return undefined;
    cur = node[key];
  }
  return cur;
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  const node = asNode(value);
  if (node && '#text' in node) return textOf(node['#text']);
  return '';
}

/** FMI sends "NaN" for a missing value. That is null here, never 0. */
export function parseFmiNumber(value: unknown): number | null {
  const text = textOf(value);
  if (text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function toFmiTime(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Returns the wfs:member list of an FMI FeatureCollection.
 * Throws on an ExceptionReport, HTML, or anything that is not a FeatureCollection,
 * so an error page can never be read as "zero strikes".
 */
export function fmiFeatureMembers(xmlText: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xmlText);
  } catch {
    throw new FmiError('FMI response is not XML', 'FMI:n vastausta ei voitu lukea.');
  }
  if (nodeAt(parsed, 'ExceptionReport') !== undefined) {
    throw new FmiError('FMI ExceptionReport', 'FMI palautti virheen.');
  }
  const collection = nodeAt(parsed, 'wfs:FeatureCollection');
  if (collection === undefined || collection === null) {
    throw new FmiError('FMI response is not a FeatureCollection', 'FMI:n vastausta ei voitu lukea.');
  }
  const members = nodeAt(collection, 'wfs:member');
  return Array.isArray(members) ? members : [];
}

async function fetchFmiXml(url: string, timeoutMs: number): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new FmiError('FMI timeout', 'FMI ei vastannut ajoissa.');
    }
    throw new FmiError('FMI network error', 'FMI ei vastannut.');
  }
  if (!res.ok) {
    throw new FmiError(`FMI HTTP ${res.status}`, `FMI vastasi virheellä (HTTP ${res.status}).`);
  }
  return res.text();
}

function reasonOf(err: unknown): string {
  return err instanceof FmiError ? err.reasonFi : 'FMI ei vastannut.';
}

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

/** Parsed BsWfs simple-feature rows: time -> parameter -> value (null for NaN). */
export function parseSimpleFeatureRows(xmlText: string): Map<string, Record<string, number | null>> {
  const rows = new Map<string, Record<string, number | null>>();
  for (const member of fmiFeatureMembers(xmlText)) {
    const el = nodeAt(member, 'BsWfs:BsWfsElement');
    if (!el) continue;
    const time = textOf(nodeAt(el, 'BsWfs:Time'));
    const param = textOf(nodeAt(el, 'BsWfs:ParameterName'));
    if (!time || !param || !Number.isFinite(new Date(time).getTime())) continue;
    const entry = rows.get(time) ?? {};
    entry[param] = parseFmiNumber(nodeAt(el, 'BsWfs:ParameterValue'));
    rows.set(time, entry);
  }
  return rows;
}

/** Forecast time step closest to kickoff, if one is within 60 minutes. */
export function pickForecastTime(times: string[], kickoffIso: string): string | undefined {
  const kickoffMs = new Date(kickoffIso).getTime();
  if (!Number.isFinite(kickoffMs)) return undefined;
  let best: string | undefined;
  let bestDiff = Infinity;
  for (const t of times) {
    const diff = Math.abs(new Date(t).getTime() - kickoffMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = t;
    }
  }
  return bestDiff <= 60 * 60 * 1000 ? best : undefined;
}

const round1 = (n: number | null): number | null => (n == null ? null : Math.round(n * 10) / 10);

/** Builds the forecast result from an FMI Harmonie simple-feature response. */
export function buildForecastFromXml(
  xmlText: string,
  args: VenueWeatherForecastArgs,
  fetchedAt: string = new Date().toISOString()
): VenueWeatherForecastResult {
  const { lat, lng, kickoffTime, venueId, venueName } = args;
  const coords: Coordinates = { lat, lng };
  const rows = parseSimpleFeatureRows(xmlText);
  const times = Array.from(rows.keys()).sort();
  const at = pickForecastTime(times, kickoffTime);
  if (!at) {
    return unavailableForecast(coords, kickoffTime, venueId, venueName, 'FMI ei palauttanut ennustetta tälle ajalle.');
  }
  const row = rows.get(at) ?? {};
  const temp = row.Temperature ?? null;
  const wind = row.WindSpeedMS ?? null;
  const gust = row.WindGust ?? null;
  const humidity = row.Humidity ?? null;
  const rain = row.Precipitation1h ?? null;

  if (temp == null && wind == null && gust == null && rain == null) {
    return unavailableForecast(coords, kickoffTime, venueId, venueName, 'FMI ei palauttanut lukemia.');
  }

  const rainTimeline: Array<{ time: string; precipitationMmh: number }> = [];
  for (const t of times) {
    const v = rows.get(t)?.Precipitation1h;
    if (v != null) rainTimeline.push({ time: t, precipitationMmh: Math.max(0, v) });
  }

  const rainMmh = rain == null ? null : Math.max(0, rain);
  const turf = temp != null && rainMmh != null ? evaluateTurfSlickness(temp, rainMmh) : null;
  const { label: rainOnsetLabel, minutesUntilRain: rainCountdownMinutes } = getRainOnsetLabel(
    kickoffTime,
    rainTimeline
  );

  return {
    venueId,
    venueName,
    coordinates: coords,
    kickoffTime,
    temperatureC: round1(temp),
    feelsLikeC: calculateApparentTemperature(temp, wind, humidity),
    windSpeedMs: round1(wind),
    windGustMs: round1(gust),
    precipitationMmh: round1(rainMmh),
    rainTimeline,
    rainCountdownMinutes,
    rainOnsetLabel,
    turfCondition: turf?.condition ?? 'dry',
    turfConditionLabelFi: turf?.labelFi ?? '—',
    windAdvisoryBadge: gust != null ? getWindAdvisoryBadge(gust) : undefined,
    available: true,
    isCacheFallback: false,
    forecastTime: at,
    fetchedAt,
    uiResourceUri: `ui://weather/venue-card?venueId=${venueId || 'venue'}&lat=${lat}&lng=${lng}&kickoff=${encodeURIComponent(kickoffTime)}`,
  };
}

export function buildForecastUrl(args: VenueWeatherForecastArgs): string {
  const kickoffMs = new Date(args.kickoffTime).getTime();
  const start = toFmiTime(kickoffMs - 30 * 60 * 1000);
  const end = toFmiTime(kickoffMs + 120 * 60 * 1000);
  return `${FMI_ENDPOINTS.wfs}?service=WFS&version=2.0.0&request=getFeature&storedquery_id=fmi::forecast::harmonie::surface::point::simple&latlon=${args.lat},${args.lng}&starttime=${encodeURIComponent(start)}&endtime=${encodeURIComponent(end)}&timestep=15&parameters=${FORECAST_PARAMETERS.join(',')}`;
}

/**
 * Fetches the Harmonie point forecast for the kickoff time.
 * On any failure: an explicit unavailable result. Never an old reading.
 */
export async function fetchVenueWeatherForecast(
  args: VenueWeatherForecastArgs,
  timeoutMs: number = FMI_TIMEOUT_MS
): Promise<VenueWeatherForecastResult> {
  const coords: Coordinates = { lat: args.lat, lng: args.lng };
  if (!Number.isFinite(args.lat) || !Number.isFinite(args.lng) || !Number.isFinite(new Date(args.kickoffTime).getTime())) {
    return unavailableForecast(coords, args.kickoffTime, args.venueId, args.venueName, 'Paikka tai aika puuttuu.');
  }
  const fetchedAt = new Date().toISOString();
  try {
    const xmlText = await fetchFmiXml(buildForecastUrl(args), timeoutMs);
    return buildForecastFromXml(xmlText, args, fetchedAt);
  } catch (err) {
    return unavailableForecast(coords, args.kickoffTime, args.venueId, args.venueName, reasonOf(err));
  }
}

export interface FmiStationSeries {
  fmisid: string;
  name: string;
  lat: number;
  lng: number;
  /** parameter -> points sorted by time */
  series: Record<string, Array<{ time: string; value: number | null }>>;
}

/** Parses fmi::observations::weather::timevaluepair into one entry per station. */
export function parseObservationStations(xmlText: string): FmiStationSeries[] {
  const stations = new Map<string, FmiStationSeries>();
  for (const member of fmiFeatureMembers(xmlText)) {
    const obs = nodeAt(member, 'omso:PointTimeSeriesObservation');
    if (!obs) continue;
    const href = String(nodeAt(obs, 'om:observedProperty', '@_xlink:href') ?? '');
    const param = /[?&]param=([^&]+)/.exec(href)?.[1];
    const feature = nodeAt(obs, 'om:featureOfInterest', 'sams:SF_SpatialSamplingFeature');
    const location = nodeAt(feature, 'sam:sampledFeature', 'target:LocationCollection', 'target:member', 'target:Location');
    const fmisid = textOf(nodeAt(location, 'gml:identifier'));
    const names = nodeAt(location, 'gml:name');
    let name = '';
    if (Array.isArray(names)) {
      const byCode = names.find((n) => String(nodeAt(n, '@_codeSpace') ?? '').endsWith('/name'));
      name = textOf(byCode ?? names[0]);
    }
    const pos = textOf(nodeAt(feature, 'sams:shape', 'gml:Point', 'gml:pos'));
    const [lat, lng] = pos.split(/\s+/).map(Number);
    if (!param || !fmisid || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const station = stations.get(fmisid) ?? { fmisid, name: name || fmisid, lat, lng, series: {} };
    const points = nodeAt(obs, 'om:result', 'wml2:MeasurementTimeseries', 'wml2:point');
    const list: Array<{ time: string; value: number | null }> = [];
    if (Array.isArray(points)) {
      for (const p of points) {
        const tvp = nodeAt(p, 'wml2:MeasurementTVP');
        const time = textOf(nodeAt(tvp, 'wml2:time'));
        if (!time || !Number.isFinite(new Date(time).getTime())) continue;
        list.push({ time, value: parseFmiNumber(nodeAt(tvp, 'wml2:value')) });
      }
    }
    list.sort((a, b) => a.time.localeCompare(b.time));
    station.series[param] = list;
    stations.set(fmisid, station);
  }
  return Array.from(stations.values());
}

/**
 * Nearest station with a fresh value for one parameter.
 * Fresh = the station's latest non-missing value is at most `maxAgeMinutes` old.
 */
export function nearestObservedValue(
  stations: FmiStationSeries[],
  coords: Coordinates,
  param: string,
  referenceMs: number,
  maxAgeMinutes: number = OBSERVATION_MAX_AGE_MINUTES
): ObservedValue | null {
  let best: ObservedValue | null = null;
  for (const st of stations) {
    const points = st.series[param] ?? [];
    let latest: { time: string; value: number } | undefined;
    for (const p of points) {
      if (p.value == null) continue;
      if (!latest || p.time > latest.time) latest = { time: p.time, value: p.value };
    }
    if (!latest) continue;
    const ageMs = referenceMs - new Date(latest.time).getTime();
    if (ageMs > maxAgeMinutes * 60 * 1000 || ageMs < -10 * 60 * 1000) continue;
    const distanceKm = haversineDistanceKm(coords.lat, coords.lng, st.lat, st.lng);
    if (!best || distanceKm < best.distanceKm) {
      best = {
        value: Math.round(latest.value * 10) / 10,
        time: latest.time,
        stationName: st.name,
        fmisid: st.fmisid,
        distanceKm: Math.round(distanceKm * 10) / 10,
      };
    }
  }
  return best;
}

export function buildObservationFromXml(
  xmlText: string,
  args: VenueObservationArgs,
  fetchedAt: string = new Date().toISOString()
): VenueObservationResult {
  const coords: Coordinates = { lat: args.lat, lng: args.lng };
  const refMs = args.referenceTime ? new Date(args.referenceTime).getTime() : Date.now();
  const stations = parseObservationStations(xmlText);
  const pick = (param: string) => nearestObservedValue(stations, coords, param, refMs);
  const temperature = pick('t2m');
  const result: VenueObservationResult = {
    venueName: args.venueName,
    coordinates: coords,
    available: temperature != null,
    stationName: temperature?.stationName,
    fmisid: temperature?.fmisid,
    distanceKm: temperature?.distanceKm,
    observedAt: temperature?.time,
    temperature,
    windSpeed: pick('ws_10min'),
    windGust: pick('wg_10min'),
    precipitationIntensity: pick('ri_10min'),
    precipitation1h: pick('r_1h'),
    fetchedAt,
  };
  if (!temperature) {
    result.errorFi = `FMI:ltä ei saatu tuoretta lämpötilahavaintoa ${OBSERVATION_RADIUS_KM} km säteeltä.`;
  }
  return result;
}

export function unavailableObservation(args: VenueObservationArgs, errorFi: string): VenueObservationResult {
  return {
    venueName: args.venueName,
    coordinates: { lat: args.lat, lng: args.lng },
    available: false,
    temperature: null,
    windSpeed: null,
    windGust: null,
    precipitationIntensity: null,
    precipitation1h: null,
    fetchedAt: new Date().toISOString(),
    errorFi,
  };
}

export function buildObservationUrl(args: VenueObservationArgs): string {
  const refMs = args.referenceTime ? new Date(args.referenceTime).getTime() : Date.now();
  const bbox = calculateWeatherBbox({ lat: args.lat, lng: args.lng }, OBSERVATION_RADIUS_KM);
  const start = toFmiTime(refMs - 60 * 60 * 1000);
  const end = toFmiTime(refMs);
  return `${FMI_ENDPOINTS.wfs}?service=WFS&version=2.0.0&request=getFeature&storedquery_id=fmi::observations::weather::timevaluepair&bbox=${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}&starttime=${encodeURIComponent(start)}&endtime=${encodeURIComponent(end)}&timestep=10&parameters=${OBSERVATION_PARAMETERS.join(',')}`;
}

/** Latest FMI station observations nearest to the venue. */
export async function fetchVenueObservation(
  args: VenueObservationArgs,
  timeoutMs: number = FMI_TIMEOUT_MS
): Promise<VenueObservationResult> {
  if (!Number.isFinite(args.lat) || !Number.isFinite(args.lng)) {
    return unavailableObservation(args, 'Paikka puuttuu.');
  }
  const fetchedAt = new Date().toISOString();
  try {
    const xmlText = await fetchFmiXml(buildObservationUrl(args), timeoutMs);
    return buildObservationFromXml(xmlText, args, fetchedAt);
  } catch (err) {
    return unavailableObservation(args, reasonOf(err));
  }
}

/**
 * Parses fmi::observations::lightning::simple. FMI sends four rows per flash
 * (multiplicity, peak_current, cloud_indicator, ellipse_major); they are grouped back
 * into one strike by position + time.
 */
export function parseLightningStrikes(
  xmlText: string
): Array<{ lat: number; lng: number; timeIso: string; peakCurrentKa?: number; cloudToGround?: boolean }> {
  const flashes = new Map<string, { lat: number; lng: number; timeIso: string; peakCurrentKa?: number; cloudToGround?: boolean }>();
  for (const member of fmiFeatureMembers(xmlText)) {
    const el = nodeAt(member, 'BsWfs:BsWfsElement');
    if (!el) continue;
    const pos = textOf(nodeAt(el, 'BsWfs:Location', 'gml:Point', 'gml:pos'));
    const timeIso = textOf(nodeAt(el, 'BsWfs:Time'));
    if (!pos || !timeIso) continue;
    const [lat, lng] = pos.split(/\s+/).map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const key = `${lat.toFixed(5)},${lng.toFixed(5)},${timeIso}`;
    const flash = flashes.get(key) ?? { lat, lng, timeIso };
    const param = textOf(nodeAt(el, 'BsWfs:ParameterName'));
    const value = parseFmiNumber(nodeAt(el, 'BsWfs:ParameterValue'));
    if (param === 'peak_current' && value != null) flash.peakCurrentKa = value;
    if (param === 'cloud_indicator' && value != null) flash.cloudToGround = value === 0;
    flashes.set(key, flash);
  }
  return Array.from(flashes.values());
}

export function buildLightningUrl(coords: Coordinates, refMs: number): string {
  const bbox = calculateWeatherBbox(coords, LIGHTNING_RADIUS_KM);
  const start = toFmiTime(refMs - 60 * 60 * 1000);
  const end = toFmiTime(refMs + 5 * 60 * 1000);
  return `${FMI_ENDPOINTS.wfs}?service=WFS&version=2.0.0&request=getFeature&storedquery_id=fmi::observations::lightning::simple&bbox=${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}&starttime=${encodeURIComponent(start)}&endtime=${encodeURIComponent(end)}`;
}

/**
 * Fetches lightning flashes from FMI and evaluates the 30/30 rule.
 * A failed or unreadable check is status 'unknown' ("Salamatietoa ei saatu"), never 'clear'.
 */
export async function fetchPitchLightningRisk(
  args: PitchLightningRiskArgs,
  timeoutMs: number = FMI_TIMEOUT_MS
): Promise<PitchLightningRiskResult> {
  const { lat, lng, referenceTime, venueName } = args;
  const coords: Coordinates = { lat, lng };
  const refMs = referenceTime ? new Date(referenceTime).getTime() : Date.now();
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(refMs)) {
    return unknownLightningRisk(coords, venueName, 'Paikka tai aika puuttuu.');
  }
  try {
    const xmlText = await fetchFmiXml(buildLightningUrl(coords, refMs), timeoutMs);
    const strikes = parseLightningStrikes(xmlText);
    return evaluatePitchLightningRisk(coords, strikes, refMs, venueName, false, undefined, new Date().toISOString());
  } catch (err) {
    return unknownLightningRisk(coords, venueName, reasonOf(err));
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
