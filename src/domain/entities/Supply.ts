export type SupplyUnit = 'GRAMOS' | 'MILILITROS' | 'UNIDAD';

export interface Supply {
  id: string;
  name: string;
  unit: SupplyUnit;
  gramsPerBag: number;
  productionCostCop: number;
  commercialPriceCop: number;
  salePriceCop: number;
  isBillableToStore: boolean;
}
