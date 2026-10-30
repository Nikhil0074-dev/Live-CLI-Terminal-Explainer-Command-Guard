"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.highestRisk = highestRisk;
exports.riskScore = riskScore;
const types_1 = require("../types");
const WEIGHT = { LOW: 1, MEDIUM: 10, HIGH: 40, CRITICAL: 100 };
/** Highest risk among findings (LOW when there are none). */
function highestRisk(findings) {
    let best = "LOW";
    for (const f of findings)
        if (types_1.RISK_ORDER[f.risk] > types_1.RISK_ORDER[best])
            best = f.risk;
    return best;
}
/**
 * Informational 0-100 score used for display and sorting only.
 * The policy engine never relies on this number for allow/block decisions.
 */
function riskScore(findings) {
    const total = findings.reduce((sum, f) => sum + WEIGHT[f.risk], 0);
    return Math.min(100, total);
}
