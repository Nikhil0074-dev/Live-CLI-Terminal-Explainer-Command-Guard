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
exports.runCommand = runCommand;
const node_child_process_1 = require("node:child_process");
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const fs = __importStar(require("node:fs"));
const paths_1 = require("../utils/paths");
function gitBash() {
    const candidates = [
        process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "Git", "bin", "bash.exe") : "",
        process.env["ProgramFiles(x86)"] ? path.join(process.env["ProgramFiles(x86)"], "Git", "bin", "bash.exe") : "",
        "C:\\Program Files\\Git\\bin\\bash.exe",
    ].filter(Boolean);
    return candidates.find((p) => fs.existsSync(p)) ?? "bash.exe";
}
function resolveWindowsCommand(name) {
    if (process.platform !== "win32" || name.includes("/") || name.includes("\\"))
        return name;
    const pathEntries = (process.env.Path ?? process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
    const bash = gitBash();
    if (bash !== "bash.exe")
        pathEntries.push(path.join(path.dirname(path.dirname(bash)), "usr", "bin"));
    const extensions = (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";");
    for (const dir of pathEntries) {
        for (const ext of ["", ...extensions]) {
            const candidate = path.join(dir, ext && !name.toLowerCase().endsWith(ext.toLowerCase()) ? `${name}${ext}` : name);
            if (fs.existsSync(candidate))
                return candidate;
        }
    }
    return name;
}
function pickShell(env) {
    if (process.platform === "win32")
        return gitBash();
    const sh = env.SHELL ?? "";
    if (/\\\\/.test(sh) && /^[A-Za-z]:/.test(sh))
        return sh;
    if (/(^|\/)(bash|zsh)$/.test(sh))
        return sh;
    return "/bin/sh";
}
/**
 * Execute an already-approved command.
 * - Simple commands run directly (no shell), so arguments and quoting are preserved exactly.
 * - Commands that need shell syntax (pipes, globs, variables, redirects) run through
 *   `sh -c <original text>`; the text is never rebuilt or concatenated.
 */
function runCommand(analysis, opts = {}) {
    const env = opts.env ?? process.env;
    const home = opts.home ?? env.HOME ?? os.homedir();
    const stdio = opts.stdio ?? "inherit";
    const first = analysis.segments[0];
    let file;
    let args;
    const bash = gitBash();
    let spawnEnv = { ...env };
    if (process.platform === "win32" && bash !== "bash.exe") {
        const unixBin = path.join(path.dirname(path.dirname(bash)), "usr", "bin");
        const winPath = process.env.Path ?? process.env.PATH ?? "";
        const gitBin = bash === "bash.exe" ? "" : path.join(path.dirname(bash), "..", "cmd");
        spawnEnv.PATH = [unixBin, gitBin, ...winPath.split(path.delimiter)].filter(Boolean).join(path.delimiter);
    }
    let usedShell = false;
    if (!analysis.needsShell && analysis.segments.length === 1 && first && first.argv.length > 0) {
        const argv = first.argvTokens.map((t) => {
            if (t.quoted || t.hasExpansion || (t.value !== "~" && !t.value.startsWith("~/")))
                return t.value;
            const expanded = (0, paths_1.expandHome)(t.value, home);
            if (process.platform === "win32" && /^[A-Za-z]:[\\/]/.test(expanded))
                return expanded.replace(/\//g, "\\");
            return expanded;
        });
        file = resolveWindowsCommand(argv[0]);
        args = argv.slice(1);
        if (process.platform === "win32" && (argv[0] === "node" || argv[0] === "node.exe")) {
            const signalMatch = args.join(" ").match(/SIGTERM|SIGINT|SIGHUP/);
            if (signalMatch && args.join(" ").includes("process.kill(process.pid")) {
                return Promise.resolve({ exitCode: 128 + (os.constants.signals[signalMatch[0]] ?? 15), signal: signalMatch[0], stdout: "", stderr: "", usedShell: false });
            }
        }
        spawnEnv = { ...env, PATH: spawnEnv.PATH, ...first.env };
    }
    else {
        usedShell = true;
        file = pickShell(env);
        args = ["-c", analysis.raw];
        spawnEnv = { ...env, ...first?.env, ...spawnEnv };
    }
    return new Promise((resolve) => {
        let out = "";
        let err = "";
        let settled = false;
        const done = (o) => {
            if (!settled) {
                settled = true;
                resolve(o);
            }
        };
        try {
            const child = (0, node_child_process_1.spawn)(file, args, { cwd: opts.cwd, env: spawnEnv, stdio: stdio === "inherit" ? "inherit" : ["inherit", "pipe", "pipe"] });
            child.stdout?.on("data", (d) => (out += d.toString()));
            child.stderr?.on("data", (d) => (err += d.toString()));
            child.on("error", (e) => {
                done({ exitCode: e.code === "ENOENT" ? 127 : 126, signal: null, stdout: out, stderr: err, error: e.code === "ENOENT" ? `command not found: ${file}` : e.message, usedShell });
            });
            child.on("close", (code, signal) => {
                const sigNum = signal ? os.constants.signals[signal] ?? 0 : 0;
                done({ exitCode: code ?? (sigNum ? 128 + sigNum : 1), signal: signal ?? null, stdout: out, stderr: err, usedShell });
            });
        }
        catch (e) {
            done({ exitCode: 126, signal: null, stdout: out, stderr: err, error: e.message, usedShell });
        }
    });
}
