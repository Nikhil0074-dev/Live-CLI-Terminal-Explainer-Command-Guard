"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeCommand = normalizeCommand;
exports.patternToRegExp = patternToRegExp;
exports.commandForms = commandForms;
exports.matchesAny = matchesAny;
exports.evaluatePolicy = evaluatePolicy;
const commandAnalyzer_1 = require("../analyzer/commandAnalyzer");
const types_1 = require("../types");
const riskScorer_1 = require("./riskScorer");
function normalizeCommand(s) {
    return s.trim().replace(/\s+/g, " ");
}
/** Convert a glob (only `*` is special) or `regex:` pattern into a RegExp. Throws on bad regex. */
function patternToRegExp(pattern) {
    if (pattern.startsWith("regex:"))
        return new RegExp(pattern.slice(6));
    const escaped = normalizeCommand(pattern)
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`);
}
/** Text forms of a command that patterns are matched against. */
function commandForms(analysis) {
    const forms = new Set([normalizeCommand(analysis.raw)]);
    for (const { segment } of (0, commandAnalyzer_1.collectSegments)(analysis)) {
        forms.add(normalizeCommand(segment.argv.join(" ")));
        if (segment.executable) {
            forms.add(normalizeCommand([segment.executable, ...segment.args.map((a) => a.value)].join(" ")));
        }
    }
    return [...forms].filter(Boolean);
}
function matchesAny(patterns, forms) {
    for (const p of patterns) {
        let re;
        try {
            re = patternToRegExp(p);
        }
        catch {
            // An unusable block pattern must never silently turn into "no block": treat as matching.
            return p;
        }
        if (forms.some((f) => re.test(f)))
            return p;
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
function evaluatePolicy(analysis, findingsIn, config) {
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
    findings.sort((a, b) => types_1.RISK_ORDER[b.risk] - types_1.RISK_ORDER[a.risk]);
    const risk = (0, riskScorer_1.highestRisk)(findings);
    const blockedBy = findings
        .filter((f) => f.block === true || (f.risk === "CRITICAL" && sec.blockCriticalOperations))
        .map((f) => f.ruleId);
    const hasMandatory = findings.some((f) => f.mandatory === true);
    const mandatoryConfirm = findings.some((f) => f.mandatory === true && f.requiresConfirmation);
    const uncertain = (0, commandAnalyzer_1.allUncertaintyReasons)(analysis).length > 0;
    const unrecognized = (0, commandAnalyzer_1.allUnrecognized)(analysis).length > 0;
    let decision = "ALLOW";
    if (blockedBy.length > 0)
        decision = "BLOCK";
    else if (risk === "CRITICAL")
        decision = "CONFIRM";
    else if (risk === "HIGH")
        decision = sec.requireConfirmationForHighRisk ? "CONFIRM" : "WARN";
    else if (risk === "MEDIUM")
        decision = "WARN";
    if (mandatoryConfirm && decision !== "BLOCK")
        decision = (0, types_1.maxDecision)(decision, "CONFIRM");
    const baseDecision = decision;
    let fromUnknownPolicy = false;
    if (decision !== "BLOCK" && (uncertain || unrecognized)) {
        const floor = sec.defaultUnknownCommandPolicy;
        const combined = (0, types_1.maxDecision)(decision, floor);
        if (combined !== decision)
            fromUnknownPolicy = true;
        decision = combined;
    }
    const reasons = [];
    const trusted = sec.trustedCommands.map(normalizeCommand);
    const isTrusted = trusted.includes(normalizeCommand(analysis.raw));
    if (isTrusted && decision !== "BLOCK" && !hasMandatory) {
        // Trusted exact commands skip the unknown-command floor and may drop CONFIRM to WARN.
        decision = baseDecision;
        if (decision === "CONFIRM")
            decision = "WARN";
        fromUnknownPolicy = false;
        reasons.push("This exact command is listed in trustedCommands, so confirmation was reduced to a warning.");
    }
    for (const f of findings) {
        if (f.risk !== "LOW" || findings.length === 1)
            reasons.push(`${f.ruleId}: ${f.reason}`);
    }
    if (fromUnknownPolicy) {
        reasons.push(`Unrecognised or unverifiable command handled by defaultUnknownCommandPolicy=${sec.defaultUnknownCommandPolicy}.`);
    }
    return {
        decision,
        risk: decision === "BLOCK" && risk !== "CRITICAL" ? "CRITICAL" : risk,
        score: (0, riskScorer_1.riskScore)(findings),
        findings,
        reasons,
        blockedBy,
        requiresConfirmation: decision === "CONFIRM",
        uncertain: uncertain || unrecognized,
        fromUnknownPolicy,
    };
}
