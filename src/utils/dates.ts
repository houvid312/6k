const TIMEZONE = 'America/Bogota';
const COLOMBIA_UTC_OFFSET = '-05:00';
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HAS_TIMEZONE_PATTERN = /(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Returns the current date/time in Colombia (America/Bogota) timezone.
 */
export function nowColombia(): Date {
  const colombiaStr = new Date().toLocaleString('en-US', { timeZone: TIMEZONE });
  return new Date(colombiaStr);
}

/**
 * Returns today's date string (YYYY-MM-DD) in Colombia timezone.
 */
export function todayColombia(): string {
  return toISODate(nowColombia());
}

/**
 * Converts a Colombia-local date or datetime into an UTC ISO timestamp.
 *
 * Supabase stores timestamptz columns in UTC. Screens work with Colombia
 * business dates, so day filters must query the matching UTC bounds.
 */
export function colombiaLocalToUtcISOString(value: string, endOfDay = false): string {
  let localValue = value;

  if (DATE_ONLY_PATTERN.test(value)) {
    localValue = `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`;
  }

  if (!HAS_TIMEZONE_PATTERN.test(localValue)) {
    localValue = `${localValue}${COLOMBIA_UTC_OFFSET}`;
  }

  return new Date(localValue).toISOString();
}

/**
 * Returns UTC query bounds for Colombia-local date/datetime ranges.
 */
export function colombiaDateRangeToUtc(
  from: string,
  to: string,
): { fromUtc: string; toUtc: string } {
  return {
    fromUtc: colombiaLocalToUtcISOString(from, false),
    toUtc: colombiaLocalToUtcISOString(to, true),
  };
}

/**
 * Formats a date as DD/MM/YYYY using Colombia timezone.
 */
export function formatDate(date: string | Date): string {
  if (typeof date === 'string') {
    const dateOnly = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
      return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
    }
  }

  const d = typeof date === 'string' ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat('es-CO', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(d);
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
  return `${day}/${month}/${year}`;
}

/**
 * Formats a date as DD/MM/YYYY HH:mm using Colombia timezone.
 */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/**
 * Formats a time as h:mm a.m./p.m. using Colombia timezone.
 */
export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

/**
 * Checks if a date is today in Colombia timezone.
 */
export function isToday(date: string | Date): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const dateStr = toISODateTZ(d);
  const todayStr = todayColombia();
  return dateStr === todayStr;
}

/**
 * Returns the Monday-Sunday range for the week containing the given date.
 */
export function getWeekRange(date: Date): { start: Date; end: Date } {
  const d = new Date(date);
  const dayOfWeek = d.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const start = new Date(d);
  start.setDate(d.getDate() + mondayOffset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Converts a Date to ISO date string (YYYY-MM-DD) using local time.
 */
export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Converts a Date to ISO date string (YYYY-MM-DD) using Colombia timezone.
 */
export function toISODateTZ(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return parts; // en-CA formats as YYYY-MM-DD
}
