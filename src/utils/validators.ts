/**
 * Checks if the given value is a positive number (> 0).
 */
export function isPositiveNumber(n: unknown): boolean {
  return typeof n === 'number' && !isNaN(n) && n > 0;
}
