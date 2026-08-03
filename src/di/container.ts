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
  SupabaseCashAuditRepository,
  SupabaseCreditRepository,
  SupabaseWorkerRepository,
  SupabaseWorkerStoreAssignmentRepository,
  SupabaseScheduleRepository,
  SupabaseAttendanceRepository,
  SupabasePayrollRepository,
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
  SupabaseAdditionCatalogRepository,
  SupabaseCashOpeningRepository,
  SupabaseChecklistRepository,
  SupabaseCustomerRepository,
  SupabaseIncomeRepository,
  SupabaseInventoryAdjustmentRepository,
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
  AccountingService,
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
const cashAuditRepo = new SupabaseCashAuditRepository();
const creditRepo = new SupabaseCreditRepository();
const workerRepo = new SupabaseWorkerRepository();
const workerStoreAssignmentRepo = new SupabaseWorkerStoreAssignmentRepository();
const scheduleRepo = new SupabaseScheduleRepository();
const attendanceRepo = new SupabaseAttendanceRepository();
const payrollRepo = new SupabasePayrollRepository();
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
const additionCatalogRepo = new SupabaseAdditionCatalogRepository();
const cashOpeningRepo = new SupabaseCashOpeningRepository();
const checklistRepo = new SupabaseChecklistRepository();
const customerRepo = new SupabaseCustomerRepository();
const incomeRepo = new SupabaseIncomeRepository();
const inventoryAdjustmentRepo = new SupabaseInventoryAdjustmentRepository();

// Services
const saleService = new SaleService(saleRepo, inventoryRepo, recipeRepo, supplyRepo, productRepo);
const inventoryService = new InventoryService(inventoryRepo, supplyRepo);
const transferService = new TransferService(transferRepo, inventoryRepo, supplyRepo);
const validationService = new ValidationService(saleRepo, recipeRepo, inventoryRepo, writeoffRepo);
const creditService = new CreditService(creditRepo, expenseRepo, incomeRepo);
const payrollService = new PayrollService(workerRepo, attendanceRepo, creditRepo, payrollRepo, expenseRepo);
const dashboardService = new DashboardService(saleRepo, inventoryRepo, supplyRepo, expenseRepo, purchaseRepo, recipeRepo, productRepo);
const authService = new SupabaseAuthService();
const physicalCountService = new PhysicalCountService(physicalCountRepo, inventoryRepo);
const productionService = new ProductionService(productionRecipeRepo, productionRecordRepo, inventoryRepo);
const demandEstimationService = new DemandEstimationService(demandEstimateRepo, recipeRepo, inventoryRepo, supplyRepo, productRepo, productStoreAssignmentRepo, stockMinimumRepo);
const alertService = new AlertService(dailyAlertRepo, validationService, physicalCountRepo, supplyRepo, transferRepo);
const writeoffService = new WriteoffService(writeoffRepo, inventoryRepo, recipeRepo);
const cashClosingService = new CashClosingService(cashClosingRepo, saleRepo, expenseRepo, alertService, cashOpeningRepo, scheduleRepo, attendanceRepo, workerRepo);
const accountingService = new AccountingService(saleRepo, expenseRepo, purchaseRepo, supplyRepo, transferRepo, writeoffRepo);

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
  cashAuditRepo,
  creditRepo,
  workerRepo,
  workerStoreAssignmentRepo,
  scheduleRepo,
  attendanceRepo,
  payrollRepo,
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
  additionCatalogRepo,
  cashOpeningRepo,
  checklistRepo,
  customerRepo,
  incomeRepo,
  inventoryAdjustmentRepo,

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
  accountingService,
};
