/**
 * Tests built on real FMI open data responses saved in tests/fixtures/
 * (fetched from opendata.fmi.fi/wfs with the same queries the app makes).
 *
 * - fmi-forecast-vaiski-2026-10-08T1500Z.xml   Harmonie point forecast, Väiski, kickoff 18.00 Helsinki
 * - fmi-observations-helsinki-2026-10-08T040425Z.xml  timevaluepair stations within 25 km of Väiski
 *   (real "NaN" values: Harmaja and Sipoo Itätoukki have no ri_10min / r_1h)
 * - fmi-lightning-vaiski-2026-06-25T1825Z.xml  real thunderstorm north of Helsinki, 46 flashes x 4 rows
 * - fmi-lightning-vaiski-empty-2026-10-08.xml  real empty FeatureCollection
 * - fmi-exception-bad-bbox.xml                 real FMI ExceptionReport (HTTP 400)
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildForecastFromXml,
  buildForecastUrl,
  buildObservationFromXml,
  buildObservationUrl,
  buildLightningUrl,
  fetchPitchLightningRisk,
  fetchVenueWeatherForecast,
  fetchVenueObservation,
  fmiFeatureMembers,
  parseLightningStrikes,
  parseObservationStations,
} from '../src/services/fmiService';
import { evaluatePitchLightningRisk } from '../src/domain/lightningSafety';
import { helsinkiLocalToIso, formatHelsinkiTime } from '../src/domain/helsinkiTime';
import { VENUES } from '../src/services/weatherCache';
import { HeroMatchCardWeather } from '../src/components/HeroMatchCardWeather';
import { ObservationCard } from '../src/components/ObservationCard';
import { LightningMapCircle } from '../src/components/LightningMapCircle';
import { SatelliteEmbedDrawer } from '../src/components/SatelliteEmbedDrawer';

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf-8');

const FORECAST_XML = fixture('fmi-forecast-vaiski-2026-10-08T1500Z.xml');
const OBS_XML = fixture('fmi-observations-helsinki-2026-10-08T040425Z.xml');
const LIGHTNING_XML = fixture('fmi-lightning-vaiski-2026-06-25T1825Z.xml');
const LIGHTNING_EMPTY_XML = fixture('fmi-lightning-vaiski-empty-2026-10-08.xml');
const EXCEPTION_XML = fixture('fmi-exception-bad-bbox.xml');

const VAISKI = VENUES.vaiski;
const KICKOFF_18 = '2026-10-08T15:00:00.000Z'; // 18.00 Helsinki (EEST, UTC+3)
const OBS_REF = '2026-10-08T04:04:25Z';

const forecastArgs = {
  lat: VAISKI.coords.lat,
  lng: VAISKI.coords.lng,
  kickoffTime: KICKOFF_18,
  venueId: VAISKI.venueId,
  venueName: VAISKI.venueName,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Helsinki time', () => {
  it('converts Helsinki wall clock to UTC in summer and winter time', () => {
    expect(helsinkiLocalToIso('2026-10-08', '18:00')).toBe('2026-10-08T15:00:00.000Z');
    expect(helsinkiLocalToIso('2026-12-01', '18:00')).toBe('2026-12-01T16:00:00.000Z');
    expect(formatHelsinkiTime('2026-10-08T15:00:00Z')).toBe('18.00');
    expect(helsinkiLocalToIso('2026-10-08', '25:00')).toBeNull();
  });
});

describe('Harmonie forecast (real FMI sample)', () => {
  it('requests explicit parameters including Precipitation1h (mm/h) and no milliseconds in times', () => {
    const url = buildForecastUrl(forecastArgs);
    expect(url).toContain('storedquery_id=fmi::forecast::harmonie::surface::point::simple');
    expect(url).toContain('parameters=Temperature,WindSpeedMS,WindGust,Humidity,Precipitation1h');
    expect(url).toContain('starttime=2026-10-08T14%3A30%3A00Z');
    expect(url).toContain('endtime=2026-10-08T17%3A00%3A00Z');
    expect(url).toContain(`latlon=${VAISKI.coords.lat},${VAISKI.coords.lng}`);
  });

  it('uses the time step at kickoff, not the first row 30 min earlier', () => {
    const res = buildForecastFromXml(FORECAST_XML, forecastArgs);
    expect(res.available).toBe(true);
    expect(res.forecastTime).toBe('2026-10-08T15:00:00Z');
    // FMI values at 15:00Z in the sample: 12.4 °C, 7.02 m/s, gust 11.7, RH 77.8, 0.0 mm/h
    expect(res.temperatureC).toBe(12.4);
    expect(res.windSpeedMs).toBe(7.0);
    expect(res.windGustMs).toBe(11.7);
    expect(res.precipitationMmh).toBe(0);
    // FMI feels-like with m/s wind: 8.5 °C
    expect(res.feelsLikeC).toBe(8.5);
    expect(res.windAdvisoryBadge).toBe('🌬️ Puuskainen');
    expect(res.rainTimeline).toHaveLength(11);
    expect(res.isCacheFallback).toBe(false);
  });

  it('a NaN gust from FMI stays missing: null in data, "—" on screen, never 0 or NaN', () => {
    const xml = FORECAST_XML.replace(
      /(<BsWfs:ParameterName>WindGust<\/BsWfs:ParameterName>\s*<BsWfs:ParameterValue>)[^<]*/g,
      '$1NaN'
    );
    const res = buildForecastFromXml(xml, forecastArgs);
    expect(res.available).toBe(true);
    expect(res.windGustMs).toBeNull();
    expect(res.windSpeedMs).toBe(7.0);
    expect(res.windAdvisoryBadge).toBeUndefined();

    const html = renderToStaticMarkup(React.createElement(HeroMatchCardWeather, { forecast: res }));
    const gust = /data-testid="forecast-gust">([^<]*)</.exec(html)?.[1];
    expect(gust).toBe('—');
    expect(html).not.toContain('NaN');
    expect(html).not.toMatch(/>0(\.0)? m\/s</);
  });

  it('any NaN parameter stays missing (temperature, humidity, rain)', () => {
    const xml = FORECAST_XML.replace(
      /(<BsWfs:ParameterName>(Temperature|Humidity|Precipitation1h)<\/BsWfs:ParameterName>\s*<BsWfs:ParameterValue>)[^<]*/g,
      '$1NaN'
    );
    const res = buildForecastFromXml(xml, forecastArgs);
    expect(res.temperatureC).toBeNull();
    expect(res.feelsLikeC).toBeNull();
    expect(res.precipitationMmh).toBeNull();
    expect(res.turfConditionLabelFi).toBe('—');
    const html = renderToStaticMarkup(React.createElement(HeroMatchCardWeather, { forecast: res }));
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('0.0°C');
    expect(/data-testid="forecast-rain">([^<]*)</.exec(html)?.[1]).toBe('—');
  });

  it('kickoff outside the returned forecast window is unavailable, not the nearest old value', () => {
    const res = buildForecastFromXml(FORECAST_XML, { ...forecastArgs, kickoffTime: '2026-10-08T20:00:00.000Z' });
    expect(res.available).toBe(false);
    expect(res.temperatureC).toBeNull();
  });

  it('an FMI ExceptionReport is an error, never a reading', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(EXCEPTION_XML, { status: 400 })));
    const res = await fetchVenueWeatherForecast(forecastArgs);
    expect(res.available).toBe(false);
    expect(res.errorFi).toBe('FMI vastasi virheellä (HTTP 400).');
  });

  it('a failed second call does not bring back the first call\'s temperature', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(FORECAST_XML)).mockRejectedValueOnce(new TypeError('offline')));
    const first = await fetchVenueWeatherForecast(forecastArgs);
    const second = await fetchVenueWeatherForecast(forecastArgs);
    expect(first.temperatureC).toBe(12.4);
    expect(second.available).toBe(false);
    expect(second.temperatureC).toBeNull();
    expect(second.isCacheFallback).toBe(false);
  });
});

