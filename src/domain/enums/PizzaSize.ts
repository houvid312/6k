export enum PizzaSize {
  FAMILIAR = 'FAMILIAR',
  MEDIANA = 'MEDIANA',
  INDIVIDUAL = 'INDIVIDUAL',
}

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

// Fallback local. El precio editable vive en supplies.sale_price_cop.
export const PACKAGING_SALE_PRICE_COP_BY_ID: Record<string, number> = {
  [PACKAGING_SUPPLY_IDS.CAJA_FAMILIAR]: 0,
  [PACKAGING_SUPPLY_IDS.CAJA_MEDIANA]: 0,
  [PACKAGING_SUPPLY_IDS.EMPAQUE_DIAMANTE_INDIVIDUAL]: 0,
};
