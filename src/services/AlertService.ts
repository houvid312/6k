import { DailyAlert, AlertType } from '../domain/entities';
import {
  IDailyAlertRepository,
  IPhysicalCountRepository,
  ISupplyRepository,
  ITransferRepository,
} from '../domain/interfaces/repositories';
import { ValidationService } from './ValidationService';

export class AlertService {
  constructor(
    private dailyAlertRepo: IDailyAlertRepository,
    private validationService: ValidationService,
    private physicalCountRepo: IPhysicalCountRepository,
    private supplyRepo: ISupplyRepository,
    private transferRepo: ITransferRepository,
  ) {}

  /**
   * Triggers inventory validation after cash closing.
   *
   * Formula per supply:
   *   invInicial       = conteo físico anterior (o 0 si es el primero)
   *   entradas         = traslados recibidos al nivel STORE durante el día
   *   consumoTeorico   = ventas × recetas + bajas aprobadas
   *   invFinalTeorico  = invInicial + entradas − consumoTeorico
   *   invFinalReal     = conteo físico de hoy
   *   discrepancia     = invFinalReal − invFinalTeorico
   *
   * Negative discrepancy → LOSS (se consumió más de lo esperado)
   * Positive discrepancy → SURPLUS (se consumió menos de lo esperado)
   */
  async triggerPostClosingValidation(
    storeId: string,
    date: string,
    closingWorkerId?: string,
  ): Promise<DailyAlert[]> {
    // 0. Delete previous alerts for this store+date to avoid duplicates
    await this.dailyAlertRepo.deleteByStoreAndDate(storeId, date);

    // 1. Get the two most recent physical counts (current + previous)
    const latestCounts = await this.physicalCountRepo.getLatestTwo(storeId);
    if (latestCounts.length === 0) {
      // No physical count — cannot validate
      return [];
    }

    const currentCount = latestCounts[0];
    const previousCount = latestCounts.length > 1 ? latestCounts[1] : null;

    // 2. Build inventory maps
    const finalInventory: Record<string, number> = {};
    for (const item of currentCount.items) {
      finalInventory[item.supplyId] = item.totalGrams;
    }

    const initialInventory: Record<string, number> = {};
    if (previousCount) {
      for (const item of previousCount.items) {
        initialInventory[item.supplyId] = item.totalGrams;
      }
    }

    // 3. Get entries: transfers received to this store today
    const transfers = await this.transferRepo.getReceivedByDestination(storeId, date, date);
    const supplies = await this.supplyRepo.getAll();
    const supplyMap = new Map(supplies.map((s) => [s.id, s]));

    const transferEntries: Record<string, number> = {};
    for (const transfer of transfers) {
      for (const item of transfer.items) {
        const supply = supplyMap.get(item.supplyId);
        const gramsTransferred = supply
          ? item.bagsToSend * supply.gramsPerBag
          : item.targetGrams - item.currentInventoryGrams;
        transferEntries[item.supplyId] = (transferEntries[item.supplyId] ?? 0) + gramsTransferred;
      }
    }

    // 4. Get theoretical consumption (sales × recipes + approved writeoffs)
    const theoretical = await this.validationService.calculateTheoreticalConsumption(
      storeId,
      date,
      date,
    );
    const theoreticalMap = new Map(theoretical.map((tc) => [tc.supplyId, tc.theoreticalGrams]));

    // 5. Collect all supply IDs that appear in any data source
    const allSupplyIds = new Set<string>([
      ...Object.keys(finalInventory),
      ...Object.keys(initialInventory),
      ...Object.keys(transferEntries),
      ...theoreticalMap.keys(),
    ]);

    // 6. Calculate alerts per supply
    const alerts: Omit<DailyAlert, 'id'>[] = [];
    const thresholdPercent = 5;

    for (const supplyId of allSupplyIds) {
      const invInicial = initialInventory[supplyId] ?? 0;
      const entradas = transferEntries[supplyId] ?? 0;
      const consumoTeorico = theoreticalMap.get(supplyId) ?? 0;
      const invFinalReal = finalInventory[supplyId] ?? 0;

      // Skip supplies with no movement (no initial, no entries, no consumption, no final)
      if (invInicial === 0 && entradas === 0 && consumoTeorico === 0 && invFinalReal === 0) {
        continue;
      }

      const invFinalTeorico = invInicial + entradas - consumoTeorico;
      const differenceGrams = Math.round((invFinalReal - invFinalTeorico) * 100) / 100;

      // Use theoretical consumption as denominator for % (how much SHOULD have been consumed)
      // If no theoretical consumption, use initial inventory as reference
      const referenceDenominator = consumoTeorico > 0 ? consumoTeorico : invInicial + entradas;
      const differencePercent =
        referenceDenominator > 0
          ? Math.round((differenceGrams / referenceDenominator) * 10000) / 100
          : 0;

      let alertType: AlertType = 'OK';
      if (differencePercent < -thresholdPercent) alertType = 'LOSS';
      else if (differencePercent > thresholdPercent) alertType = 'SURPLUS';

      alerts.push({
        storeId,
        date,
        physicalCountId: currentCount.id,
        closingWorkerId,
        countWorkerId: currentCount.workerId,
        supplyId,
        theoreticalGrams: Math.round(invFinalTeorico * 100) / 100,
        realGrams: invFinalReal,
        differenceGrams,
        differencePercent,
        alertType,
      });
    }

    if (alerts.length === 0) return [];

    return this.dailyAlertRepo.createMany(alerts);
  }

  /**
   * Gets alerts for a specific store and date.
   */
  async getDailyAlerts(storeId: string, date: string): Promise<DailyAlert[]> {
    return this.dailyAlertRepo.getByStoreAndDate(storeId, date);
  }

  /**
   * Gets alert history for a date range.
   */
  async getAlertHistory(
    storeId: string,
    from: string,
    to: string,
  ): Promise<DailyAlert[]> {
    return this.dailyAlertRepo.getByDateRange(storeId, from, to);
  }
}
