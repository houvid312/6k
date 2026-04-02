/**
 * Converts a total grams value into bags + loose grams.
 */
export function gramsToBags(
  grams: number,
  gramsPerBag: number,
): { bags: number; looseGrams: number } {
  const bags = Math.floor(grams / gramsPerBag);
  const looseGrams = Math.round((grams % gramsPerBag) * 100) / 100;
  return { bags, looseGrams };
}

/**
 * Converts bags + loose grams back to total grams.
 */
export function bagsToGrams(
  bags: number,
  looseGrams: number,
  gramsPerBag: number,
): number {
  return bags * gramsPerBag + looseGrams;
}
