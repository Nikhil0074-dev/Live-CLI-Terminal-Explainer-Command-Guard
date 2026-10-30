"use strict";
/** Shared types for the whole project. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXIT = exports.DECISION_ORDER = exports.RISK_ORDER = void 0;
exports.maxRisk = maxRisk;
exports.maxDecision = maxDecision;
exports.RISK_ORDER = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
exports.DECISION_ORDER = { ALLOW: 0, WARN: 1, CONFIRM: 2, BLOCK: 3 };
function maxRisk(a, b) {
    return exports.RISK_ORDER[a] >= exports.RISK_ORDER[b] ? a : b;
}
function maxDecision(a, b) {
    return exports.DECISION_ORDER[a] >= exports.DECISION_ORDER[b] ? a : b;
}
exports.EXIT = {
    OK: 0,
    GENERIC_ERROR: 1,
    USAGE: 2,
    CHECK_CONFIRM: 2,
    CHECK_BLOCK: 3,
    BLOCKED: 126,
    NOT_FOUND: 127,
    CANCELLED: 130,
};
