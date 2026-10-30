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
exports.hookCheck = hookCheck;
exports.installHookCommand = installHookCommand;
exports.uninstallHookCommand = uninstallHookCommand;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const configManager_1 = require("../config/configManager");
const confirmation_1 = require("../execution/confirmation");
const executionController_1 = require("../execution/executionController");
const hookInstaller_1 = require("../shell/hookInstaller");
const terminalFormatter_1 = require("../ui/terminalFormatter");
const runtime_1 = require("./runtime");
/** Blocking, stream-free reader for /dev/tty: one prompt, one line, no file-descriptor races. */
function openTtyDefault() {
    let fd;
    try {
        fd = fs.openSync("/dev/tty", "r+");
    }
    catch {
        return null;
    }
    const reader = {
        readLine: () => {
            const chunk = Buffer.alloc(1);
            let line = "";
            for (let i = 0; i < 4096; i++) {
                let n = 0;
                try {
                    n = fs.readSync(fd, chunk, 0, 1, null);
                }
                catch (e) {
                    if (e.code === "EAGAIN")
                        continue;
                    return Promise.resolve(line.length ? line : null);
                }
                if (n === 0)
                    return Promise.resolve(line.length ? line : null);
                const ch = chunk.toString("utf8");
                if (ch === "\n")
                    return Promise.resolve(line);
                line += ch;
            }
            return Promise.resolve(line);
        },
        close: () => undefined,
    };
    return {
        reader,
        write: (s) => {
            try {
                fs.writeSync(fd, s);
            }
            catch {
                /* ignore */
            }
        },
        close: () => {
            try {
                fs.closeSync(fd);
            }
            catch {
                /* ignore */
            }
        },
    };
}
/**
 * Called by the Bash/Zsh integration before a command line runs.
 * Exit codes: 0 = let the shell run it, 3 = deny (blocked or cancelled), anything else = the guard itself failed
 * (a crashed Node process exits 1, so "1" must never mean "denied").
 */
async function hookCheck(line, io) {
    let rt;
    try {
        rt = (0, runtime_1.buildRuntime)(io);
    }
    catch (e) {
        io.stderr(`[guard] ${e.message}\n`);
        return 2;
    }
    try {
        const deps = rt.deps("stderr");
        const a = await (0, executionController_1.assess)({ raw: line }, deps, { useAi: false, source: "hook" });
        const p = a.policy;
        const log = (confirmationRequested, approved) => {
            rt.logger.write({
                commandCategory: (0, executionController_1.categoryOf)(a.findings),
                risk: p.risk,
                ruleIds: a.findings.map((f) => f.ruleId),
                decision: p.decision,
                confirmationRequested,
                approved,
                executed: approved && p.decision !== "BLOCK",
                uncertain: p.uncertain,
                source: "hook",
            }, line);
        };
        if (p.decision === "ALLOW") {
            log(false, true);
            return 0;
        }
        io.stderr((0, terminalFormatter_1.renderCompact)(deps.style, a.analysis.raw, p) + "\n");
        if (p.decision === "WARN") {
            log(false, true);
            return 0;
        }
        if (p.decision === "BLOCK") {
            log(false, false);
            return 3;
        }
        const tty = (io.openTty ?? openTtyDefault)();
        if (!tty) {
            io.stderr("  No terminal available for confirmation. Command cancelled.\n");
            log(true, false);
            return 3;
        }
        try {
            const ans = await (0, confirmation_1.askConfirmation)(tty.reader, tty.write, "  Continue? [y/N] ");
            const ok = ans === "yes";
            if (!ok)
                io.stderr("  Cancelled.\n");
            log(true, ok);
            return ok ? 0 : 3;
        }
        finally {
            tty.close();
        }
    }
    catch (e) {
        io.stderr(`[guard] internal error: ${e.message}\n`);
        return 2;
    }
    finally {
        rt.close();
    }
}
function installHookCommand(shell, rcFile, io) {
    const home = io.env.HOME ?? "";
    const rc = rcFile ? path.resolve(rcFile) : (0, hookInstaller_1.defaultRcFile)(shell, home);
    const cli = path.join((0, configManager_1.packageRoot)(), "dist", "cli.js");
    const res = (0, hookInstaller_1.installHook)(shell, rc, process.execPath, cli);
    io.stdout(res.changed ? `Installed ${shell} hook in ${rc}${res.backup ? ` (backup: ${res.backup})` : ""}.\nOpen a new terminal or run: source ${rc}\n` : `The ${shell} hook is already installed in ${rc}.\n`);
    return 0;
}
function uninstallHookCommand(shell, rcFile, io) {
    const home = io.env.HOME ?? "";
    const rc = rcFile ? path.resolve(rcFile) : (0, hookInstaller_1.defaultRcFile)(shell, home);
    const res = (0, hookInstaller_1.uninstallHook)(rc);
    io.stdout(res.changed ? `Removed the ${shell} hook from ${rc}.\n` : `No guard hook found in ${rc}.\n`);
    return 0;
}
