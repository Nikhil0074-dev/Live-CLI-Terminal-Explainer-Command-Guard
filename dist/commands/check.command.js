"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkCommand = checkCommand;
const executionController_1 = require("../execution/executionController");
const previewService_1 = require("../execution/previewService");
const terminalFormatter_1 = require("../ui/terminalFormatter");
const types_1 = require("../types");
const runtime_1 = require("./runtime");
/** Analyse a command without running it. Exit: 0 allow/warn, 2 confirm, 3 block. */
async function checkCommand(parts, opts, io) {
    const rt = (0, runtime_1.buildRuntime)(io);
    try {
        const deps = rt.deps("stdout");
        const a = await (0, executionController_1.assess)((0, runtime_1.toInput)(parts), deps, { useAi: Boolean(opts.ai), source: "check" });
        rt.logger.write({
            commandCategory: a.findings[0]?.category ?? "general",
            risk: a.policy.risk,
            ruleIds: a.findings.map((f) => f.ruleId),
            decision: a.policy.decision,
            confirmationRequested: false,
            approved: false,
            executed: false,
            uncertain: a.policy.uncertain,
            source: "check",
        }, a.analysis.raw);
        if (opts.json) {
            io.stdout(JSON.stringify({
                command: a.analysis.raw,
                risk: a.policy.risk,
                decision: a.policy.decision,
                score: a.policy.score,
                uncertain: a.policy.uncertain,
                findings: a.policy.findings,
                reasons: a.policy.reasons,
                explanation: a.explanation,
            }, null, 2) + "\n");
        }
        else {
            io.stdout((0, terminalFormatter_1.renderAnalysis)(deps.style, a.analysis.raw, a.policy, a.explanation) + "\n");
            if (opts.preview) {
                const p = await (0, previewService_1.buildPreview)(a.analysis, io.cwd, rt.home);
                if (p) {
                    io.stdout(`\n${p.title}\n${p.lines.map((l) => "  " + (0, terminalFormatter_1.safeText)(l)).join("\n")}\n  (${p.note})\n`);
                }
                else
                    io.stdout("\nNo reliable preview is available for this command.\n");
            }
        }
        if (a.policy.decision === "BLOCK")
            return types_1.EXIT.CHECK_BLOCK;
        if (a.policy.decision === "CONFIRM")
            return types_1.EXIT.CHECK_CONFIRM;
        return types_1.EXIT.OK;
    }
    finally {
        rt.close();
    }
}
