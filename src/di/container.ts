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

// Services
const saleService = new SaleService(saleRepo, inventoryRepo, recipeRepo);
const inventoryService = new InventoryService(inventoryRepo, supplyRepo);
const cashClosingService = new CashClosingService(cashClosingRepo, saleRepo, expenseRepo);
const transferService = new TransferService(transferRepo, inventoryRepo, supplyRepo);
const validationService = new ValidationService(saleRepo, recipeRepo, inventoryRepo);
const creditService = new CreditService(creditRepo);
const payrollService = new PayrollService(workerRepo, attendanceRepo, creditRepo);
const dashboardService = new DashboardService(saleRepo, inventoryRepo, supplyRepo, expenseRepo, purchaseRepo);
const authService = new SupabaseAuthService();

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
};
