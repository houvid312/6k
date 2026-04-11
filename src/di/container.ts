import {
  SupabaseSaleRepository,
  SupabaseInventoryRepository,
  SupabaseRecipeRepository,
  SupabaseProductRepository,
  SupabaseSupplyRepository,
  SupabaseStoreRepository,
  SupabasePurchaseRepository,
  SupabaseTransferRepository,
  SupabaseCashClosingRepository,
  SupabaseCreditRepository,
  SupabaseWorkerRepository,
  SupabaseScheduleRepository,
  SupabaseAttendanceRepository,
  SupabaseExpenseRepository,
  SupabasePhysicalCountRepository,
  SupabaseProductionRecipeRepository,
  SupabaseProductionRecordRepository,
  SupabaseDemandEstimateRepository,
  SupabaseDailyAlertRepository,
  SupabaseStockMinimumRepository,
  SupabaseWriteoffRepository,
  SupabaseProductFormatRepository,
  SupabaseProductStoreAssignmentRepository,
} from '../data/repositories';
import {
  SaleService,
  InventoryService,
  CashClosingService,
  TransferService,
  ValidationService,
  CreditService,
  PayrollService,
  DashboardService,
  SupabaseAuthService,
  PhysicalCountService,
  ProductionService,
  DemandEstimationService,
  AlertService,
  WriteoffService,
} from '../services';

// Repositories (Supabase)
const saleRepo = new SupabaseSaleRepository();
const inventoryRepo = new SupabaseInventoryRepository();
const recipeRepo = new SupabaseRecipeRepository();
const productRepo = new SupabaseProductRepository();
const supplyRepo = new SupabaseSupplyRepository();
const storeRepo = new SupabaseStoreRepository();
const purchaseRepo = new SupabasePurchaseRepository();
const transferRepo = new SupabaseTransferRepository();
const cashClosingRepo = new SupabaseCashClosingRepository();
const creditRepo = new SupabaseCreditRepository();
const workerRepo = new SupabaseWorkerRepository();
const scheduleRepo = new SupabaseScheduleRepository();
const attendanceRepo = new SupabaseAttendanceRepository();
const expenseRepo = new SupabaseExpenseRepository();
const physicalCountRepo = new SupabasePhysicalCountRepository();
const productionRecipeRepo = new SupabaseProductionRecipeRepository();
const productionRecordRepo = new SupabaseProductionRecordRepository();
const demandEstimateRepo = new SupabaseDemandEstimateRepository();
const dailyAlertRepo = new SupabaseDailyAlertRepository();
const stockMinimumRepo = new SupabaseStockMinimumRepository();
const writeoffRepo = new SupabaseWriteoffRepository();
const productFormatRepo = new SupabaseProductFormatRepository();
const productStoreAssignmentRepo = new SupabaseProductStoreAssignmentRepository();

// Services
const saleService = new SaleService(saleRepo, inventoryRepo, recipeRepo);
const inventoryService = new InventoryService(inventoryRepo, supplyRepo);
const transferService = new TransferService(transferRepo, inventoryRepo, supplyRepo);
const validationService = new ValidationService(saleRepo, recipeRepo, inventoryRepo, writeoffRepo);
const creditService = new CreditService(creditRepo);
const payrollService = new PayrollService(workerRepo, attendanceRepo, creditRepo);
const dashboardService = new DashboardService(saleRepo, inventoryRepo, supplyRepo, expenseRepo, purchaseRepo, recipeRepo, productRepo);
const authService = new SupabaseAuthService();
const physicalCountService = new PhysicalCountService(physicalCountRepo, inventoryRepo);
const productionService = new ProductionService(productionRecipeRepo, productionRecordRepo, inventoryRepo);
const demandEstimationService = new DemandEstimationService(demandEstimateRepo, recipeRepo, inventoryRepo, supplyRepo, productRepo, productStoreAssignmentRepo);
const alertService = new AlertService(dailyAlertRepo, validationService, physicalCountRepo, supplyRepo, transferRepo);
const writeoffService = new WriteoffService(writeoffRepo, inventoryRepo);
const cashClosingService = new CashClosingService(cashClosingRepo, saleRepo, expenseRepo, alertService);

export const container = {
  // Repositories
  saleRepo,
  inventoryRepo,
  recipeRepo,
  productRepo,
  supplyRepo,
  storeRepo,
  purchaseRepo,
  transferRepo,
  cashClosingRepo,
  creditRepo,
  workerRepo,
  scheduleRepo,
  attendanceRepo,
  expenseRepo,
  physicalCountRepo,
  productionRecipeRepo,
  productionRecordRepo,
  demandEstimateRepo,
  dailyAlertRepo,
  stockMinimumRepo,
  writeoffRepo,
  productFormatRepo,
  productStoreAssignmentRepo,

  // Services
  saleService,
  inventoryService,
  cashClosingService,
  transferService,
  validationService,
  creditService,
  payrollService,
  dashboardService,
  authService,
  physicalCountService,
  productionService,
  demandEstimationService,
  alertService,
  writeoffService,
};
