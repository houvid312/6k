/**
 * Formats a number as Colombian Pesos.
 * Example: 32000 -> "$32.000"
 */
export function formatCOP(amount: number): string {
  const rounded = Math.round(amount);
  const formatted = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return rounded < 0 ? `-$${formatted}` : `$${formatted}`;
}

/**
 * Parses a COP formatted string back to a number.
 * Example: "$32.000" -> 32000
 */
export function parseCOP(str: string): number {
  const cleaned = str.replace(/[$.\s]/g, '');
  const value = parseInt(cleaned, 10);
  return isNaN(value) ? 0 : value;
}
