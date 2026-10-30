"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.permissionRules = void 0;
exports.isWorldWritableMode = isWorldWritableMode;
exports.isSetuidMode = isSetuidMode;
const ruleHelpers_1 = require("./ruleHelpers");
function splitArgs(args) {
    let recursive = false;
    const positionals = [];
    let afterDD = false;
    for (const t of args) {
        const v = t.value;
        if (afterDD) {
            positionals.push(t);
        }
        else if (v === "--") {
            afterDD = true;
        }
        else if (v === "--recursive") {
            recursive = true;
        }
        else if (v.startsWith("--")) {
            // other long option
        }
        else if (/^-[RcfvhHLPn]+$/.test(v)) {
            if (v.includes("R"))
                recursive = true;
        }
        else {
            positionals.push(t);
        }
    }
    return { recursive, positionals };
}
function isWorldWritableMode(mode) {
    if (/^[0-7]{3,4}$/.test(mode)) {
        const other = parseInt(mode[mode.length - 1], 8);
        return (other & 2) !== 0;
    }
    // symbolic: a+w, o+w, ugo+rwx, a=rwx ...
    return mode.split(",").some((clause) => {
        const m = /^([ugoa]*)([-+=])([rwxXst]*)$/.exec(clause);
        if (!m)
            return false;
        const [, who, op, perms] = m;
        return op !== "-" && perms.includes("w") && (who.includes("o") || who.includes("a"));
    });
}
function isSetuidMode(mode) {
    if (/^[0-7]{4}$/.test(mode))
        return (parseInt(mode[0], 8) & 6) !== 0;
    return mode.split(",").some((clause) => /^[ugoa]*\+[rwxXt]*s/.test(clause));
}
const permissionRules = (ctx) => {
    const s = ctx.segment;
    const cmd = s.executable;
    if (cmd !== "chmod" && cmd !== "chown" && cmd !== "chgrp")
        return [];
    const out = [];
    const { recursive, positionals } = splitArgs(s.args);
    const spec = positionals[0]?.value ?? "";
    const targets = (0, ruleHelpers_1.resolveTargets)(positionals.slice(1), ctx);
    const critical = targets.find((t) => (0, ruleHelpers_1.isCriticalPath)(t.abs, ctx.home));
    const system = targets.find((t) => (0, ruleHelpers_1.isSystemArea)(t.abs));
    if (recursive && critical) {
        out.push((0, ruleHelpers_1.finding)("PERM_SYSTEM_RECURSIVE", "permissions", "CRITICAL", `Recursive ${cmd} on ${critical.abs} can break the whole system or expose all files.`, {
            block: true,
            target: critical.abs,
        }));
    }
    if (recursive) {
        out.push((0, ruleHelpers_1.finding)(cmd === "chmod" ? "PERM_RECURSIVE_CHMOD" : "PERM_RECURSIVE_CHOWN", "permissions", "HIGH", `${cmd} -R changes ${cmd === "chmod" ? "permissions" : "ownership"} on every file below the target, which may affect many files.`, { target: targets.map((t) => t.abs).join(", ") || undefined }));
    }
    if (cmd === "chmod") {
        if (isWorldWritableMode(spec)) {
            out.push((0, ruleHelpers_1.finding)("PERM_WORLD_WRITABLE", "permissions", "HIGH", `Mode ${spec} lets every user on the machine write to the target.`));
        }
        if (isSetuidMode(spec)) {
            out.push((0, ruleHelpers_1.finding)("PERM_SETUID", "permissions", "HIGH", `Mode ${spec} sets the setuid/setgid bit, so the program runs with its owner's privileges.`));
        }
    }
    if (!recursive && system && !critical) {
        out.push((0, ruleHelpers_1.finding)("PERM_SYSTEM_PATH", "permissions", "HIGH", `${cmd} changes access on a system path (${system.abs}).`, { target: system.abs }));
    }
    else if (!recursive && critical) {
        out.push((0, ruleHelpers_1.finding)("PERM_CRITICAL_PATH", "permissions", "HIGH", `${cmd} changes access on a critical directory (${critical.abs}).`, { target: critical.abs }));
    }
    if (recursive && targets.some((t) => t.unresolved)) {
        out.push((0, ruleHelpers_1.finding)("FS_UNRESOLVED_TARGET", "permissions", "HIGH", "The target of this recursive change depends on a variable or substitution."));
    }
    return out;
};
exports.permissionRules = permissionRules;