describe('Station observations (real FMI sample)', () => {
  it('parses every station with name, fmisid and position', () => {
    const stations = parseObservationStations(OBS_XML);
    expect(stations.map((s) => s.name)).toContain('Helsinki Kaisaniemi');
    const kaisaniemi = stations.find((s) => s.fmisid === '100971');
    expect(kaisaniemi?.lat).toBeCloseTo(60.17523, 5);
    expect(kaisaniemi?.series.t2m.at(-1)).toEqual({ time: '2026-10-08T04:00:00Z', value: 5.5 });
    const harmaja = stations.find((s) => s.name === 'Helsinki Harmaja');
    expect(harmaja?.series.ri_10min.at(-1)?.value).toBeNull(); // real "NaN"
  });

  it('picks the nearest station (Kaisaniemi, ~1.9 km from Väiski) with its FMI observation time', () => {
    const res = buildObservationFromXml(OBS_XML, { lat: VAISKI.coords.lat, lng: VAISKI.coords.lng, referenceTime: OBS_REF });
    expect(res.available).toBe(true);
    expect(res.stationName).toBe('Helsinki Kaisaniemi');
    expect(res.distanceKm).toBeGreaterThan(1.5);
    expect(res.distanceKm).toBeLessThan(2.5);
    expect(res.observedAt).toBe('2026-10-08T04:00:00Z');
    expect(res.temperature?.value).toBe(5.5);
    expect(res.windSpeed?.value).toBe(0.8);
    expect(res.windGust?.value).toBe(1.2);
    expect(res.precipitationIntensity?.value).toBe(0);
  });

  it('a station that sends NaN is skipped for that value, not shown as 0', () => {
    // At Harmaja itself: its t2m is real, its ri_10min is NaN -> rain comes from the next station.
    const res = buildObservationFromXml(OBS_XML, { lat: 60.10512, lng: 24.97539, referenceTime: OBS_REF });
    expect(res.stationName).toBe('Helsinki Harmaja');
    expect(res.temperature?.value).toBe(9.7);
    expect(res.precipitationIntensity?.stationName).not.toBe('Helsinki Harmaja');
  });

  it('never reuses an old temperature: two hours later the same data is not current', () => {
    const res = buildObservationFromXml(OBS_XML, {
      lat: VAISKI.coords.lat,
      lng: VAISKI.coords.lng,
      referenceTime: '2026-10-08T06:05:00Z',
    });
    expect(res.available).toBe(false);
    expect(res.temperature).toBeNull();
    const html = renderToStaticMarkup(React.createElement(ObservationCard, { observation: res }));
    expect(html).toContain('Havaintoa ei saatu');
    expect(html).not.toContain('5.5');
  });

  it('builds the bbox + time window query and shows the observation time in Helsinki time', async () => {
    const url = buildObservationUrl({ lat: VAISKI.coords.lat, lng: VAISKI.coords.lng, referenceTime: OBS_REF });
    expect(url).toContain('storedquery_id=fmi::observations::weather::timevaluepair');
    expect(url).toContain('parameters=t2m,ws_10min,wg_10min,ri_10min,r_1h');
    expect(url).toContain('starttime=2026-10-08T03%3A04%3A25Z');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(OBS_XML)));
    const res = await fetchVenueObservation({ lat: VAISKI.coords.lat, lng: VAISKI.coords.lng, referenceTime: OBS_REF });
    const html = renderToStaticMarkup(React.createElement(ObservationCard, { observation: res }));
    expect(html).toContain('5.5°C');
    expect(html).toContain('klo 07.00'); // 04:00Z = 07.00 Helsinki
    expect(html).toContain('Helsinki Kaisaniemi');
  });

  it('FMI down -> observation unavailable with the reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 })));
    const res = await fetchVenueObservation({ lat: VAISKI.coords.lat, lng: VAISKI.coords.lng });
    expect(res.available).toBe(false);
    expect(res.errorFi).toBe('FMI vastasi virheellä (HTTP 502).');
  });
});

