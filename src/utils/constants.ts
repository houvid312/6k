export interface DenominationDef {
  label: string;
  value: number;
  key: string;
}

/**
 * COP denominations matching the DenominationCount interface keys.
 */
export const COP_DENOMINATIONS: DenominationDef[] = [
  { label: '$100.000', value: 100000, key: 'bills100k' },
  { label: '$50.000', value: 50000, key: 'bills50k' },
  { label: '$20.000', value: 20000, key: 'bills20k' },
  { label: '$10.000', value: 10000, key: 'bills10k' },
  { label: '$5.000', value: 5000, key: 'bills5k' },
  { label: '$2.000', value: 2000, key: 'bills2k' },
  { label: 'Monedas', value: 1, key: 'coins' },
];

export const EXPENSE_CATEGORIES: string[] = [
  'Arriendo',
  'Servicios',
  'Nomina',
  'Proveedores',
  'Insumos',
  'Transporte',
  'Compra Turno',
  'Otro',
];

export const DAYS_OF_WEEK: string[] = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
];
