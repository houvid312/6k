import { PizzaSize, PORTIONS_PER_SIZE } from '../domain/enums';

/**
 * Returns the number of portions for a given pizza size.
 */
export function getPortions(size: PizzaSize): number {
  return PORTIONS_PER_SIZE[size];
}

/**
 * Calculates total portions for a given size and quantity of pizzas.
 */
export function calculatePortions(size: PizzaSize, quantity: number): number {
  return PORTIONS_PER_SIZE[size] * quantity;
}
