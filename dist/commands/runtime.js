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
exports.processIO = processIO;
exports.auditPath = auditPath;
exports.buildRuntime = buildRuntime;
exports.toInput = toInput;
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const configManager_1 = require("../config/configManager");
const confirmation_1 = require("../execution/confirmation");
const auditLogger_1 = require("../logging/auditLogger");
const terminalFormatter_1 = require("../ui/terminalFormatter");
const paths_1 = require("../utils/paths");
function processIO() {
    return {
        env: process.env,
        cwd: process.cwd(),
        stdin: process.stdin,
        stdout: (s) => void process.stdout.write(s),
        stderr: (s) => void process.stderr.write(s),
        stdoutIsTTY: process.stdout.isTTY,
        stderrIsTTY: process.stderr.isTTY,
    };
}
function auditPath(config, env) {
    return config.logging.path ? path.resolve(config.logging.path) : path.join((0, paths_1.guardHome)(env), "audit.log");
}
function buildRuntime(io) {
    const { config, path: configPath } = (0, configManager_1.loadConfig)({ env: io.env });
    const home = io.env.HOME ?? os.homedir();
    const logger = new auditLogger_1.AuditLogger(auditPath(config, io.env), {
        enabled: config.logging.enabled,
        storeRawCommands: config.logging.storeRawCommands,
        retentionDays: config.logging.retentionDays,
    });
    let reader = null;
    const getReader = () => (reader ??= (0, confirmation_1.createLineReader)(io.stdin));
    const lazyReader = {
        readLine: () => getReader().readLine(),
        close: () => reader?.close(),
    };
    return {
        config,
        configPath,
        logger,
        home,
        close: () => reader?.close(),
        deps: (target) => ({
            config,
            logger,
            cwd: io.cwd,
            home,
            env: io.env,
            write: target === "stdout" ? io.stdout : io.stderr,
            style: { color: (0, terminalFormatter_1.colorEnabled)({ isTTY: target === "stdout" ? io.stdoutIsTTY : io.stderrIsTTY }, io.env) },
            reader: lazyReader,
            fetchImpl: io.fetchImpl,
            stdio: io.capture ? "pipe" : "inherit",
        }),
    };
}
/** One argument = a shell string; several arguments = an already-split argv (no shell parsing). */
function toInput(parts) {
    return parts.length === 1 ? { raw: parts[0] } : { argv: parts };
}
