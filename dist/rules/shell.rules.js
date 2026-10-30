"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shellRules = void 0;
exports.uncertaintyFindings = uncertaintyFindings;
exports.unrecognizedFindings = unrecognizedFindings;
const commandCatalog_1 = require("../analyzer/commandCatalog");
const ruleHelpers_1 = require("./ruleHelpers");
/** Per-segment privilege and interpreter rules. */
const shellRules = (ctx) => {
    const s = ctx.segment;
    const out = [];
    const cmd = s.executable;
    if (s.privileged) {
        const interactiveRoot = cmd !== null && (commandCatalog_1.SHELL_INTERPRETERS.has(cmd) || cmd === "su") && !s.args.some((t) => /^-[A-Za-z]*c[A-Za-z]*$/.test(t.value));
        const sudoNoCmd = cmd === null;
        if (interactiveRoot || sudoNoCmd) {
            out.push((0, ruleHelpers_1.finding)("PRIV_ROOT_SHELL", "privilege", "HIGH", "This opens an interactive shell with administrator rights; every later command runs as root."));
        }
        else {
            out.push((0, ruleHelpers_1.finding)("PRIV_ELEVATED", "privilege", "MEDIUM", `Runs \`${cmd}\` with administrator privileges (${s.wrappers.filter((w) => w === "sudo" || w === "doas").join(", ")}).`));
        }
    }
    if (cmd === "su") {
        out.push((0, ruleHelpers_1.finding)("PRIV_SWITCH_USER", "privilege", "MEDIUM", "su switches to another user account."));
    }
    if (cmd === "eval") {
        out.push((0, ruleHelpers_1.finding)("SHELL_EVAL", "shell", "MEDIUM", "eval builds a command from text at run time, so its real effect cannot be known in advance."));
    }
    return out;
};
exports.shellRules = shellRules;
/** Summary finding when the analyser could not fully understand the command. */
function uncertaintyFindings(reasons) {
    if (reasons.length === 0)
        return [];
    return [
        (0, ruleHelpers_1.finding)("SHELL_UNCERTAIN", "shell", "MEDIUM", `The guard cannot fully verify this command: ${reasons.join("; ")}.`),
    ];
}
function unrecognizedFindings(names) {
    if (names.length === 0)
        return [];
    return [(0, ruleHelpers_1.finding)("CMD_UNRECOGNIZED", "general", "LOW", `No built-in knowledge about: ${names.join(", ")}. It was not analysed for risk.`, { requiresConfirmation: false })];
}
