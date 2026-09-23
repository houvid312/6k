"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nowColombia = nowColombia;
exports.todayColombia = todayColombia;
exports.colombiaLocalToUtcISOString = colombiaLocalToUtcISOString;
exports.colombiaDateRangeToUtc = colombiaDateRangeToUtc;
exports.formatDate = formatDate;
exports.formatDateTime = formatDateTime;
exports.formatTime = formatTime;
exports.isToday = isToday;
exports.getWeekRange = getWeekRange;
exports.toISODate = toISODate;
exports.toISODateTZ = toISODateTZ;
exports.getColombiaDateString = getColombiaDateString;
var TIMEZONE = 'America/Bogota';
var COLOMBIA_UTC_OFFSET = '-05:00';
var DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
var HAS_TIMEZONE_PATTERN = /(Z|[+-]\d{2}:?\d{2})$/;
/**
 * Returns the current date/time in Colombia (America/Bogota) timezone.
 */
function nowColombia() {
    var colombiaStr = new Date().toLocaleString('en-US', { timeZone: TIMEZONE });
    return new Date(colombiaStr);
}
/**
 * Returns today's date string (YYYY-MM-DD) in Colombia timezone.
 */
function todayColombia() {
    return toISODate(nowColombia());
}
/**
 * Converts a Colombia-local date or datetime into an UTC ISO timestamp.
 *
 * Supabase stores timestamptz columns in UTC. Screens work with Colombia
 * business dates, so day filters must query the matching UTC bounds.
 */
function colombiaLocalToUtcISOString(value, endOfDay) {
    if (endOfDay === void 0) { endOfDay = false; }
    var localValue = value;
    if (DATE_ONLY_PATTERN.test(value)) {
        localValue = "".concat(value, "T").concat(endOfDay ? '23:59:59.999' : '00:00:00.000');
    }
    if (!HAS_TIMEZONE_PATTERN.test(localValue)) {
        localValue = "".concat(localValue).concat(COLOMBIA_UTC_OFFSET);
    }
    return new Date(localValue).toISOString();
}
/**
 * Returns UTC query bounds for Colombia-local date/datetime ranges.
 */
function colombiaDateRangeToUtc(from, to) {
    return {
        fromUtc: colombiaLocalToUtcISOString(from, false),
        toUtc: colombiaLocalToUtcISOString(to, true),
    };
}
/**
 * Formats a date as DD/MM/YYYY using Colombia timezone.
 */
function formatDate(date) {
    var _a, _b, _c, _d, _e, _f;
    if (!date)
        return '';
    if (typeof date === 'string') {
        var dateOnly = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dateOnly) {
            return "".concat(dateOnly[3], "/").concat(dateOnly[2], "/").concat(dateOnly[1]);
        }
    }
    var d = typeof date === 'string' ? new Date(date) : date;
    if (!d || isNaN(d.getTime())) {
        return typeof date === 'string' ? date : '';
    }
    try {
        var parts = new Intl.DateTimeFormat('es-CO', {
            timeZone: TIMEZONE,
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        }).formatToParts(d);
        var day = (_b = (_a = parts.find(function (p) { return p.type === 'day'; })) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : '01';
        var month = (_d = (_c = parts.find(function (p) { return p.type === 'month'; })) === null || _c === void 0 ? void 0 : _c.value) !== null && _d !== void 0 ? _d : '01';
        var year = (_f = (_e = parts.find(function (p) { return p.type === 'year'; })) === null || _e === void 0 ? void 0 : _e.value) !== null && _f !== void 0 ? _f : '2026';
        return "".concat(day, "/").concat(month, "/").concat(year);
    }
    catch (_g) {
        return typeof date === 'string' ? date : '';
    }
}
/**
 * Formats a date as DD/MM/YYYY HH:mm using Colombia timezone.
 */
function formatDateTime(date) {
    if (!date)
        return '';
    var d = typeof date === 'string' ? new Date(date) : date;
    if (!d || isNaN(d.getTime())) {
        return typeof date === 'string' ? date : '';
    }
    try {
        return new Intl.DateTimeFormat('es-CO', {
            timeZone: TIMEZONE,
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(d);
    }
    catch (_a) {
        return typeof date === 'string' ? date : '';
    }
}
/**
 * Formats a time as h:mm a.m./p.m. using Colombia timezone.
 */
function formatTime(date) {
    if (!date)
        return '';
    var d = typeof date === 'string' ? new Date(date) : date;
    if (!d || isNaN(d.getTime())) {
        return typeof date === 'string' ? date : '';
    }
    try {
        return new Intl.DateTimeFormat('es-CO', {
            timeZone: TIMEZONE,
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        }).format(d);
    }
    catch (_a) {
        return typeof date === 'string' ? date : '';
    }
}
/**
 * Checks if a date is today in Colombia timezone.
 */
function isToday(date) {
    if (!date)
        return false;
    var d = typeof date === 'string' ? new Date(date) : date;
    if (!d || isNaN(d.getTime()))
        return false;
    var dateStr = toISODateTZ(d);
    var todayStr = todayColombia();
    return dateStr === todayStr;
}
/**
 * Returns the Monday-Sunday range for the week containing the given date.
 */
function getWeekRange(date) {
    var d = new Date(date);
    var dayOfWeek = d.getDay();
    var mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    var start = new Date(d);
    start.setDate(d.getDate() + mondayOffset);
    start.setHours(0, 0, 0, 0);
    var end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start: start, end: end };
}
/**
 * Converts a Date to ISO date string (YYYY-MM-DD) using local time.
 */
function toISODate(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return "".concat(year, "-").concat(month, "-").concat(day);
}
/**
 * Converts a Date to ISO date string (YYYY-MM-DD) using Colombia timezone.
 */
function toISODateTZ(date) {
    var parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
    return parts; // en-CA formats as YYYY-MM-DD
}
/**
 * Safely converts a date/datetime input into a Colombia YYYY-MM-DD string.
 * Prevents UTC midnight shift when input is already a date-only YYYY-MM-DD string.
 */
function getColombiaDateString(dateVal) {
    if (!dateVal)
        return '';
    if (typeof dateVal === 'string') {
        if (DATE_ONLY_PATTERN.test(dateVal)) {
            return dateVal;
        }
        var d = new Date(dateVal);
        if (!isNaN(d.getTime())) {
            return toISODateTZ(d);
        }
        return dateVal.slice(0, 10);
    }
    return toISODateTZ(dateVal);
}
