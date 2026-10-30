"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runGuarded = runGuarded;
const executionController_1 = require("../execution/executionController");
const runtime_1 = require("./runtime");
/** Analyse, enforce policy, then run. Guard messages go to stderr so program output stays clean. */
async function runGuarded(parts, opts, io) {
    const rt = (0, runtime_1.buildRuntime)(io);
    try {
        rt.logger.prune();
        const res = await (0, executionController_1.guardedRun)((0, runtime_1.toInput)(parts), rt.deps(io.capture ? "stdout" : "stderr"), {
            useAi: Boolean(opts.ai),
            dryRun: Boolean(opts.dryRun),
            assumeYes: Boolean(opts.yes),
            source: "run",
        });
        return res.exitCode;
    }
    finally {
        rt.close();
    }
}
