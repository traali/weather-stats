/**
 * Display helpers. A missing value is shown as '—', never as 0, NaN or "undefined".
 */

export const MISSING = '—';

export function fmt1(value: number | null | undefined, unit = ''): string {
  if (value == null || !Number.isFinite(value)) return MISSING;
  return `${value.toFixed(1)}${unit}`;
}

/** Lightning badge text. Only a successful FMI check can say there are no strikes. */
export function lightningStatusTextFi(status: 'clear' | 'watch' | 'danger' | 'unknown' | undefined): string {
  switch (status) {
    case 'danger':
      return 'SALAMAVAARA (alle 10 km)';
    case 'watch':
      return 'Ukkosvahti (alle 20 km)';
    case 'clear':
      return 'Ei salamoita 20 km säteellä (FMI)';
    default:
      return 'Salamatietoa ei saatu';
  }
}
