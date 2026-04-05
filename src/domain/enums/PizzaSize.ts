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

// IDs de insumos de empaque (deben coincidir con la migración 016)
export const PACKAGING_SUPPLY_IDS = {
  CAJA_FAMILIAR: '00000000-0000-0000-0002-000000000101',
  CAJA_MEDIANA: '00000000-0000-0000-0002-000000000102',
  EMPAQUE_DIAMANTE_INDIVIDUAL: '00000000-0000-0000-0002-000000000103',
} as const;

// Opciones de empaque para seleccionar a nivel de carrito/venta
export const PACKAGING_OPTIONS = [
  { id: PACKAGING_SUPPLY_IDS.CAJA_FAMILIAR, label: 'Caja Familiar', shortLabel: 'Caja Fam.', icon: 'package-variant' },
  { id: PACKAGING_SUPPLY_IDS.CAJA_MEDIANA, label: 'Caja Mediana', shortLabel: 'Caja Med.', icon: 'package-variant' },
  { id: PACKAGING_SUPPLY_IDS.EMPAQUE_DIAMANTE_INDIVIDUAL, label: 'Empaque', shortLabel: 'Emp.', icon: 'wrap' },
] as const;

export const PACKAGING_LABEL_BY_ID: Record<string, string> = {
  [PACKAGING_SUPPLY_IDS.CAJA_FAMILIAR]: 'Caja Familiar',
  [PACKAGING_SUPPLY_IDS.CAJA_MEDIANA]: 'Caja Mediana',
  [PACKAGING_SUPPLY_IDS.EMPAQUE_DIAMANTE_INDIVIDUAL]: 'Empaque',
};
