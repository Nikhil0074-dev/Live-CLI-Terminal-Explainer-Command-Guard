"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeInput = analyzeInput;
exports.assess = assess;
exports.categoryOf = categoryOf;
exports.guardedRun = guardedRun;
const commandAnalyzer_1 = require("../analyzer/commandAnalyzer");
const explanationService_1 = require("../ai/explanationService");
const environmentDetector_1 = require("../environment/environmentDetector");
const policyEngine_1 = require("../policy/policyEngine");
const ruleEngine_1 = require("../rules/ruleEngine");
const terminalFormatter_1 = require("../ui/terminalFormatter");
const types_1 = require("../types");
const confirmation_1 = require("./confirmation");
const commandRunner_1 = require("./commandRunner");
const previewService_1 = require("./previewService");
function analyzeInput(input) {
    if (input.argv && input.argv.length > 0)
        return (0, commandAnalyzer_1.analyzeArgv)(input.argv);
    return (0, commandAnalyzer_1.analyzeCommand)(input.raw ?? "");
}
/** Analyse + apply rules + decide policy + explain. Executes nothing. */
async function assess(input, deps, opts = {}) {
    const analysis = analyzeInput(input);
    const environment = deps.environment ?? (0, environmentDetector_1.detectEnvironment)({ env: deps.env, home: deps.home });
    const findings = (0, ruleEngine_1.evaluateRules)(analysis, { config: deps.config, cwd: deps.cwd, home: deps.home, env: deps.env, environment });
    const policy = (0, policyEngine_1.evaluatePolicy)(analysis, findings, deps.config);
    const out = await (0, explanationService_1.explain)(analysis, policy.findings, deps.config, {
        useAi: Boolean(opts.useAi),
        fetchImpl: deps.fetchImpl,
        promptsDir: deps.promptsDir,
    });
    return { analysis, findings: policy.findings, policy, explanation: out.explanation, aiAttempted: out.aiAttempted, aiFailed: out.aiFailed };
}
function categoryOf(findings) {
    return findings.find((f) => f.risk !== "LOW")?.category ?? findings[0]?.category ?? "general";
}
function logDecision(deps, a, extra) {
    deps.logger.write({
        commandCategory: categoryOf(a.findings),
        risk: a.policy.risk,
        ruleIds: a.findings.map((f) => f.ruleId),
        decision: a.policy.decision,
        confirmationRequested: extra.confirmationRequested,
        approved: extra.approved,
        executed: extra.executed,
        exitCode: extra.exitCode,
        uncertain: a.policy.uncertain,
        source: extra.source,
    }, a.analysis.raw);
}
/**
 * The full guarded workflow:
 * analyse -> rules -> policy -> explain -> (block | confirm | warn) -> execute -> audit.
 * The explanation (AI or not) is display-only and cannot approve anything.
 */
async function guardedRun(input, deps, opts = {}) {
    const source = opts.source ?? "run";
    const a = await assess(input, deps, opts);
    const { policy, analysis } = a;
    // Harmless commands run silently; anything else shows the full explanation panel.
    if (policy.decision !== "ALLOW" || source !== "run") {
        deps.write((0, terminalFormatter_1.renderAnalysis)(deps.style, analysis.raw, policy, a.explanation) + "\n");
    }
    const base = { decision: policy.decision, risk: policy.risk, findings: a.findings };
    if (policy.decision === "BLOCK") {
        deps.write(`\nBlocked: ${policy.blockedBy.join(", ")}. This cannot be overridden from the command line.\n`);
        logDecision(deps, a, { confirmationRequested: false, approved: false, executed: false, source });
        return { ...base, approved: false, executed: false, exitCode: types_1.EXIT.BLOCKED, cancelled: false, blocked: true, message: "blocked" };
    }
    if (analysis.segments.length === 0) {
        deps.write("\nNothing to run.\n");
        return { ...base, approved: false, executed: false, exitCode: types_1.EXIT.USAGE, cancelled: false, blocked: false, message: "empty" };
    }
    if (opts.useAi && a.aiFailed && !deps.config.security.allowExecutionWhenAiUnavailable) {
        deps.write("\nNot executed: an AI explanation was requested, it is unavailable, and allowExecutionWhenAiUnavailable is false.\n");
        logDecision(deps, a, { confirmationRequested: false, approved: false, executed: false, source });
        return { ...base, approved: false, executed: false, exitCode: types_1.EXIT.GENERIC_ERROR, cancelled: false, blocked: false, message: "ai-required" };
    }
    let approved = true;
    let confirmationRequested = false;
    if (policy.decision === "CONFIRM") {
        confirmationRequested = true;
        approved = false;
        const preview = await (0, previewService_1.buildPreview)(analysis, deps.cwd, deps.home).catch(() => null);
        if (preview) {
            deps.write(`\n${preview.title}\n`);
            for (const l of preview.lines)
                deps.write(`  ${(0, terminalFormatter_1.safeText)(l)}\n`);
            if (preview.truncated)
                deps.write("  ...\n");
            deps.write(`  (${preview.note})\n`);
        }
        if (opts.assumeYes) {
            if (deps.config.security.allowYesFlag) {
                approved = true;
                deps.write("\n--yes: approval assumed (allowed by configuration).\n");
            }
            else {
                deps.write("\n--yes was ignored because security.allowYesFlag is false.\n");
            }
        }
        for (let attempt = 0; !approved && attempt < 3; attempt++) {
            const ans = await (0, confirmation_1.askConfirmation)(deps.reader, deps.write, "\nHigh-risk command. Continue? [y/N/e=explain more] ");
            if (ans === "yes")
                approved = true;
            else if (ans === "explain") {
                const more = await (0, explanationService_1.explain)(analysis, a.findings, deps.config, { useAi: true, fetchImpl: deps.fetchImpl, promptsDir: deps.promptsDir });
                deps.write("\n" + (0, terminalFormatter_1.renderExplanation)(deps.style, more.explanation) + "\n");
            }
            else
                break;
        }
        if (!approved) {
            deps.write("Cancelled. Nothing was executed.\n");
            logDecision(deps, a, { confirmationRequested, approved: false, executed: false, source });
            return { ...base, approved: false, executed: false, exitCode: types_1.EXIT.CANCELLED, cancelled: true, blocked: false, message: "cancelled" };
        }
    }
    if (opts.dryRun) {
        deps.write("\nDry run: the command was not executed.\n");
        logDecision(deps, a, { confirmationRequested, approved, executed: false, source });
        return { ...base, approved, executed: false, exitCode: types_1.EXIT.OK, cancelled: false, blocked: false, message: "dry-run" };
    }
    const outcome = await (0, commandRunner_1.runCommand)(analysis, { cwd: deps.cwd, env: deps.env, stdio: deps.stdio ?? "inherit", home: deps.home });
    if (outcome.error)
        deps.write(`guard: ${outcome.error}\n`);
    if (deps.stdio === "pipe") {
        if (outcome.stdout)
            deps.write(outcome.stdout);
        if (outcome.stderr)
            deps.write(outcome.stderr);
    }
    logDecision(deps, a, { confirmationRequested, approved, executed: true, exitCode: outcome.exitCode, source });
    return { ...base, approved, executed: true, exitCode: outcome.exitCode, cancelled: false, blocked: false };
}
