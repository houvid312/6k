"use strict";
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PACKAGING_SALE_PRICE_COP_BY_ID = exports.PACKAGING_LABEL_BY_ID = exports.PACKAGING_OPTIONS = exports.MASA_SUPPLY_IDS = exports.PACKAGING_SUPPLY_IDS = exports.PizzaSize = void 0;
var PizzaSize;
(function (PizzaSize) {
    PizzaSize["FAMILIAR"] = "FAMILIAR";
    PizzaSize["MEDIANA"] = "MEDIANA";
    PizzaSize["INDIVIDUAL"] = "INDIVIDUAL";
})(PizzaSize || (exports.PizzaSize = PizzaSize = {}));
// IDs de insumos de empaque (deben coincidir con la migración 016)
exports.PACKAGING_SUPPLY_IDS = {
    CAJA_FAMILIAR: '00000000-0000-0000-0002-000000000101',
    CAJA_MEDIANA: '00000000-0000-0000-0002-000000000102',
    EMPAQUE_DIAMANTE_INDIVIDUAL: '00000000-0000-0000-0002-000000000103',
};
// IDs de insumos de masas estiradas (deben coincidir con la migración 069)
exports.MASA_SUPPLY_IDS = {
    MASA_GENERICA: '00000000-0000-0000-0002-000000000001',
    MASA_FAMILIAR: '00000000-0000-0000-0002-000000000201',
    MASA_MEDIANA: '00000000-0000-0000-0002-000000000202',
    MASA_DIAMANTE: '00000000-0000-0000-0002-000000000203',
};
// Opciones de empaque para seleccionar a nivel de carrito/venta
exports.PACKAGING_OPTIONS = [
    { id: exports.PACKAGING_SUPPLY_IDS.CAJA_FAMILIAR, label: 'Caja Familiar', shortLabel: 'Caja Fam.', icon: 'package-variant' },
    { id: exports.PACKAGING_SUPPLY_IDS.CAJA_MEDIANA, label: 'Caja Mediana', shortLabel: 'Caja Med.', icon: 'package-variant' },
    { id: exports.PACKAGING_SUPPLY_IDS.EMPAQUE_DIAMANTE_INDIVIDUAL, label: 'Empaque', shortLabel: 'Emp.', icon: 'wrap' },
];
exports.PACKAGING_LABEL_BY_ID = (_a = {},
    _a[exports.PACKAGING_SUPPLY_IDS.CAJA_FAMILIAR] = 'Caja Familiar',
    _a[exports.PACKAGING_SUPPLY_IDS.CAJA_MEDIANA] = 'Caja Mediana',
    _a[exports.PACKAGING_SUPPLY_IDS.EMPAQUE_DIAMANTE_INDIVIDUAL] = 'Empaque',
    _a);
// Fallback local. El precio editable vive en supplies.sale_price_cop.
exports.PACKAGING_SALE_PRICE_COP_BY_ID = (_b = {},
    _b[exports.PACKAGING_SUPPLY_IDS.CAJA_FAMILIAR] = 0,
    _b[exports.PACKAGING_SUPPLY_IDS.CAJA_MEDIANA] = 0,
    _b[exports.PACKAGING_SUPPLY_IDS.EMPAQUE_DIAMANTE_INDIVIDUAL] = 0,
    _b);
