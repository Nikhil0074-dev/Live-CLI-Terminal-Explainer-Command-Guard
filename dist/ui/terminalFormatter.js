"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.colorEnabled = colorEnabled;
exports.paint = paint;
exports.safeText = safeText;
exports.riskBadge = riskBadge;
exports.decisionText = decisionText;
exports.renderExplanation = renderExplanation;
exports.renderAnalysis = renderAnalysis;
exports.renderCompact = renderCompact;
function colorEnabled(stream = process.stdout, env = process.env) {
    if (env.NO_COLOR)
        return false;
    if (env.FORCE_COLOR && env.FORCE_COLOR !== "0")
        return true;
    return Boolean(stream.isTTY);
}
const CODES = {
    reset: "\u001b[0m", bold: "\u001b[1m", dim: "\u001b[2m",
    red: "\u001b[31m", green: "\u001b[32m", yellow: "\u001b[33m", blue: "\u001b[34m", magenta: "\u001b[35m", cyan: "\u001b[36m",
    bgRed: "\u001b[41;97;1m", bgYellow: "\u001b[43;30;1m", bgGreen: "\u001b[42;30;1m", bgMagenta: "\u001b[45;97;1m",
};
function paint(st, name, text) {
    return st.color ? `${CODES[name]}${text}${CODES.reset}` : text;
}
/** Strip anything that could control the terminal from untrusted text (commands, model output). */
function safeText(s) {
    return s.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "?");
}
function riskBadge(st, risk) {
    const map = { LOW: "bgGreen", MEDIUM: "bgYellow", HIGH: "bgRed", CRITICAL: "bgMagenta" };
    return paint(st, map[risk], ` ${risk} RISK `);
}
function decisionText(st, d) {
    switch (d) {
        case "ALLOW": return paint(st, "green", "ALLOW - no action needed");
        case "WARN": return paint(st, "yellow", "WARN - proceeding with a warning");
        case "CONFIRM": return paint(st, "red", "CONFIRM - explicit approval required");
        case "BLOCK": return paint(st, "magenta", "BLOCK - execution refused by policy");
    }
}
function findingLine(st, f) {
    const color = { LOW: "green", MEDIUM: "yellow", HIGH: "red", CRITICAL: "magenta" };
    return `  ${paint(st, color[f.risk], `[${f.risk}]`)} ${paint(st, "bold", f.ruleId)}\n      ${safeText(f.reason)}`;
}
function renderExplanation(st, e) {
    const lines = [];
    lines.push(paint(st, "bold", "Explanation") + paint(st, "dim", e.source === "ai" ? "  (local AI, for information only)" : "  (built-in)"));
    lines.push(`  ${safeText(e.summary)}`);
    if (e.flags.length) {
        lines.push("");
        lines.push(paint(st, "bold", "Parts"));
        for (const f of e.flags)
            lines.push(`  - ${paint(st, "cyan", safeText(f.flag))}: ${safeText(f.meaning)}`);
    }
    if (e.sideEffects.length) {
        lines.push("");
        lines.push(paint(st, "bold", "Possible effects"));
        for (const s of e.sideEffects)
            lines.push(`  - ${safeText(s)}`);
    }
    if (e.uncertainties.length) {
        lines.push("");
        lines.push(paint(st, "bold", "Not verified"));
        for (const s of e.uncertainties)
            lines.push(`  - ${safeText(s)}`);
    }
    if (e.aiNote) {
        lines.push("");
        lines.push(paint(st, "dim", `Note: ${safeText(e.aiNote)}`));
    }
    return lines.join("\n");
}
function renderAnalysis(st, command, policy, explanation) {
    const lines = [];
    lines.push(`${paint(st, "bold", "COMMAND GUARD")} ${riskBadge(st, policy.risk)}`);
    lines.push("");
    lines.push(paint(st, "bold", "Command"));
    lines.push(`  ${safeText(command)}`);
    if (explanation) {
        lines.push("");
        lines.push(renderExplanation(st, explanation));
    }
    const shown = policy.findings.filter((f) => f.ruleId !== "CMD_UNRECOGNIZED" || policy.findings.length === 1);
    if (shown.length) {
        lines.push("");
        lines.push(paint(st, "bold", "Findings"));
        for (const f of shown)
            lines.push(findingLine(st, f));
    }
    if (policy.fromUnknownPolicy) {
        lines.push("");
        lines.push(paint(st, "dim", "  This command could not be fully verified, so the unknown-command policy was applied."));
    }
    lines.push("");
    lines.push(`${paint(st, "bold", "Decision")}  ${decisionText(st, policy.decision)}`);
    return lines.join("\n");
}
/** Short form used by shell hooks. */
function renderCompact(st, command, policy) {
    const lines = [];
    lines.push(`${paint(st, "bold", "[guard]")} ${riskBadge(st, policy.risk)} ${safeText(command)}`);
    for (const f of policy.findings.filter((x) => x.risk !== "LOW").slice(0, 4)) {
        lines.push(`  ${f.ruleId}: ${safeText(f.reason)}`);
    }
    if (policy.decision === "BLOCK")
        lines.push(paint(st, "magenta", "  Blocked by policy."));
    return lines.join("\n");
}
