import { DailyAlert, AlertType } from '../domain/entities';
import { IDailyAlertRepository, IPhysicalCountRepository, ISupplyRepository } from '../domain/interfaces/repositories';
import { ValidationService } from './ValidationService';

export class AlertService {
  constructor(
    private dailyAlertRepo: IDailyAlertRepository,
    private validationService: ValidationService,
    private physicalCountRepo: IPhysicalCountRepository,
    private supplyRepo: ISupplyRepository,
  ) {}

  /**
   * Triggers inventory validation after cash closing.
   * Compares theoretical consumption (from sales + recipes) with
   * actual inventory (from the latest physical count).
   */
  async triggerPostClosingValidation(
    storeId: string,
    date: string,
    closingWorkerId?: string,
  ): Promise<DailyAlert[]> {
    // Get the latest physical count for this store
    const latestCount = await this.physicalCountRepo.getLatest(storeId);
    if (!latestCount) {
      // No physical count yet — cannot validate
      return [];
    }

    // Build real inventory map from the physical count
    const realInventory: Record<string, number> = {};
    for (const item of latestCount.items) {
      realInventory[item.supplyId] = item.totalGrams;
    }

    // Get theoretical consumption for the day
    const theoretical = await this.validationService.calculateTheoreticalConsumption(
      storeId,
      date,
      date,
    );

    // Get all supplies for names
    const supplies = await this.supplyRepo.getAll();
    const supplyMap = new Map(supplies.map((s) => [s.id, s]));

    // Calculate alerts
    const alerts: Omit<DailyAlert, 'id'>[] = [];
    const thresholdPercent = 5;

    for (const tc of theoretical) {
      if (tc.theoreticalGrams === 0) continue;

      const realGrams = realInventory[tc.supplyId] ?? 0;
      // Theoretical consumption tells us how much SHOULD have been consumed.
      // We compare it with actual remaining inventory.
      // differenceGrams: positive = surplus (less consumed than expected), negative = loss
      const differenceGrams = Math.round((realGrams - tc.theoreticalGrams) * 100) / 100;
      const differencePercent =
        tc.theoreticalGrams > 0
          ? Math.round((differenceGrams / tc.theoreticalGrams) * 10000) / 100
          : 0;

      let alertType: AlertType = 'OK';
      if (differencePercent > thresholdPercent) alertType = 'SURPLUS';
      else if (differencePercent < -thresholdPercent) alertType = 'LOSS';

      alerts.push({
        storeId,
        date,
        physicalCountId: latestCount.id,
        closingWorkerId,
        countWorkerId: latestCount.workerId,
        supplyId: tc.supplyId,
        theoreticalGrams: tc.theoreticalGrams,
        realGrams,
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
