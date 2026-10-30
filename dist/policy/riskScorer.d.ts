import { Finding, RiskLevel } from "../types";
/** Highest risk among findings (LOW when there are none). */
export declare function highestRisk(findings: Finding[]): RiskLevel;
/**
 * Informational 0-100 score used for display and sorting only.
 * The policy engine never relies on this number for allow/block decisions.
 */
export declare function riskScore(findings: Finding[]): number;
