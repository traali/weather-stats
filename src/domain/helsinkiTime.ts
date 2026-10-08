/**
 * Europe/Helsinki time helpers. FMI answers in UTC; people read Helsinki time.
 */

export const HELSINKI_TZ = 'Europe/Helsinki';

const timeFmt = new Intl.DateTimeFormat('fi-FI', {
  timeZone: HELSINKI_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dateTimeFmt = new Intl.DateTimeFormat('fi-FI', {
  timeZone: HELSINKI_TZ,
  day: 'numeric',
  month: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function validDate(iso: string | undefined | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** "18.00" in Helsinki time, or '' when the time is not valid. */
export function formatHelsinkiTime(iso: string | undefined | null): string {
  const d = validDate(iso);
  return d ? timeFmt.format(d) : '';
}

/** "8.10. klo 18.00" in Helsinki time, or '' when the time is not valid. */
export function formatHelsinkiDateTime(iso: string | undefined | null): string {
  const d = validDate(iso);
  if (!d) return '';
  const parts = dateTimeFmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')}.${get('month')}. klo ${get('hour')}.${get('minute')}`;
}

/** Helsinki calendar date of an instant as YYYY-MM-DD. */
export function helsinkiDateOf(ms: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: HELSINKI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Offset of Helsinki from UTC in minutes at the given instant (+180 in summer, +120 in winter). */
function helsinkiOffsetMinutes(ms: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: HELSINKI_TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

/**
 * Converts a Helsinki wall-clock date + time ("2026-10-08", "18:00") to a UTC ISO string.
 * Returns null for malformed input.
 */
export function helsinkiLocalToIso(dateYmd: string, timeHm: string): string | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd);
  const tm = /^(\d{1,2})[:.](\d{2})$/.exec(timeHm);
  if (!dm || !tm) return null;
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const [h, mi] = [Number(tm[1]), Number(tm[2])];
  if (h > 23 || mi > 59) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let guess = wall - helsinkiOffsetMinutes(wall) * 60000;
  guess = wall - helsinkiOffsetMinutes(guess) * 60000;
  return new Date(guess).toISOString();
}