describe('Lightning (real FMI samples)', () => {
  it('groups FMI\'s four rows per flash back into one strike', () => {
    expect(fmiFeatureMembers(LIGHTNING_XML)).toHaveLength(184);
    const strikes = parseLightningStrikes(LIGHTNING_XML);
    expect(strikes).toHaveLength(46);
    expect(strikes.every((s) => s.peakCurrentKa !== undefined)).toBe(true);
  });

  it('real 2026-06-25 storm: Väiski at 18:25Z is watch (nearest flash 12.1 km, 6 min ago)', () => {
    const strikes = parseLightningStrikes(LIGHTNING_XML);
    const res = evaluatePitchLightningRisk(VAISKI.coords, strikes, Date.parse('2026-06-25T18:25:00Z'), VAISKI.venueName);
    expect(res.status).toBe('watch');
    expect(res.nearestStrikeKm).toBeCloseTo(12.1, 0);
    expect(res.nearestStrikeMinutesAgo).toBe(6);
    // counted once per flash, not four times
    expect(res.strikesWithin30kmCount).toBeLessThanOrEqual(46);
    expect(res.strikes.length).toBe(res.strikesWithin30kmCount);
  });

  it('real 2026-06-25 storm: a point 8 km from the 18:18:35Z flash is danger', () => {
    const strikes = parseLightningStrikes(LIGHTNING_XML);
    const malmi = { lat: 60.2546, lng: 25.0428 };
    const res = evaluatePitchLightningRisk(malmi, strikes, Date.parse('2026-06-25T18:25:00Z'), 'Malmi');
    expect(res.status).toBe('danger');
    expect(res.suspendMatchRecommended).toBe(true);
    expect(res.safetyAdvisoryFi).not.toMatch(/turvalli/i);
  });

  it('a strike 8 km away 45 min ago is not danger (30/30), and a far recent one does not upgrade it', () => {
    const ref = Date.parse('2026-06-25T19:00:00Z');
    const res = evaluatePitchLightningRisk(
      VAISKI.coords,
      [
        { lat: 60.26, lng: 24.92, timeIso: '2026-06-25T18:15:00Z' }, // ~8 km, 45 min ago
        { lat: 60.40, lng: 24.95, timeIso: '2026-06-25T18:55:00Z' }, // ~24 km, 5 min ago
      ],
      ref
    );
    expect(res.status).toBe('clear');
    expect(res.strikesWithin10kmCount).toBe(1); // real count, not zeroed
  });

  it('builds a 30 km bbox query', () => {
    const url = buildLightningUrl(VAISKI.coords, Date.parse('2026-06-25T18:25:00Z'));
    expect(url).toContain('storedquery_id=fmi::observations::lightning::simple');
    expect(url).toContain('starttime=2026-06-25T17%3A25%3A00Z');
    expect(url).toContain('endtime=2026-06-25T18%3A30%3A00Z');
  });

  it('fetch with the real storm sample gives watch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(LIGHTNING_XML)));
    const res = await fetchPitchLightningRisk({ lat: VAISKI.coords.lat, lng: VAISKI.coords.lng, referenceTime: '2026-06-25T18:25:00Z' });
    expect(res.status).toBe('watch');
    expect(res.checkedAt).toBeDefined();
  });

  it('a real empty answer is clear, with the check time', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(LIGHTNING_EMPTY_XML)));
    const res = await fetchPitchLightningRisk({ lat: VAISKI.coords.lat, lng: VAISKI.coords.lng });
    expect(res.status).toBe('clear');
    expect(res.checkedAt).toBeDefined();
  });

  it.each([
    ['ExceptionReport with HTTP 200', () => new Response(EXCEPTION_XML, { status: 200 })],
    ['ExceptionReport with HTTP 400', () => new Response(EXCEPTION_XML, { status: 400 })],
    ['HTML error page with HTTP 200', () => new Response('<!doctype html><html><body>Maintenance</body></html>', { status: 200 })],
    ['empty body', () => new Response('', { status: 200 })],
  ])('%s is unknown, never clear', async (_label, makeResponse) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse()));
    const res = await fetchPitchLightningRisk({ lat: VAISKI.coords.lat, lng: VAISKI.coords.lng });
    expect(res.status).toBe('unknown');
  });
});

