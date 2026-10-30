import { allUncertaintyReasons, allUnrecognized, collectSegments } from "../analyzer/commandAnalyzer";
import type { GuardConfig } from "../config/configSchema";
import { Analysis, Decision, Finding, maxDecision, PolicyResult, RISK_ORDER } from "../types";
import { highestRisk, riskScore } from "./riskScorer";

export function normalizeCommand(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/** Convert a glob (only `*` is special) or `regex:` pattern into a RegExp. Throws on bad regex. */
export function patternToRegExp(pattern: string): RegExp {
  if (pattern.startsWith("regex:")) return new RegExp(pattern.slice(6));
  const escaped = normalizeCommand(pattern)
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

/** Text forms of a command that patterns are matched against. */
export function commandForms(analysis: Analysis): string[] {
  const forms = new Set<string>([normalizeCommand(analysis.raw)]);
  for (const { segment } of collectSegments(analysis)) {
    forms.add(normalizeCommand(segment.argv.join(" ")));
    if (segment.executable) {
      forms.add(normalizeCommand([segment.executable, ...segment.args.map((a) => a.value)].join(" ")));
    }
  }
  return [...forms].filter(Boolean);
}

export function matchesAny(patterns: string[], forms: string[]): string | null {
  for (const p of patterns) {
    let re: RegExp;
    try {
      re = patternToRegExp(p);
    } catch {
      // An unusable block pattern must never silently turn into "no block": treat as matching.
      return p;
    }
    if (forms.some((f) => re.test(f))) return p;
  }
  return null;
}

/**
 * Deterministic policy decision. The LLM is never consulted here.
 *
 * Precedence:
 *  1. mandatory blocks (blocked-command patterns, protected targets, hard-block findings)
 *  2. critical findings (block unless blockCriticalOperations=false, then confirm)
 *  3. mandatory confirmations (production targets)
 *  4. risk-based default (HIGH->confirm, MEDIUM->warn, LOW->allow)
 *  5. unknown/uncertain command policy (a floor, never lowers a decision)
 *  6. trusted-command allow list (may lower CONFIRM->WARN, never overrides 1-3)
 */
export function evaluatePolicy(analysis: Analysis, findingsIn: Finding[], config: GuardConfig): PolicyResult {
  const findings = [...findingsIn];
  const sec = config.security;

  const forms = commandForms(analysis);
  const blockedPattern = matchesAny(sec.blockedCommands, forms);
  if (blockedPattern) {
    findings.push({
      ruleId: "POLICY_BLOCKED_COMMAND",
      category: "policy",
      risk: "CRITICAL",
      reason: `The command matches a blocked-command pattern in the policy (${blockedPattern}).`,
      requiresConfirmation: false,
      block: true,
      mandatory: true,
    });
  }
  findings.sort((a, b) => RISK_ORDER[b.risk] - RISK_ORDER[a.risk]);

  const risk = highestRisk(findings);
  const blockedBy = findings
    .filter((f) => f.block === true || (f.risk === "CRITICAL" && sec.blockCriticalOperations))
    .map((f) => f.ruleId);
  const hasMandatory = findings.some((f) => f.mandatory === true);
  const mandatoryConfirm = findings.some((f) => f.mandatory === true && f.requiresConfirmation);

  const uncertain = allUncertaintyReasons(analysis).length > 0;
  const unrecognized = allUnrecognized(analysis).length > 0;

  let decision: Decision = "ALLOW";
  if (blockedBy.length > 0) decision = "BLOCK";
  else if (risk === "CRITICAL") decision = "CONFIRM";
  else if (risk === "HIGH") decision = sec.requireConfirmationForHighRisk ? "CONFIRM" : "WARN";
  else if (risk === "MEDIUM") decision = "WARN";
  if (mandatoryConfirm && decision !== "BLOCK") decision = maxDecision(decision, "CONFIRM");

  const baseDecision = decision;
  let fromUnknownPolicy = false;
  if (decision !== "BLOCK" && (uncertain || unrecognized)) {
    const floor = sec.defaultUnknownCommandPolicy;
    const combined = maxDecision(decision, floor);
    if (combined !== decision) fromUnknownPolicy = true;
    decision = combined;
  }

  const reasons: string[] = [];
  const trusted = sec.trustedCommands.map(normalizeCommand);
  const isTrusted = trusted.includes(normalizeCommand(analysis.raw));
  if (isTrusted && decision !== "BLOCK" && !hasMandatory) {
    // Trusted exact commands skip the unknown-command floor and may drop CONFIRM to WARN.
    decision = baseDecision;
    if (decision === "CONFIRM") decision = "WARN";
    fromUnknownPolicy = false;
    reasons.push("This exact command is listed in trustedCommands, so confirmation was reduced to a warning.");
  }

  for (const f of findings) {
    if (f.risk !== "LOW" || findings.length === 1) reasons.push(`${f.ruleId}: ${f.reason}`);
  }
  if (fromUnknownPolicy) {
    reasons.push(`Unrecognised or unverifiable command handled by defaultUnknownCommandPolicy=${sec.defaultUnknownCommandPolicy}.`);
  }

  return {
    decision,
    risk: decision === "BLOCK" && risk !== "CRITICAL" ? "CRITICAL" : risk,
    score: riskScore(findings),
    findings,
    reasons,
    blockedBy,
    requiresConfirmation: decision === "CONFIRM",
    uncertain: uncertain || unrecognized,
    fromUnknownPolicy,
  };
}
