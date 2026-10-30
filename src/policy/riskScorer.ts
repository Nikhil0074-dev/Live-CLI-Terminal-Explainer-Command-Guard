import { Finding, RiskLevel, RISK_ORDER } from "../types";

const WEIGHT: Record<RiskLevel, number> = { LOW: 1, MEDIUM: 10, HIGH: 40, CRITICAL: 100 };

/** Highest risk among findings (LOW when there are none). */
export function highestRisk(findings: Finding[]): RiskLevel {
  let best: RiskLevel = "LOW";
  for (const f of findings) if (RISK_ORDER[f.risk] > RISK_ORDER[best]) best = f.risk;
  return best;
}

/**
 * Informational 0-100 score used for display and sorting only.
 * The policy engine never relies on this number for allow/block decisions.
 */
export function riskScore(findings: Finding[]): number {
  const total = findings.reduce((sum, f) => sum + WEIGHT[f.risk], 0);
  return Math.min(100, total);
}
