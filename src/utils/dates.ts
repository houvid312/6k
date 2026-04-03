const TIMEZONE = 'America/Bogota';

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
 * Formats a date as DD/MM/YYYY using Colombia timezone.
 */
export function formatDate(date: string | Date): string {
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
