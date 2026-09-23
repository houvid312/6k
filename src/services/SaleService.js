"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SaleService = void 0;
var enums_1 = require("../domain/enums");
var SaleService = /** @class */ (function () {
    function SaleService(saleRepo, inventoryRepo, recipeRepo, supplyRepo, productRepo, productFormatRepo) {
        this.saleRepo = saleRepo;
        this.inventoryRepo = inventoryRepo;
        this.recipeRepo = recipeRepo;
        this.supplyRepo = supplyRepo;
        this.productRepo = productRepo;
        this.productFormatRepo = productFormatRepo;
    }
    SaleService.prototype.valueQuantityAtStorePrice = function (supplyById, supplyId, quantity) {
        if (!supplyId || quantity <= 0)
            return 0;
        var supply = supplyById.get(supplyId);
        if (!(supply === null || supply === void 0 ? void 0 : supply.isBillableToStore) || supply.gramsPerBag <= 0 || supply.commercialPriceCop <= 0) {
            return 0;
        }
        return Math.round((quantity / supply.gramsPerBag) * supply.commercialPriceCop);
    };
    SaleService.prototype.getRecipeCost = function (recipeByProductId, supplyById, productId, portions) {
        var _this = this;
        var _a;
        var recipe = recipeByProductId.get(productId);
        return ((_a = recipe === null || recipe === void 0 ? void 0 : recipe.ingredients) !== null && _a !== void 0 ? _a : []).reduce(function (sum, ingredient) { return sum + _this.valueQuantityAtStorePrice(supplyById, ingredient.supplyId, ingredient.gramsPerPortion * portions); }, 0);
    };
    SaleService.prototype.buildSaleItems = function (items) {
        return __awaiter(this, void 0, void 0, function () {
            var productIds, _a, recipes, supplies, products, formats, recipeByProductId, supplyById, productById, formatById, saleItems, totalPortions, _i, items_1, item, product, isPizza, portions, additionsTotal, isBox, defaultPkgQty, packagingQuantity, packagingUnitPrice, packagingTotal, subtotal, format, masaCostCop, recipeCostCop, additionsCostCop, packagingCostCop, totalCostCop;
            var _this = this;
            var _b, _c, _d, _e;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        productIds = Array.from(new Set(items.map(function (i) { return i.productId; })));
                        return [4 /*yield*/, Promise.all([
                                this.recipeRepo.getAll(),
                                this.supplyRepo.getAll(false),
                                this.productRepo ? this.productRepo.getAll() : Promise.resolve([]),
                                this.productFormatRepo && productIds.length > 0
                                    ? this.productFormatRepo.getByProductIds(productIds)
                                    : Promise.resolve([]),
                            ])];
                    case 1:
                        _a = _f.sent(), recipes = _a[0], supplies = _a[1], products = _a[2], formats = _a[3];
                        recipeByProductId = new Map(recipes.map(function (recipe) { return [recipe.productId, recipe]; }));
                        supplyById = new Map(supplies.map(function (supply) { return [supply.id, supply]; }));
                        productById = new Map(products.map(function (p) { return [p.id, p]; }));
                        formatById = new Map(formats.map(function (f) { return [f.id, f]; }));
                        saleItems = [];
                        totalPortions = 0;
                        for (_i = 0, items_1 = items; _i < items_1.length; _i++) {
                            item = items_1[_i];
                            product = productById.get(item.productId);
                            isPizza = !product || product.category === 'PIZZA';
                            portions = isPizza ? item.portionsPerUnit * item.quantity : 0;
                            additionsTotal = ((_b = item.additions) !== null && _b !== void 0 ? _b : []).reduce(function (s, a) { return s + a.price * a.quantity; }, 0);
                            isBox = item.packagingSupplyId === enums_1.PACKAGING_SUPPLY_IDS.CAJA_FAMILIAR
                                || item.packagingSupplyId === enums_1.PACKAGING_SUPPLY_IDS.CAJA_MEDIANA;
                            defaultPkgQty = (item.portionsPerUnit === 1 && isBox) ? 1 : item.quantity;
                            packagingQuantity = item.packagingSupplyId ? ((_c = item.packagingQuantity) !== null && _c !== void 0 ? _c : defaultPkgQty) : 0;
                            packagingUnitPrice = (_d = item.packagingUnitPrice) !== null && _d !== void 0 ? _d : 0;
                            packagingTotal = packagingUnitPrice * packagingQuantity;
                            subtotal = item.unitPrice * item.quantity + additionsTotal + packagingTotal;
                            format = item.formatId ? formatById.get(item.formatId) : undefined;
                            masaCostCop = ((format === null || format === void 0 ? void 0 : format.masaSupplyId) && format.masaGrams)
                                ? this.valueQuantityAtStorePrice(supplyById, format.masaSupplyId, format.masaGrams * item.quantity)
                                : 0;
                            recipeCostCop = this.getRecipeCost(recipeByProductId, supplyById, item.productId, portions) + masaCostCop;
                            additionsCostCop = ((_e = item.additions) !== null && _e !== void 0 ? _e : []).reduce(function (sum, addition) { return sum + _this.valueQuantityAtStorePrice(supplyById, addition.supplyId, addition.grams * addition.quantity); }, 0);
                            packagingCostCop = this.valueQuantityAtStorePrice(supplyById, item.packagingSupplyId, packagingQuantity);
                            totalCostCop = recipeCostCop + additionsCostCop + packagingCostCop;
                            totalPortions += portions;
                            saleItems.push({
                                id: "si-".concat(Date.now(), "-").concat(Math.random().toString(36).slice(2, 7)),
                                productId: item.productId,
                                formatId: item.formatId || undefined,
                                formatName: item.formatName,
                                quantity: item.quantity,
                                portions: portions,
                                unitPrice: item.unitPrice,
                                subtotal: subtotal,
                                recipeCostCop: recipeCostCop,
                                additionsCostCop: additionsCostCop,
                                packagingCostCop: packagingCostCop,
                                totalCostCop: totalCostCop,
                                additions: item.additions,
                                additionsTotal: additionsTotal || undefined,
                                packagingSupplyId: item.packagingSupplyId,
                                packagingLabel: item.packagingLabel,
                                packagingUnitPrice: packagingUnitPrice,
                                packagingQuantity: packagingQuantity,
                                packagingTotal: packagingTotal,
                            });
                        }
                        return [2 /*return*/, {
                                saleItems: saleItems,
                                totalPortions: totalPortions,
                                totalAmount: saleItems.reduce(function (sum, si) { return sum + si.subtotal; }, 0),
                                totalCostCop: saleItems.reduce(function (sum, si) { var _a; return sum + ((_a = si.totalCostCop) !== null && _a !== void 0 ? _a : 0); }, 0),
                                grossMarginCop: saleItems.reduce(function (sum, si) { return sum + si.subtotal; }, 0)
                                    - saleItems.reduce(function (sum, si) { var _a; return sum + ((_a = si.totalCostCop) !== null && _a !== void 0 ? _a : 0); }, 0),
                            }];
                }
            });
        });
    };
    /**
     * Creates a sale. Inventory deduction is handled automatically by the DB trigger.
     */
    SaleService.prototype.createSale = function (storeId_1, items_2, paymentMethod_1, cashAmount_1, bankAmount_1, observations_1) {
        return __awaiter(this, arguments, void 0, function (storeId, items, paymentMethod, cashAmount, bankAmount, observations, isPaid, customerNote, packagingSupplyId, isCredit, debtorName, debtorType, debtorWorkerId, debtorCustomerId, customTimestamp) {
            var _a, saleItems, totalPortions, totalAmount, totalCostCop, grossMarginCop, sale;
            if (isPaid === void 0) { isPaid = true; }
            if (isCredit === void 0) { isCredit = false; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.buildSaleItems(items)];
                    case 1:
                        _a = _b.sent(), saleItems = _a.saleItems, totalPortions = _a.totalPortions, totalAmount = _a.totalAmount, totalCostCop = _a.totalCostCop, grossMarginCop = _a.grossMarginCop;
                        return [4 /*yield*/, this.saleRepo.create({
                                storeId: storeId,
                                timestamp: customTimestamp !== null && customTimestamp !== void 0 ? customTimestamp : new Date().toISOString(),
                                items: saleItems,
                                totalPortions: totalPortions,
                                totalAmount: totalAmount,
                                packagingTotal: saleItems.reduce(function (sum, si) { var _a; return sum + ((_a = si.packagingTotal) !== null && _a !== void 0 ? _a : 0); }, 0),
                                totalCostCop: totalCostCop,
                                grossMarginCop: grossMarginCop,
                                paymentMethod: paymentMethod,
                                cashAmount: isCredit ? 0 : cashAmount,
                                bankAmount: isCredit ? 0 : bankAmount,
                                observations: observations !== null && observations !== void 0 ? observations : '',
                                isPaid: isPaid,
                                isDispatched: false,
                                isCredit: isCredit,
                                debtorName: debtorName,
                                debtorType: debtorType,
                                debtorWorkerId: debtorWorkerId,
                                debtorCustomerId: debtorCustomerId,
                                customerNote: customerNote !== null && customerNote !== void 0 ? customerNote : undefined,
                                packagingSupplyId: packagingSupplyId,
                            })];
                    case 2:
                        sale = _b.sent();
                        return [2 /*return*/, sale];
                }
            });
        });
    };
    /**
     * Replaces items/payment data for a sale that has not been dispatched.
     */
    SaleService.prototype.updateSale = function (saleId_1, storeId_1, items_2, paymentMethod_1, cashAmount_1, bankAmount_1, observations_1) {
        return __awaiter(this, arguments, void 0, function (saleId, storeId, items, paymentMethod, cashAmount, bankAmount, observations, isPaid, customerNote, packagingSupplyId, isCredit, debtorName, debtorType, debtorWorkerId, debtorCustomerId, customTimestamp) {
            var _a, saleItems, totalPortions, totalAmount, totalCostCop, grossMarginCop;
            if (isPaid === void 0) { isPaid = false; }
            if (isCredit === void 0) { isCredit = false; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.buildSaleItems(items)];
                    case 1:
                        _a = _b.sent(), saleItems = _a.saleItems, totalPortions = _a.totalPortions, totalAmount = _a.totalAmount, totalCostCop = _a.totalCostCop, grossMarginCop = _a.grossMarginCop;
                        return [2 /*return*/, this.saleRepo.update({
                                id: saleId,
                                storeId: storeId,
                                timestamp: customTimestamp !== null && customTimestamp !== void 0 ? customTimestamp : new Date().toISOString(),
                                items: saleItems,
                                totalPortions: totalPortions,
                                totalAmount: totalAmount,
                                packagingTotal: saleItems.reduce(function (sum, si) { var _a; return sum + ((_a = si.packagingTotal) !== null && _a !== void 0 ? _a : 0); }, 0),
                                totalCostCop: totalCostCop,
                                grossMarginCop: grossMarginCop,
                                paymentMethod: paymentMethod,
                                cashAmount: isCredit ? 0 : cashAmount,
                                bankAmount: isCredit ? 0 : bankAmount,
                                observations: observations !== null && observations !== void 0 ? observations : '',
                                isPaid: isPaid,
                                isDispatched: false,
                                isCredit: isCredit,
                                debtorName: debtorName,
                                debtorType: debtorType,
                                debtorWorkerId: debtorWorkerId,
                                debtorCustomerId: debtorCustomerId,
                                customerNote: customerNote !== null && customerNote !== void 0 ? customerNote : undefined,
                                packagingSupplyId: packagingSupplyId,
                            })];
                }
            });
        });
    };
    /**
     * Returns all sales for a given store.
     */
    SaleService.prototype.getSalesByStore = function (storeId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.saleRepo.getAll(storeId)];
            });
        });
    };
    /**
     * Returns daily summary (count, totals).
     */
    SaleService.prototype.getDailySummary = function (storeId, date) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.saleRepo.getDailySummary(storeId, date)];
            });
        });
    };
    /**
     * Returns sales for a date range.
     */
    SaleService.prototype.getSalesByDateRange = function (storeId, startDate, endDate, limit) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.saleRepo.getByDateRange(storeId, startDate, endDate, limit)];
            });
        });
    };
    SaleService.prototype.getDashboardMetrics = function (storeId, startDate, endDate) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.saleRepo.getDashboardMetrics(storeId, startDate, endDate)];
            });
        });
    };
    SaleService.prototype.getAccountingPnL = function (storeId, startDate, endDate) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.saleRepo.getAccountingPnL(storeId, startDate, endDate)];
            });
        });
    };
    SaleService.prototype.getDailyLedgerSales = function (storeId, startDate, endDate) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.saleRepo.getDailyLedgerSales(storeId, startDate, endDate)];
            });
        });
    };
    /**
     * Returns unpaid sales for a given store.
     */
    SaleService.prototype.getUnpaidSales = function (storeId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.saleRepo.getUnpaid(storeId)];
            });
        });
    };
    /**
     * Marks a sale as paid.
     */
    SaleService.prototype.markAsPaid = function (saleId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.saleRepo.markAsPaid(saleId)];
            });
        });
    };
    SaleService.prototype.markAsUnpaid = function (saleId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.saleRepo.markAsUnpaid(saleId)];
            });
        });
    };
    SaleService.prototype.updatePaymentMethod = function (saleId, paymentMethod) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.saleRepo.updatePaymentMethod(saleId, paymentMethod)];
            });
        });
    };
    /**
     * Marks a sale as dispatched.
     */
    SaleService.prototype.markAsDispatched = function (saleId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.saleRepo.markAsDispatched(saleId)];
            });
        });
    };
    /**
     * Deletes a sale.
     */
    SaleService.prototype.deleteSale = function (saleId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.saleRepo.delete(saleId)];
            });
        });
    };
    return SaleService;
}());
exports.SaleService = SaleService;
