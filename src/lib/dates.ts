/**
 * Dates, in Dutch, short.
 *
 * An aftekening carries a date and a name, and both are read at a glance while
 * standing on a steiger. So "12 sep 2026", not "2026-09-12T14:03:11.882Z", and
 * "vandaag" when that is what it is.
 */

const MONTHS = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
];

function parse(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "12 sep 2026" */
export function formatDate(value: string | Date | null | undefined): string {
  const d = parse(value);
  if (!d) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "vandaag", "gisteren", otherwise the date. */
export function formatDay(value: string | Date | null | undefined): string {
  const d = parse(value);
  if (!d) return '';

  const days = daysBetween(startOfDay(new Date()), startOfDay(d));
  if (days === 0) return 'vandaag';
  if (days === -1) return 'gisteren';
  return formatDate(d);
}

/** For an ISO date column (`date`, no time): today, in yyyy-mm-dd. */
export function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

/** "nog 3 maanden", "nog 12 dagen", "verlopen". */
export function formatRemaining(days: number): string {
  if (days < 0) return 'verlopen';
  if (days === 0) return 'verloopt vandaag';
  if (days === 1) return 'nog 1 dag';
  if (days < 60) return `nog ${days} dagen`;
  const months = Math.round(days / 30);
  return `nog ${months} maanden`;
}
