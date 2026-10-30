"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filesystemRules = void 0;
exports.findStartPoints = findStartPoints;
const paths_1 = require("../utils/paths");
const ruleHelpers_1 = require("./ruleHelpers");
const SAFE_DEVICES = new Set(["/dev/null", "/dev/zero", "/dev/stdout", "/dev/stderr", "/dev/tty", "/dev/stdin", "/dev/random", "/dev/urandom"]);
function isBlockDevice(p) {
    if (SAFE_DEVICES.has(p))
        return false;
    return /^\/dev\/(sd|hd|vd|xvd|nvme|mmcblk|disk|rdisk|loop|md|dm-|mapper\/)/.test(p);
}
/** Commands whose arguments can modify (and therefore be blocked in) a protected directory. */
const PROTECTED_AFFECTING = new Set([
    "rm", "rmdir", "unlink", "mv", "cp", "ln", "shred", "truncate", "chmod", "chown", "chgrp", "dd", "tee",
    "rsync", "install", "sed", "find", "mkdir", "touch",
]);
function destinationTokens(cmd, positionals) {
    if (["cp", "ln", "rsync", "install"].includes(cmd))
        return positionals.length ? [positionals[positionals.length - 1]] : [];
    return positionals;
}
function protectedFinding(ctx, abs, prot, how) {
    return (0, ruleHelpers_1.finding)("FS_PROTECTED_TARGET", "filesystem", "CRITICAL", `${how} would affect a protected directory (${prot}). Protected directories cannot be modified through the guard.`, { block: true, mandatory: true, target: abs });
}
const filesystemRules = (ctx) => {
    const { segment: s } = ctx;
    const out = [];
    const cmd = s.executable;
    // ---- redirections (apply to any command) ----
    for (const r of s.redirections) {
        const writes = /^(\d*>>?|\d*>\||&>>?)$/.test(r.op);
        if (!writes)
            continue;
        if (SAFE_DEVICES.has(r.target))
            continue;
        const truncates = !r.op.endsWith(">>");
        const abs = (0, paths_1.resolveTarget)(r.target, ctx.cwd, ctx.home);
        if (isBlockDevice(abs)) {
            out.push((0, ruleHelpers_1.finding)("FS_DISK_WRITE", "filesystem", "CRITICAL", `Redirection writes directly to a disk device (${abs}).`, { block: true, target: abs }));
            continue;
        }
        const prot = (0, ruleHelpers_1.matchesProtected)(abs, ctx, false);
        if (prot)
            out.push(protectedFinding(ctx, abs, prot, "This redirection"));
        else if ((0, ruleHelpers_1.isSystemArea)(abs)) {
            out.push((0, ruleHelpers_1.finding)("FS_SYSTEM_FILE_WRITE", "filesystem", "HIGH", `Redirection ${truncates ? "overwrites" : "appends to"} a system file (${abs}).`, { target: abs }));
        }
        else if (truncates) {
            out.push((0, ruleHelpers_1.finding)("FS_OVERWRITE_REDIRECT", "filesystem", "MEDIUM", `The > redirection overwrites ${r.target} if it already exists.`, { target: abs }));
        }
        if (r.targetHasExpansion && truncates) {
            out.push((0, ruleHelpers_1.finding)("FS_UNRESOLVED_TARGET", "filesystem", "MEDIUM", `Redirection target ${r.target} depends on a variable or substitution.`, { target: r.target }));
        }
    }
    if (!cmd)
        return out;
    // ---- protected directories (hard block) ----
    if (PROTECTED_AFFECTING.has(cmd) && ctx.config.environment.protectedDirectories.length > 0) {
        const p = (0, ruleHelpers_1.parseArgs)(s.args);
        let toks = p.positionals;
        let recursive = (0, ruleHelpers_1.hasFlag)(p, "rR", ["recursive"]);
        if (cmd === "find") {
            const a = s.args.map((t) => t.value);
            const modifies = a.includes("-delete") || a.some((x) => ["-exec", "-execdir", "-ok", "-okdir"].includes(x));
            if (!modifies)
                toks = [];
            else {
                toks = findStartPoints(s.args);
                recursive = true;
            }
        }
        else if (cmd === "sed" && !p.short.has("i") && !p.long.has("in-place")) {
            toks = [];
        }
        else if (cmd === "dd") {
            toks = s.args.filter((t) => t.value.startsWith("of=")).map((t) => ({ ...t, value: t.value.slice(3) }));
        }
        else {
            toks = destinationTokens(cmd, toks);
        }
        const ancestorCheck = cmd === "rm" || cmd === "find" || cmd === "mv" || cmd === "rmdir";
        for (const t of (0, ruleHelpers_1.resolveTargets)(toks, ctx)) {
            const prot = (0, ruleHelpers_1.matchesProtected)(t.abs, ctx, ancestorCheck && (recursive || cmd === "mv" || cmd === "rmdir" || t.isGlob));
            if (prot) {
                out.push(protectedFinding(ctx, t.abs, prot, `\`${cmd}\``));
                break;
            }
        }
    }
    switch (cmd) {
        case "rm":
        case "rmdir":
        case "unlink":
            out.push(...rmRules(ctx));
            break;
        case "find":
            out.push(...findRules(ctx));
            break;
        case "dd":
            out.push(...ddRules(ctx));
            break;
        case "shred": {
            out.push((0, ruleHelpers_1.finding)("FS_SHRED", "filesystem", "HIGH", "shred overwrites file contents so they cannot be recovered."));
            break;
        }
        case "truncate":
            out.push((0, ruleHelpers_1.finding)("FS_TRUNCATE", "filesystem", "MEDIUM", "truncate changes file size and can discard file contents."));
            break;
        case "wipefs":
            out.push((0, ruleHelpers_1.finding)("FS_DISK_WIPE", "filesystem", "CRITICAL", "wipefs erases filesystem signatures from a device.", { block: true }));
            break;
        case "mkswap":
            out.push((0, ruleHelpers_1.finding)("FS_DISK_FORMAT", "filesystem", "CRITICAL", "mkswap writes to a device and destroys its contents.", { block: true }));
            break;
        case "fdisk":
        case "parted":
        case "sfdisk":
        case "gdisk": {
            const listOnly = s.args.some((t) => t.value === "-l" || t.value === "--list" || t.value === "print");
            if (!listOnly)
                out.push((0, ruleHelpers_1.finding)("FS_PARTITION_EDIT", "filesystem", "HIGH", `${cmd} edits disk partition tables.`));
            break;
        }
        case "rsync": {
            const p = (0, ruleHelpers_1.parseArgs)(s.args);
            if (p.long.has("delete") || [...p.long].some((l) => l.startsWith("delete-"))) {
                out.push((0, ruleHelpers_1.finding)("FS_RSYNC_DELETE", "filesystem", "HIGH", "rsync --delete removes files at the destination that are missing from the source."));
            }
            out.push(...systemAreaModify(ctx, cmd));
            break;
        }
        case "mv": {
            const p = (0, ruleHelpers_1.parseArgs)(s.args);
            const srcs = (0, ruleHelpers_1.resolveTargets)(p.positionals.slice(0, -1), ctx);
            for (const t of srcs) {
                if ((0, ruleHelpers_1.isCriticalPath)(t.abs, ctx.home)) {
                    out.push((0, ruleHelpers_1.finding)("FS_CRITICAL_PATH_MOVE", "filesystem", "CRITICAL", `mv would move a critical directory (${t.abs}).`, { block: true, target: t.abs }));
                    break;
                }
            }
            const dest = p.positionals[p.positionals.length - 1];
            if (dest && dest.value === "/dev/null") {
                out.push((0, ruleHelpers_1.finding)("FS_MOVE_TO_NULL", "filesystem", "HIGH", "Moving files to /dev/null destroys them."));
            }
            out.push(...systemAreaModify(ctx, cmd));
            break;
        }
        case "cp":
        case "ln":
        case "tee":
        case "install":
        case "sed":
            out.push(...systemAreaModify(ctx, cmd));
            break;
        default:
            if (cmd.startsWith("mkfs")) {
                out.push((0, ruleHelpers_1.finding)("FS_DISK_FORMAT", "filesystem", "CRITICAL", `${cmd} formats a device and destroys all data on it.`, { block: true }));
            }
    }
    return out;
};
exports.filesystemRules = filesystemRules;
function systemAreaModify(ctx, cmd) {
    const s = ctx.segment;
    const p = (0, ruleHelpers_1.parseArgs)(s.args);
    if (cmd === "sed" && !p.short.has("i") && !p.long.has("in-place"))
        return [];
    let toks = p.positionals;
    if (cmd === "sed")
        toks = toks.slice(1); // first positional is the script
    toks = destinationTokens(cmd, toks);
    for (const t of (0, ruleHelpers_1.resolveTargets)(toks, ctx)) {
        if ((0, ruleHelpers_1.isSystemArea)(t.abs) || (0, ruleHelpers_1.isCriticalPath)(t.abs, ctx.home)) {
            return [(0, ruleHelpers_1.finding)("FS_SYSTEM_AREA_MODIFY", "filesystem", "HIGH", `\`${cmd}\` modifies a system location (${t.abs}).`, { target: t.abs })];
        }
    }
    return [];
}
function rmRules(ctx) {
    const s = ctx.segment;
    const out = [];
    const p = (0, ruleHelpers_1.parseArgs)(s.args);
    const cmd = s.executable;
    const recursive = (0, ruleHelpers_1.hasFlag)(p, "rR", ["recursive"]);
    const force = (0, ruleHelpers_1.hasFlag)(p, "f", ["force"]);
    const noPreserve = p.long.has("no-preserve-root");
    const targets = (0, ruleHelpers_1.resolveTargets)(p.positionals, ctx);
    let critical = null;
    for (const t of targets) {
        const rootLike = (0, ruleHelpers_1.isCriticalPath)(t.abs, ctx.home);
        if (rootLike && (recursive || t.isGlob || noPreserve)) {
            critical = t.abs;
            break;
        }
    }
    if (noPreserve) {
        out.push((0, ruleHelpers_1.finding)("FS_NO_PRESERVE_ROOT", "filesystem", "CRITICAL", "--no-preserve-root disables the safety check that stops deletion of the root filesystem.", { block: true }));
    }
    if (critical) {
        out.push((0, ruleHelpers_1.finding)("FS_ROOT_DELETE", "filesystem", "CRITICAL", `Recursively deleting ${critical} would destroy system or home data.`, {
            block: true,
            target: critical,
        }));
    }
    if (cmd === "rm" && recursive) {
        out.push((0, ruleHelpers_1.finding)("FS_RECURSIVE_DELETE", "filesystem", "HIGH", "The command recursively deletes files or directories and does not use the trash.", {
            target: targets.map((t) => t.abs).join(", ") || undefined,
        }));
    }
    else if (cmd === "rm" && force) {
        out.push((0, ruleHelpers_1.finding)("FS_FORCE_DELETE", "filesystem", "MEDIUM", "rm -f deletes files without prompting and ignores missing files."));
    }
    else if (cmd === "rm") {
        out.push((0, ruleHelpers_1.finding)("FS_DELETE_FILES", "filesystem", "MEDIUM", "rm permanently deletes files (they do not go to the trash)."));
    }
    if (cmd === "rm" && targets.length === 0) {
        out.push((0, ruleHelpers_1.finding)("FS_DELETE_NO_TARGET", "filesystem", "MEDIUM", "rm was given no explicit target; check how the command is built."));
    }
    const unresolved = targets.filter((t) => t.unresolved);
    if (unresolved.length > 0 && (recursive || cmd === "rm")) {
        out.push((0, ruleHelpers_1.finding)("FS_UNRESOLVED_TARGET", "filesystem", recursive ? "HIGH" : "MEDIUM", `The deletion target (${unresolved.map((t) => t.token.value).join(", ")}) depends on a variable or substitution. If it is empty or unexpected, a different path may be deleted.`));
    }
    for (const t of targets) {
        if (!(0, ruleHelpers_1.isCriticalPath)(t.abs, ctx.home) && (0, ruleHelpers_1.isSystemArea)(t.abs)) {
            out.push((0, ruleHelpers_1.finding)("FS_SYSTEM_PATH_DELETE", "filesystem", "HIGH", `The target ${t.abs} is inside a system directory.`, { target: t.abs }));
            break;
        }
    }
    // Deleting the working directory's parents or "." in the home directory
    for (const t of targets) {
        if (recursive && (t.token.value === "." || t.token.value === "..")) {
            out.push((0, ruleHelpers_1.finding)("FS_DELETE_CURRENT_DIR", "filesystem", "HIGH", `Deleting "${t.token.value}" removes the current (or parent) directory tree.`));
            break;
        }
    }
    return out;
}
function findStartPoints(args) {
    const pts = [];
    for (const t of args) {
        const v = t.value;
        if (v.startsWith("-") || v === "(" || v === "!" || v === ")")
            break;
        pts.push(t);
    }
    if (pts.length === 0)
        pts.push({ value: ".", quoted: false, hasExpansion: false, hasGlob: false });
    return pts;
}
function findRules(ctx) {
    const s = ctx.segment;
    const out = [];
    const a = s.args.map((t) => t.value);
    const del = a.includes("-delete");
    const exec = a.some((x) => ["-exec", "-execdir", "-ok", "-okdir"].includes(x));
    const starts = (0, ruleHelpers_1.resolveTargets)(findStartPoints(s.args), ctx);
    if (del) {
        const crit = starts.find((t) => (0, ruleHelpers_1.isCriticalPath)(t.abs, ctx.home));
        if (crit) {
            out.push((0, ruleHelpers_1.finding)("FS_ROOT_DELETE", "filesystem", "CRITICAL", `find -delete starting at ${crit.abs} could delete system or home data.`, { block: true, target: crit.abs }));
        }
        out.push((0, ruleHelpers_1.finding)("FS_FIND_DELETE", "filesystem", "HIGH", "find -delete removes every file that matches the expression. Check the expression with a preview first.", {
            target: starts.map((t) => t.abs).join(", "),
        }));
    }
    else if (exec) {
        out.push((0, ruleHelpers_1.finding)("FS_FIND_EXEC", "filesystem", "MEDIUM", "find -exec runs another command on every match."));
    }
    if ((del || exec) && starts.some((t) => t.unresolved)) {
        out.push((0, ruleHelpers_1.finding)("FS_UNRESOLVED_TARGET", "filesystem", "HIGH", "The find starting directory depends on a variable or substitution."));
    }
    return out;
}
function ddRules(ctx) {
    const out = [];
    for (const t of ctx.segment.args) {
        if (!t.value.startsWith("of="))
            continue;
        const target = t.value.slice(3);
        const abs = (0, paths_1.resolveTarget)(target, ctx.cwd, ctx.home);
        if (isBlockDevice(abs)) {
            out.push((0, ruleHelpers_1.finding)("FS_DISK_WRITE", "filesystem", "CRITICAL", `dd writes raw data to a disk device (${abs}), destroying its contents.`, { block: true, target: abs }));
        }
        else if (!SAFE_DEVICES.has(abs)) {
            out.push((0, ruleHelpers_1.finding)("FS_DD_OVERWRITE", "filesystem", "HIGH", `dd overwrites ${abs} without confirmation.`, { target: abs }));
        }
    }
    return out;
}
