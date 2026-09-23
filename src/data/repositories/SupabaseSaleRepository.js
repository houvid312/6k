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
exports.SupabaseSaleRepository = void 0;
var supabase_1 = require("../../lib/supabase");
var enums_1 = require("../../domain/enums");
var dates_1 = require("../../utils/dates");
var LEGACY_SIZE_LABELS = {
    INDIVIDUAL: 'Individual',
    MEDIANA: 'Mediana',
    FAMILIAR: 'Familiar',
};
function saleItemAdditionRowToEntity(row) {
    return {
        additionCatalogId: row.addition_catalog_id,
        supplyId: row.supply_id,
        name: row.name,
        price: row.price,
        grams: row.grams,
        quantity: row.quantity,
    };
}
function saleItemRowToEntity(row, additions) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    return {
        id: row.id,
        productId: row.product_id,
        size: row.size ? row.size : undefined,
        formatId: (_a = row.format_id) !== null && _a !== void 0 ? _a : undefined,
        formatName: (_b = row.format_name) !== null && _b !== void 0 ? _b : (row.size ? ((_c = LEGACY_SIZE_LABELS[row.size]) !== null && _c !== void 0 ? _c : row.size) : ''),
        quantity: row.quantity,
        portions: row.portions,
        unitPrice: row.unit_price,
        subtotal: row.subtotal,
        recipeCostCop: (_d = row.recipe_cost_cop) !== null && _d !== void 0 ? _d : 0,
        additionsCostCop: (_e = row.additions_cost_cop) !== null && _e !== void 0 ? _e : 0,
        packagingCostCop: (_f = row.packaging_cost_cop) !== null && _f !== void 0 ? _f : 0,
        totalCostCop: (_g = row.total_cost_cop) !== null && _g !== void 0 ? _g : 0,
        additions: additions && additions.length > 0 ? additions : undefined,
        additionsTotal: row.additions_total || undefined,
        packagingSupplyId: (_h = row.packaging_supply_id) !== null && _h !== void 0 ? _h : undefined,
        packagingLabel: (_j = row.packaging_label) !== null && _j !== void 0 ? _j : undefined,
        packagingUnitPrice: (_k = row.packaging_unit_price) !== null && _k !== void 0 ? _k : 0,
        packagingQuantity: (_l = row.packaging_quantity) !== null && _l !== void 0 ? _l : 0,
        packagingTotal: (_m = row.packaging_total) !== null && _m !== void 0 ? _m : 0,
    };
}
function saleRowToEntity(row, items) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t;
    return {
        id: row.id,
        timestamp: row.created_at,
        storeId: row.store_id,
        items: items,
        totalPortions: row.total_portions,
        totalAmount: row.total_amount,
        packagingTotal: (_a = row.packaging_total) !== null && _a !== void 0 ? _a : 0,
        totalCostCop: (_b = row.total_cost_cop) !== null && _b !== void 0 ? _b : 0,
        grossMarginCop: (_c = row.gross_margin_cop) !== null && _c !== void 0 ? _c : (row.total_amount - ((_d = row.total_cost_cop) !== null && _d !== void 0 ? _d : 0)),
        cashAmount: row.cash_amount,
        bankAmount: row.bank_amount,
        paymentMethod: row.payment_method,
        observations: (_e = row.observations) !== null && _e !== void 0 ? _e : undefined,
        isPaid: (_f = row.is_paid) !== null && _f !== void 0 ? _f : true,
        isDispatched: (_g = row.is_dispatched) !== null && _g !== void 0 ? _g : false,
        isCredit: (_h = row.is_credit) !== null && _h !== void 0 ? _h : false,
        debtorName: (_j = row.debtor_name) !== null && _j !== void 0 ? _j : undefined,
        debtorType: (_k = row.debtor_type) !== null && _k !== void 0 ? _k : undefined,
        debtorWorkerId: (_l = row.debtor_worker_id) !== null && _l !== void 0 ? _l : undefined,
        debtorCustomerId: (_m = row.debtor_customer_id) !== null && _m !== void 0 ? _m : undefined,
        customerNote: (_o = row.customer_note) !== null && _o !== void 0 ? _o : undefined,
        workerName: (_s = (_q = (_p = row.worker) === null || _p === void 0 ? void 0 : _p.name) !== null && _q !== void 0 ? _q : (_r = row.workers) === null || _r === void 0 ? void 0 : _r.name) !== null && _s !== void 0 ? _s : undefined,
        packagingSupplyId: (_t = row.packaging_supply_id) !== null && _t !== void 0 ? _t : undefined,
    };
}
var SupabaseSaleRepository = /** @class */ (function () {
    function SupabaseSaleRepository() {
    }
    SupabaseSaleRepository.prototype.getAll = function (storeId) {
        return __awaiter(this, void 0, void 0, function () {
            var query, _a, data, error;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        query = supabase_1.supabase.from('sales').select('*, worker:worker_id(name)');
                        if (storeId) {
                            query = query.eq('store_id', storeId);
                        }
                        return [4 /*yield*/, query.order('created_at', { ascending: false })];
                    case 1:
                        _a = _b.sent(), data = _a.data, error = _a.error;
                        if (error)
                            throw error;
                        return [2 /*return*/, this.hydrateSales(data)];
                }
            });
        });
    };
    SupabaseSaleRepository.prototype.getById = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, data, error, row, items;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, supabase_1.supabase
                            .from('sales')
                            .select('*, worker:worker_id(name)')
                            .eq('id', id)
                            .single()];
                    case 1:
                        _a = _b.sent(), data = _a.data, error = _a.error;
                        if (error) {
                            if (error.code === 'PGRST116')
                                return [2 /*return*/, null];
                            throw error;
                        }
                        row = data;
                        return [4 /*yield*/, this.fetchSaleItems(row.id)];
                    case 2:
                        items = _b.sent();
                        return [2 /*return*/, saleRowToEntity(row, items)];
                }
            });
        });
    };
    SupabaseSaleRepository.prototype.getByDateRange = function (storeId, from, to, limit) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, fromUtc, toUtc, query, _b, data, error;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _a = (0, dates_1.colombiaDateRangeToUtc)(from, to), fromUtc = _a.fromUtc, toUtc = _a.toUtc;
                        query = supabase_1.supabase
                            .from('sales')
                            .select('*, worker:worker_id(name)')
                            .gte('created_at', fromUtc)
                            .lte('created_at', toUtc)
                            .order('created_at', { ascending: false });
                        if (storeId && storeId !== 'consolidado') {
                            query = query.eq('store_id', storeId);
                        }
                        if (limit) {
                            query = query.limit(limit);
                        }
                        return [4 /*yield*/, query];
                    case 1:
                        _b = _c.sent(), data = _b.data, error = _b.error;
                        if (error)
                            throw error;
                        return [2 /*return*/, this.hydrateSales(data)];
                }
            });
        });
    };
    SupabaseSaleRepository.prototype.getUnpaid = function (storeId) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, data, error, hydrated;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, supabase_1.supabase
                            .from('sales')
                            .select('*, worker:worker_id(name)')
                            .eq('store_id', storeId)
                            .or('is_paid.eq.false,is_dispatched.eq.false')
                            .order('created_at', { ascending: false })];
                    case 1:
                        _a = _b.sent(), data = _a.data, error = _a.error;
                        if (error)
                            throw error;
                        return [4 /*yield*/, this.hydrateSales(data)];
                    case 2:
                        hydrated = _b.sent();
                        return [2 /*return*/, hydrated.filter(function (sale) { return !(sale.isCredit && sale.isDispatched); })];
                }
            });
        });
    };
    SupabaseSaleRepository.prototype.markAsPaid = function (saleId) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, data, error, count;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, supabase_1.supabase
                            .from('sales')
                            .update({ is_paid: true })
                            .eq('id', saleId)
                            .select('id, is_paid')];
                    case 1:
                        _a = _b.sent(), data = _a.data, error = _a.error, count = _a.count;
                        if (error)
                            throw error;
                        if (!data || data.length === 0) {
                            throw new Error("No se pudo actualizar la venta ".concat(saleId, ". Verifica permisos RLS o que el registro exista."));
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    SupabaseSaleRepository.prototype.markAsDispatched = function (saleId) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, data, error;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, supabase_1.supabase
                            .from('sales')
                            .update({ is_dispatched: true })
                            .eq('id', saleId)
                            .select('id, is_dispatched')];
                    case 1:
                        _a = _b.sent(), data = _a.data, error = _a.error;
                        if (error)
                            throw error;
                        if (!data || data.length === 0) {
                            throw new Error("No se pudo actualizar la venta ".concat(saleId, ". Verifica permisos RLS o que el registro exista."));
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    SupabaseSaleRepository.prototype.updatePaymentMethod = function (saleId, paymentMethod) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, sale, fetchError, totalAmount, isCredit, cashAmount, bankAmount, error;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, supabase_1.supabase
                            .from('sales')
                            .select('total_amount, is_credit')
                            .eq('id', saleId)
                            .single()];
                    case 1:
                        _a = _b.sent(), sale = _a.data, fetchError = _a.error;
                        if (fetchError || !sale)
                            throw fetchError || new Error('Venta no encontrada');
                        totalAmount = sale.total_amount;
                        isCredit = sale.is_credit;
                        cashAmount = (paymentMethod === 'EFECTIVO' && !isCredit) ? totalAmount : 0;
                        bankAmount = (paymentMethod === 'TRANSFERENCIA' && !isCredit) ? totalAmount : 0;
                        return [4 /*yield*/, supabase_1.supabase
                                .from('sales')
                                .update({
                                payment_method: paymentMethod,
                                cash_amount: cashAmount,
                                bank_amount: bankAmount
                            })
                                .eq('id', saleId)];
                    case 2:
                        error = (_b.sent()).error;
                        if (error)
                            throw error;
                        return [2 /*return*/];
                }
            });
        });
    };
    SupabaseSaleRepository.prototype.markAsUnpaid = function (saleId) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, data, error;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, supabase_1.supabase
                            .from('sales')
                            .update({ is_paid: false })
                            .eq('id', saleId)
                            .select('id')];
                    case 1:
                        _a = _b.sent(), data = _a.data, error = _a.error;
                        if (error)
                            throw error;
                        if (!data || data.length === 0) {
                            throw new Error("No se pudo actualizar la venta ".concat(saleId, "."));
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    SupabaseSaleRepository.prototype.delete = function (saleId) {
        return __awaiter(this, void 0, void 0, function () {
            var error;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, supabase_1.supabase.from('sales').delete().eq('id', saleId)];
                    case 1:
                        error = (_a.sent()).error;
                        if (error)
                            throw error;
                        return [2 /*return*/];
                }
            });
        });
    };
    SupabaseSaleRepository.prototype.create = function (sale) {
        return __awaiter(this, void 0, void 0, function () {
            var workerId, session, worker, _a, data, error, saleRow, itemRows, _b, insertedItems, itemsError, _loop_1, i, deductError;
            var _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t;
            return __generator(this, function (_u) {
                switch (_u.label) {
                    case 0:
                        workerId = null;
                        return [4 /*yield*/, supabase_1.supabase.auth.getSession()];
                    case 1:
                        session = (_u.sent()).data.session;
                        if (!session) return [3 /*break*/, 3];
                        return [4 /*yield*/, supabase_1.supabase
                                .from('workers')
                                .select('id')
                                .eq('auth_user_id', session.user.id)
                                .single()];
                    case 2:
                        worker = (_u.sent()).data;
                        if (worker)
                            workerId = worker.id;
                        _u.label = 3;
                    case 3: return [4 /*yield*/, supabase_1.supabase
                            .from('sales')
                            .insert({
                            store_id: sale.storeId,
                            created_at: (_c = sale.timestamp) !== null && _c !== void 0 ? _c : undefined,
                            worker_id: workerId,
                            payment_method: sale.paymentMethod,
                            total_portions: sale.totalPortions,
                            total_amount: sale.totalAmount,
                            packaging_total: (_d = sale.packagingTotal) !== null && _d !== void 0 ? _d : 0,
                            total_cost_cop: (_e = sale.totalCostCop) !== null && _e !== void 0 ? _e : 0,
                            gross_margin_cop: (_f = sale.grossMarginCop) !== null && _f !== void 0 ? _f : sale.totalAmount - ((_g = sale.totalCostCop) !== null && _g !== void 0 ? _g : 0),
                            cash_amount: sale.cashAmount,
                            bank_amount: sale.bankAmount,
                            observations: (_h = sale.observations) !== null && _h !== void 0 ? _h : null,
                            is_paid: (_j = sale.isPaid) !== null && _j !== void 0 ? _j : true,
                            is_dispatched: (_k = sale.isDispatched) !== null && _k !== void 0 ? _k : false,
                            is_credit: (_l = sale.isCredit) !== null && _l !== void 0 ? _l : false,
                            debtor_name: (_m = sale.debtorName) !== null && _m !== void 0 ? _m : null,
                            debtor_type: (_o = sale.debtorType) !== null && _o !== void 0 ? _o : null,
                            debtor_worker_id: (_p = sale.debtorWorkerId) !== null && _p !== void 0 ? _p : null,
                            debtor_customer_id: (_q = sale.debtorCustomerId) !== null && _q !== void 0 ? _q : null,
                            customer_note: (_r = sale.customerNote) !== null && _r !== void 0 ? _r : null,
                            packaging_supply_id: (_s = sale.packagingSupplyId) !== null && _s !== void 0 ? _s : null,
                        })
                            .select()
                            .single()];
                    case 4:
                        _a = _u.sent(), data = _a.data, error = _a.error;
                        if (error)
                            throw error;
                        saleRow = data;
                        itemRows = sale.items.map(function (item) {
                            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
                            return ({
                                sale_id: saleRow.id,
                                product_id: item.productId,
                                size: (_a = item.size) !== null && _a !== void 0 ? _a : null,
                                format_id: (_b = item.formatId) !== null && _b !== void 0 ? _b : null,
                                format_name: (_c = item.formatName) !== null && _c !== void 0 ? _c : null,
                                quantity: item.quantity,
                                portions: item.portions,
                                unit_price: item.unitPrice,
                                subtotal: item.subtotal,
                                recipe_cost_cop: (_d = item.recipeCostCop) !== null && _d !== void 0 ? _d : 0,
                                additions_cost_cop: (_e = item.additionsCostCop) !== null && _e !== void 0 ? _e : 0,
                                packaging_cost_cop: (_f = item.packagingCostCop) !== null && _f !== void 0 ? _f : 0,
                                total_cost_cop: (_g = item.totalCostCop) !== null && _g !== void 0 ? _g : 0,
                                additions_total: (_h = item.additionsTotal) !== null && _h !== void 0 ? _h : 0,
                                packaging_supply_id: (_j = item.packagingSupplyId) !== null && _j !== void 0 ? _j : null,
                                packaging_label: (_k = item.packagingLabel) !== null && _k !== void 0 ? _k : null,
                                packaging_unit_price: (_l = item.packagingUnitPrice) !== null && _l !== void 0 ? _l : 0,
                                packaging_quantity: (_m = item.packagingQuantity) !== null && _m !== void 0 ? _m : 0,
                                packaging_total: (_o = item.packagingTotal) !== null && _o !== void 0 ? _o : 0,
                            });
                        });
                        return [4 /*yield*/, supabase_1.supabase
                                .from('sale_items')
                                .insert(itemRows)
                                .select('id')];
                    case 5:
                        _b = _u.sent(), insertedItems = _b.data, itemsError = _b.error;
                        if (itemsError)
                            throw itemsError;
                        if (!insertedItems) return [3 /*break*/, 9];
                        _loop_1 = function (i) {
                            var additions, additionRows, addError;
                            return __generator(this, function (_v) {
                                switch (_v.label) {
                                    case 0:
                                        additions = (_t = sale.items[i].additions) !== null && _t !== void 0 ? _t : [];
                                        if (!(additions.length > 0)) return [3 /*break*/, 2];
                                        additionRows = additions.map(function (a) { return ({
                                            sale_item_id: insertedItems[i].id,
                                            addition_catalog_id: a.additionCatalogId,
                                            supply_id: a.supplyId,
                                            name: a.name,
                                            price: a.price,
                                            grams: a.grams,
                                            quantity: a.quantity,
                                        }); });
                                        return [4 /*yield*/, supabase_1.supabase.from('sale_item_additions').insert(additionRows)];
                                    case 1:
                                        addError = (_v.sent()).error;
                                        if (addError) {
                                            console.error('Error insertando adiciones:', addError);
                                        }
                                        _v.label = 2;
                                    case 2: return [2 /*return*/];
                                }
                            });
                        };
                        i = 0;
                        _u.label = 6;
                    case 6:
                        if (!(i < insertedItems.length)) return [3 /*break*/, 9];
                        return [5 /*yield**/, _loop_1(i)];
                    case 7:
                        _u.sent();
                        _u.label = 8;
                    case 8:
                        i++;
                        return [3 /*break*/, 6];
                    case 9: return [4 /*yield*/, supabase_1.supabase.rpc('deduct_inventory_for_sale', {
                            p_sale_id: saleRow.id,
                        })];
                    case 10:
                        deductError = (_u.sent()).error;
                        if (deductError) {
                            console.error('Error descontando inventario:', deductError);
                            // No lanzar error para no bloquear la venta si falla el descuento
                        }
                        return [2 /*return*/, this.getById(saleRow.id)];
                }
            });
        });
    };
    SupabaseSaleRepository.prototype.update = function (sale) {
        return __awaiter(this, void 0, void 0, function () {
            var itemPayload, error, updated;
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
            return __generator(this, function (_o) {
                switch (_o.label) {
                    case 0:
                        itemPayload = sale.items.map(function (item) {
                            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
                            return ({
                                product_id: item.productId,
                                size: (_a = item.size) !== null && _a !== void 0 ? _a : null,
                                format_id: (_b = item.formatId) !== null && _b !== void 0 ? _b : null,
                                format_name: (_c = item.formatName) !== null && _c !== void 0 ? _c : null,
                                quantity: item.quantity,
                                portions: item.portions,
                                unit_price: item.unitPrice,
                                subtotal: item.subtotal,
                                recipe_cost_cop: (_d = item.recipeCostCop) !== null && _d !== void 0 ? _d : 0,
                                additions_cost_cop: (_e = item.additionsCostCop) !== null && _e !== void 0 ? _e : 0,
                                packaging_cost_cop: (_f = item.packagingCostCop) !== null && _f !== void 0 ? _f : 0,
                                total_cost_cop: (_g = item.totalCostCop) !== null && _g !== void 0 ? _g : 0,
                                additions_total: (_h = item.additionsTotal) !== null && _h !== void 0 ? _h : 0,
                                packaging_supply_id: (_j = item.packagingSupplyId) !== null && _j !== void 0 ? _j : null,
                                packaging_label: (_k = item.packagingLabel) !== null && _k !== void 0 ? _k : null,
                                packaging_unit_price: (_l = item.packagingUnitPrice) !== null && _l !== void 0 ? _l : 0,
                                packaging_quantity: (_m = item.packagingQuantity) !== null && _m !== void 0 ? _m : 0,
                                packaging_total: (_o = item.packagingTotal) !== null && _o !== void 0 ? _o : 0,
                                additions: ((_p = item.additions) !== null && _p !== void 0 ? _p : []).map(function (addition) { return ({
                                    addition_catalog_id: addition.additionCatalogId,
                                    supply_id: addition.supplyId,
                                    name: addition.name,
                                    price: addition.price,
                                    grams: addition.grams,
                                    quantity: addition.quantity,
                                }); }),
                            });
                        });
                        return [4 /*yield*/, supabase_1.supabase.rpc('replace_pending_sale_order', {
                                p_sale_id: sale.id,
                                p_payment_method: sale.paymentMethod,
                                p_total_portions: sale.totalPortions,
                                p_total_amount: sale.totalAmount,
                                p_packaging_total: (_a = sale.packagingTotal) !== null && _a !== void 0 ? _a : 0,
                                p_cash_amount: sale.cashAmount,
                                p_bank_amount: sale.bankAmount,
                                p_observations: (_b = sale.observations) !== null && _b !== void 0 ? _b : '',
                                p_is_paid: sale.isPaid,
                                p_customer_note: (_c = sale.customerNote) !== null && _c !== void 0 ? _c : '',
                                p_packaging_supply_id: (_d = sale.packagingSupplyId) !== null && _d !== void 0 ? _d : null,
                                p_total_cost_cop: (_e = sale.totalCostCop) !== null && _e !== void 0 ? _e : 0,
                                p_gross_margin_cop: (_f = sale.grossMarginCop) !== null && _f !== void 0 ? _f : sale.totalAmount - ((_g = sale.totalCostCop) !== null && _g !== void 0 ? _g : 0),
                                p_items: itemPayload,
                                p_is_credit: (_h = sale.isCredit) !== null && _h !== void 0 ? _h : false,
                                p_debtor_name: (_j = sale.debtorName) !== null && _j !== void 0 ? _j : null,
                                p_debtor_type: (_k = sale.debtorType) !== null && _k !== void 0 ? _k : null,
                                p_debtor_worker_id: (_l = sale.debtorWorkerId) !== null && _l !== void 0 ? _l : null,
                                p_debtor_customer_id: (_m = sale.debtorCustomerId) !== null && _m !== void 0 ? _m : null,
                            })];
                    case 1:
                        error = (_o.sent()).error;
                        if (error)
                            throw error;
                        if (!sale.timestamp) return [3 /*break*/, 3];
                        return [4 /*yield*/, supabase_1.supabase.from('sales').update({ created_at: sale.timestamp }).eq('id', sale.id)];
                    case 2:
                        _o.sent();
                        _o.label = 3;
                    case 3: return [4 /*yield*/, this.getById(sale.id)];
                    case 4:
                        updated = _o.sent();
                        if (!updated) {
                            throw new Error("No se pudo cargar la venta actualizada ".concat(sale.id, "."));
                        }
                        return [2 /*return*/, updated];
                }
            });
        });
    };
    SupabaseSaleRepository.prototype.getDailySummary = function (storeId, date) {
        return __awaiter(this, void 0, void 0, function () {
            var dates, _a, data, error, totalPortions, totalAmount, totalCashAmount, totalBankAmount, totalCreditAmount, _i, _b, row;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        dates = (0, dates_1.colombiaDateRangeToUtc)(date, date);
                        return [4 /*yield*/, supabase_1.supabase
                                .from('sales')
                                .select('total_portions, total_amount, payment_method, is_credit')
                                .eq('store_id', storeId)
                                .gte('created_at', dates.fromUtc)
                                .lte('created_at', dates.toUtc)];
                    case 1:
                        _a = _c.sent(), data = _a.data, error = _a.error;
                        if (error)
                            throw error;
                        totalPortions = 0;
                        totalAmount = 0;
                        totalCashAmount = 0;
                        totalBankAmount = 0;
                        totalCreditAmount = 0;
                        for (_i = 0, _b = data || []; _i < _b.length; _i++) {
                            row = _b[_i];
                            totalPortions += row.total_portions || 0;
                            totalAmount += row.total_amount || 0;
                            if (row.is_credit) {
                                totalCreditAmount += row.total_amount || 0;
                            }
                            else if (row.payment_method === enums_1.PaymentMethod.EFECTIVO) {
                                totalCashAmount += row.total_amount || 0;
                            }
                            else if (row.payment_method === enums_1.PaymentMethod.TRANSFERENCIA) {
                                totalBankAmount += row.total_amount || 0;
                            }
                        }
                        return [2 /*return*/, {
                                totalPortions: totalPortions,
                                totalAmount: totalAmount,
                                totalCashAmount: totalCashAmount,
                                totalBankAmount: totalBankAmount,
                                totalCreditAmount: totalCreditAmount,
                                salesCount: (data === null || data === void 0 ? void 0 : data.length) || 0,
                            }];
                }
            });
        });
    };
    SupabaseSaleRepository.prototype.getDashboardMetrics = function (storeId, startDate, endDate) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, data, error;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, supabase_1.supabase.rpc('get_dashboard_metrics', {
                            p_store_id: storeId,
                            p_start_date: startDate,
                            p_end_date: endDate,
                        })];
                    case 1:
                        _a = _b.sent(), data = _a.data, error = _a.error;
                        if (error)
                            throw error;
                        return [2 /*return*/, data];
                }
            });
        });
    };
    SupabaseSaleRepository.prototype.getAccountingPnL = function (storeId, startDate, endDate) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, data, error;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, supabase_1.supabase.rpc('get_accounting_pnl', {
                            p_store_id: storeId,
                            p_start_date: startDate,
                            p_end_date: endDate,
                        })];
                    case 1:
                        _a = _b.sent(), data = _a.data, error = _a.error;
                        if (error)
                            throw error;
                        return [2 /*return*/, data];
                }
            });
        });
    };
    SupabaseSaleRepository.prototype.getDailyLedgerSales = function (storeId, startDate, endDate) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, data, error;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, supabase_1.supabase.rpc('get_daily_sales_ledger', {
                            p_store_id: storeId,
                            p_start_date: startDate,
                            p_end_date: endDate,
                        })];
                    case 1:
                        _a = _b.sent(), data = _a.data, error = _a.error;
                        if (error)
                            throw error;
                        return [2 /*return*/, data];
                }
            });
        });
    };
    SupabaseSaleRepository.prototype.fetchSaleItems = function (saleId) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, data, error, itemIds, additionsByItem;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, supabase_1.supabase
                            .from('sale_items')
                            .select('*')
                            .eq('sale_id', saleId)];
                    case 1:
                        _a = _b.sent(), data = _a.data, error = _a.error;
                        if (error)
                            throw error;
                        itemIds = data.map(function (r) { return r.id; });
                        return [4 /*yield*/, this.fetchAdditionsForItems(itemIds)];
                    case 2:
                        additionsByItem = _b.sent();
                        return [2 /*return*/, data.map(function (row) {
                                return saleItemRowToEntity(row, additionsByItem.get(row.id));
                            })];
                }
            });
        });
    };
    SupabaseSaleRepository.prototype.chunkArray = function (array, size) {
        var chunks = [];
        for (var i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    };
    SupabaseSaleRepository.prototype.fetchAdditionsForItems = function (itemIds) {
        return __awaiter(this, void 0, void 0, function () {
            var result, itemIdChunks, chunkResults, allData, _i, allData_1, row, additions;
            var _this = this;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        result = new Map();
                        if (itemIds.length === 0)
                            return [2 /*return*/, result];
                        itemIdChunks = this.chunkArray(itemIds, 40);
                        return [4 /*yield*/, Promise.all(itemIdChunks.map(function (chunk) { return __awaiter(_this, void 0, void 0, function () {
                                var _a, data, error;
                                var _b;
                                return __generator(this, function (_c) {
                                    switch (_c.label) {
                                        case 0: return [4 /*yield*/, supabase_1.supabase
                                                .from('sale_item_additions')
                                                .select('*')
                                                .in('sale_item_id', chunk)];
                                        case 1:
                                            _a = _c.sent(), data = _a.data, error = _a.error;
                                            if (error)
                                                return [2 /*return*/, []];
                                            return [2 /*return*/, (_b = data) !== null && _b !== void 0 ? _b : []];
                                    }
                                });
                            }); }))];
                    case 1:
                        chunkResults = _b.sent();
                        allData = chunkResults.flat();
                        for (_i = 0, allData_1 = allData; _i < allData_1.length; _i++) {
                            row = allData_1[_i];
                            additions = (_a = result.get(row.sale_item_id)) !== null && _a !== void 0 ? _a : [];
                            additions.push(saleItemAdditionRowToEntity(row));
                            result.set(row.sale_item_id, additions);
                        }
                        return [2 /*return*/, result];
                }
            });
        });
    };
    SupabaseSaleRepository.prototype.hydrateSales = function (rows) {
        return __awaiter(this, void 0, void 0, function () {
            var saleIds, saleIdChunks, chunkResults, itemData, allItemIds, additionsByItem, itemsBySale, _i, itemData_1, row, items;
            var _this = this;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (rows.length === 0)
                            return [2 /*return*/, []];
                        saleIds = rows.map(function (r) { return r.id; });
                        saleIdChunks = this.chunkArray(saleIds, 40);
                        return [4 /*yield*/, Promise.all(saleIdChunks.map(function (chunk) { return __awaiter(_this, void 0, void 0, function () {
                                var _a, data, error;
                                var _b;
                                return __generator(this, function (_c) {
                                    switch (_c.label) {
                                        case 0: return [4 /*yield*/, supabase_1.supabase
                                                .from('sale_items')
                                                .select('*')
                                                .in('sale_id', chunk)];
                                        case 1:
                                            _a = _c.sent(), data = _a.data, error = _a.error;
                                            if (error)
                                                throw error;
                                            return [2 /*return*/, (_b = data) !== null && _b !== void 0 ? _b : []];
                                    }
                                });
                            }); }))];
                    case 1:
                        chunkResults = _b.sent();
                        itemData = chunkResults.flat();
                        allItemIds = itemData.map(function (r) { return r.id; });
                        return [4 /*yield*/, this.fetchAdditionsForItems(allItemIds)];
                    case 2:
                        additionsByItem = _b.sent();
                        itemsBySale = new Map();
                        for (_i = 0, itemData_1 = itemData; _i < itemData_1.length; _i++) {
                            row = itemData_1[_i];
                            items = (_a = itemsBySale.get(row.sale_id)) !== null && _a !== void 0 ? _a : [];
                            items.push(saleItemRowToEntity(row, additionsByItem.get(row.id)));
                            itemsBySale.set(row.sale_id, items);
                        }
                        return [2 /*return*/, rows.map(function (r) { var _a; return saleRowToEntity(r, (_a = itemsBySale.get(r.id)) !== null && _a !== void 0 ? _a : []); })];
                }
            });
        });
    };
    return SupabaseSaleRepository;
}());
exports.SupabaseSaleRepository = SupabaseSaleRepository;
