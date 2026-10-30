"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPreview = buildPreview;
const node_child_process_1 = require("node:child_process");
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const filesystem_rules_1 = require("../rules/filesystem.rules");
const git_rules_1 = require("../rules/git.rules");
const ruleHelpers_1 = require("../rules/ruleHelpers");
const paths_1 = require("../utils/paths");
const LIMIT = 20;
const STALE_NOTE = "Preview only: the files may change before the command runs, and it may not cover everything.";
function nativePath(value) {
    const winDrive = value.match(/^\/([A-Za-z]:\/.*)$/);
    if (process.platform !== "win32" || !winDrive)
        return path.normalize(value);
    const drive = winDrive[1].slice(0, 2);
    return path.win32.join(drive + "\\", ...winDrive[1].slice(3).split("/").filter(Boolean));
}
function displayPath(value) {
    if (process.platform === "win32")
        return value.replace(/\\/g, "/");
    return value;
}
function walk(root, out, limit, displayRoot) {
    let st;
    try {
        st = fs.lstatSync(root);
    }
    catch {
        return false;
    }
    if (out.length >= limit)
        return true;
    out.push(displayRoot ?? root);
    if (st.isDirectory() && !st.isSymbolicLink()) {
        let names = [];
        try {
            names = fs.readdirSync(root);
        }
        catch {
            return false;
        }
        for (const n of names) {
            if (walk(path.join(root, n), out, limit, displayRoot ? `${displayRoot}/${n}` : undefined))
                return true;
        }
    }
    return out.length >= limit;
}
function walkForDisplay(root, label, out, limit) {
    let st;
    try {
        st = fs.lstatSync(root);
    }
    catch {
        return false;
    }
    if (out.length >= limit)
        return true;
    out.push(label);
    if (st.isDirectory() && !st.isSymbolicLink()) {
        let names;
        try {
            names = fs.readdirSync(root);
        }
        catch {
            return false;
        }
        for (const name of names) {
            if (walkForDisplay(path.join(root, name), `${label}/${name}`, out, limit))
                return true;
        }
    }
    return out.length >= limit;
}
function findMatches(root, pattern, out, limit) {
    let entries;
    try {
        entries = fs.readdirSync(root, { withFileTypes: true });
    }
    catch {
        return;
    }
    const escaped = pattern.replace(/[.+^${}()|[\\]\\\\]/g, "\\\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
    const re = new RegExp(`^${escaped}$`);
    for (const entry of entries) {
        const target = path.join(root, entry.name);
        if (re.test(entry.name))
            out.push(target);
        if (out.length >= limit)
            return;
        if (entry.isDirectory() && !entry.isSymbolicLink())
            findMatches(target, pattern, out, limit);
        if (out.length >= limit)
            return;
    }
}
function run(file, args, cwd) {
    return new Promise((resolve) => {
        (0, node_child_process_1.execFile)(file, args, { cwd, timeout: 5000, maxBuffer: 1024 * 1024 }, (err, stdout) => resolve(err && !stdout ? "" : stdout.toString()));
    });
}
/**
 * Build a read-only preview for commands where one is reliable: rm, find ... -delete, git clean.
 * Nothing is modified; commands run without a shell.
 */
async function buildPreview(analysis, cwd, home) {
    if (analysis.segments.length !== 1 || analysis.needsShell)
        return null;
    const seg = analysis.segments[0];
    const cmd = seg.executable;
    if (cmd === "rm") {
        const p = (0, ruleHelpers_1.parseArgs)(seg.args);
        const found = [];
        let truncated = false;
        for (const token of p.positionals) {
            if (token.hasExpansion || token.hasGlob)
                return null;
            const root = nativePath((0, paths_1.resolveTarget)(token.value, cwd, home));
            const targetItems = [];
            if (walk(root, targetItems, LIMIT + 1, token.value.replace(/\\/g, "/").replace(/\/$/, "")))
                truncated = true;
            found.push(...targetItems);
        }
        if (found.length === 0)
            return { title: "Nothing exists at the given path(s)", lines: [], truncated: false, note: STALE_NOTE };
        return { title: `rm would delete ${truncated ? `at least ${LIMIT}` : found.length} item(s)`, lines: found.slice(0, LIMIT), truncated, note: STALE_NOTE };
    }
    if (cmd === "find" && seg.args.some((t) => t.value === "-delete")) {
        const args = seg.args.map((token) => token.value);
        const starts = (0, filesystem_rules_1.findStartPoints)(seg.args).map((t) => t.value);
        if (starts.some((s) => /[$`]/.test(s)))
            return null;
        const patternToken = seg.args.findIndex((token, i, all) => token.value === "-name" && Boolean(all[i + 1]));
        const pattern = patternToken >= 0 ? args[patternToken + 1].replace(/^['"]|['"]$/g, "") : "*";
        if (!pattern)
            return null;
        const found = [];
        const nativeRoot = (value) => {
            if (process.platform !== "win32")
                return value;
            const match = value.match(/^\/([A-Za-z]):\/(.*)$/);
            return match ? `${match[1]}:\\${match[2].replace(/\//g, "\\")}` : value.replace(/\//g, "\\");
        };
        for (const start of starts)
            findMatches(nativeRoot((0, paths_1.resolveTarget)(start, cwd, home)), pattern, found, LIMIT + 1);
        return { title: `find would delete ${found.length} match(es)`, lines: found.slice(0, LIMIT).map((item) => item.replace(/\\/g, "/")), truncated: found.length > LIMIT, note: STALE_NOTE };
    }
    if (cmd === "git") {
        const { sub, rest } = (0, git_rules_1.gitSubcommand)(seg.args);
        if (sub === "clean") {
            const filtered = rest.map((t) => t.value).filter((v) => !/^-[a-zA-Z]*f[a-zA-Z]*$/.test(v) && v !== "--force");
            const flags = rest.map((t) => t.value).filter((v) => /^-[a-zA-Z]+$/.test(v)).join("").replace(/[-f]/g, "");
            const args = ["clean", "-n" + flags, ...filtered.filter((v) => !v.startsWith("-"))];
            const out = await run("git", args, cwd);
            const lines = out.split("\n").filter(Boolean);
            return { title: `git clean would remove ${lines.length} item(s)`, lines: lines.slice(0, LIMIT), truncated: lines.length > LIMIT, note: STALE_NOTE };
        }
    }
    return null;
}
