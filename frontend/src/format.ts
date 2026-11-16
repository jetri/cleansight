import type { Tone } from './components/ui';

export function sourceSeconds(us: number | null | undefined, digits = 3): string {
  if (us === null || us === undefined || !Number.isSafeInteger(us)) return 'Unavailable';
  return `${us < 0 ? '-' : '+'}${(Math.abs(us) / 1_000_000).toFixed(digits)}s`;
}

export function relativeTime(us: number | null | undefined, origin: number): string {
  return us === null || us === undefined ? 'Unavailable' : sourceSeconds(us - origin);
}

export function timestamp(value: string | null | undefined): string {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return 'Invalid timestamp';
  return date.toISOString().replace('T', ' ').replace('.000Z', ' UTC').replace('Z', ' UTC');
}

export function bytes(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Unavailable';
  if (value < 1024) return `${value} B`;
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), 4);
  return `${(value / 1024 ** exponent).toFixed(1)} ${['B', 'KiB', 'MiB', 'GiB', 'TiB'][exponent]}`;
}

export function outcomeTone(value: string): Tone {
  if (value === 'WOULD_ALERT') return 'info';
  if (value.includes('INCOMPLETE') || value.includes('ERROR')) return 'error';
  if (value.includes('UNCERTAIN') || value.includes('UNKNOWN')) return 'warning';
  return 'neutral';
}

export function shortId(value: string): string { return value.slice(0, 8); }

export function sourceInput(us: number): string {
  const value = BigInt(us);
  return `${value / 1_000_000n}.${String(value % 1_000_000n).padStart(6, '0')}`;
}

/** Decimal input only: no silently rounded sub-microsecond policy boundary. */
export function parseSourceInput(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(value.trim());
  if (!match) return null;
  const us = BigInt(match[1]!) * 1_000_000n + BigInt((match[2] ?? '').padEnd(6, '0'));
  return us <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(us) : null;
}
