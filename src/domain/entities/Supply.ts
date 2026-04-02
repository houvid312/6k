export type SupplyUnit = 'GRAMOS' | 'MILILITROS' | 'UNIDAD';

export interface Supply {
  id: string;
  name: string;
  unit: SupplyUnit;
  gramsPerBag: number;
}