describe('UI: a failed lightning check says so', () => {
  const okForecast = buildForecastFromXml(FORECAST_XML, forecastArgs);

  async function failedLightning(mode: 'timeout' | 'offline') {
    if (mode === 'offline') {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    } else {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((_u: string, init?: RequestInit) =>
          new Promise((_, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('timeout', 'TimeoutError')));
          })
        )
      );
    }
    return fetchPitchLightningRisk({ lat: VAISKI.coords.lat, lng: VAISKI.coords.lng, venueName: VAISKI.venueName }, 30);
  }

  it.each(['timeout', 'offline'] as const)('lightning %s: card says "Salamatietoa ei saatu", never safe', async (mode) => {
    const lightning = await failedLightning(mode);
    expect(lightning.status).toBe('unknown');

    const card = renderToStaticMarkup(React.createElement(HeroMatchCardWeather, { forecast: okForecast, lightning }));
    expect(card).toContain('Salamatietoa ei saatu');
    expect(card).not.toMatch(/turvalli/i);
    expect(card).not.toMatch(/\bsafe\b/i);
    expect(card).not.toContain('Ei salamoita');

    const map = renderToStaticMarkup(
      React.createElement(LightningMapCircle, { venueCoords: VAISKI.coords, venueName: VAISKI.venueName, strikes: [], status: lightning.status, radiusKm: 25 })
    );
    expect(map).toContain('Salamatietoa ei saatu');
    expect(map).not.toContain('bg-emerald-400');

    const drawer = renderToStaticMarkup(
      React.createElement(SatelliteEmbedDrawer, { isOpen: true, onClose: () => {}, venueCoords: VAISKI.coords, venueName: VAISKI.venueName, lightningRisk: lightning })
    );
    expect(drawer).toContain('Salamatietoa ei saatu');
    expect(drawer).not.toMatch(/turvalli/i);
  });
});
