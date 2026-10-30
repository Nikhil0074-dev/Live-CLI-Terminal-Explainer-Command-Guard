"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.explainCommand = explainCommand;
const executionController_1 = require("../execution/executionController");
const terminalFormatter_1 = require("../ui/terminalFormatter");
const types_1 = require("../types");
const runtime_1 = require("./runtime");
/** Explain a command without running it. */
async function explainCommand(parts, opts, io) {
    const rt = (0, runtime_1.buildRuntime)(io);
    try {
        const deps = rt.deps("stdout");
        const placeholder = rt.config.ai.model === "YOUR_INSTALLED_MODEL";
        const wantAi = opts.ai !== false && rt.config.ai.enabled && !placeholder;
        const a = await (0, executionController_1.assess)((0, runtime_1.toInput)(parts), deps, { useAi: wantAi });
        if (opts.ai !== false && rt.config.ai.enabled && placeholder && !a.explanation.aiNote) {
            a.explanation.aiNote = "No AI model is configured (ai.model is a placeholder). Showing the built-in explanation.";
        }
        if (opts.json)
            io.stdout(JSON.stringify({ command: a.analysis.raw, explanation: a.explanation, risk: a.policy.risk, decision: a.policy.decision }, null, 2) + "\n");
        else
            io.stdout((0, terminalFormatter_1.renderAnalysis)(deps.style, a.analysis.raw, a.policy, a.explanation) + "\n");
        return types_1.EXIT.OK;
    }
    finally {
        rt.close();
    }
}
