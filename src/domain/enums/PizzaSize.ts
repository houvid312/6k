export enum PizzaSize {
  FAMILIAR = 'FAMILIAR',
  MEDIANA = 'MEDIANA',
  DIAMANTE = 'DIAMANTE',
  INDIVIDUAL = 'INDIVIDUAL',
}

export const PORTIONS_PER_SIZE: Record<PizzaSize, number> = {
  [PizzaSize.FAMILIAR]: 8,
  [PizzaSize.MEDIANA]: 4,
  [PizzaSize.DIAMANTE]: 2,
  [PizzaSize.INDIVIDUAL]: 1,
};
