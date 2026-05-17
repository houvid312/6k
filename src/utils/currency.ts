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
 * Formats COP values preserving cents for internal production costs.
 * Example: 1189.8 -> "$1.189,80"
 */
export function formatCOPDecimal(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const [integerPart, decimalPart] = Math.abs(amount).toFixed(2).split('.');
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}$${formattedInteger},${decimalPart}`;
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
