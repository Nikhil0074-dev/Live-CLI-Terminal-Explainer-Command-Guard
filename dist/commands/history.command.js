"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.historyCommand = historyCommand;
const runtime_1 = require("./runtime");
function historyCommand(opts, io) {
    const rt = (0, runtime_1.buildRuntime)(io);
    if (opts.prune) {
        const n = rt.logger.prune();
        io.stdout(`Removed ${n} record(s) older than ${rt.config.logging.retentionDays} days.\n`);
        return 0;
    }
    const recs = rt.logger.read(opts.n);
    if (opts.json) {
        io.stdout(JSON.stringify(recs, null, 2) + "\n");
        return 0;
    }
    if (recs.length === 0) {
        io.stdout("No audit records yet.\n");
        return 0;
    }
    io.stdout(`${"TIME (UTC)".padEnd(20)} ${"RISK".padEnd(9)} ${"DECISION".padEnd(8)} ${"RAN".padEnd(4)} RULES\n`);
    for (const r of recs) {
        const t = r.timestamp.replace("T", " ").slice(0, 19);
        io.stdout(`${t.padEnd(20)} ${r.risk.padEnd(9)} ${r.decision.padEnd(8)} ${(r.executed ? "yes" : "no").padEnd(4)} ${r.ruleIds.filter((x) => x !== "CMD_UNRECOGNIZED").join(",") || "-"}${r.command ? "  | " + r.command : ""}\n`);
    }
    return 0;
}
