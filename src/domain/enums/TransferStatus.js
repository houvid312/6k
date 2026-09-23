"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransferStatus = void 0;
var TransferStatus;
(function (TransferStatus) {
    TransferStatus["PENDING"] = "PENDING";
    TransferStatus["IN_TRANSIT"] = "IN_TRANSIT";
    TransferStatus["RECEIVED"] = "RECEIVED";
    TransferStatus["CANCELLED"] = "CANCELLED";
})(TransferStatus || (exports.TransferStatus = TransferStatus = {}));
