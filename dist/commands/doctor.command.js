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
exports.doctorCommand = doctorCommand;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const ollamaClient_1 = require("../ai/ollamaClient");
const commandAnalyzer_1 = require("../analyzer/commandAnalyzer");
const configManager_1 = require("../config/configManager");
const policyEngine_1 = require("../policy/policyEngine");
const ruleEngine_1 = require("../rules/ruleEngine");
const hookInstaller_1 = require("../shell/hookInstaller");
const terminalFormatter_1 = require("../ui/terminalFormatter");
const runtime_1 = require("./runtime");
/** Verifies the installation. Mandatory security components and optional AI are reported separately. */
async function doctorCommand(io) {
    const checks = [];
    const major = Number(process.versions.node.split(".")[0]);
    checks.push({ name: "Node.js >= 18", ok: major >= 18, detail: `found ${process.versions.node}`, optional: false });
    let cfgOk = false;
    let cfg = null;
    try {
        cfg = (0, configManager_1.loadConfig)({ env: io.env });
        cfgOk = true;
        checks.push({ name: "Configuration", ok: true, detail: cfg.exists ? cfg.path : `defaults (no file at ${cfg.path})`, optional: false });
    }
    catch (e) {
        checks.push({ name: "Configuration", ok: false, detail: e.message.split("\n")[0], optional: false });
    }
    if (cfg) {
        const a = (0, commandAnalyzer_1.analyzeCommand)("rm -rf /");
        const p = (0, policyEngine_1.evaluatePolicy)(a, (0, ruleEngine_1.evaluateRules)(a, { config: cfg.config, cwd: io.cwd, env: io.env }), cfg.config);
        checks.push({ name: "Rule engine self-test (rm -rf / is blocked)", ok: p.decision === "BLOCK", detail: `decision ${p.decision}`, optional: false });
        const b = (0, commandAnalyzer_1.analyzeCommand)("ls");
        const q = (0, policyEngine_1.evaluatePolicy)(b, (0, ruleEngine_1.evaluateRules)(b, { config: cfg.config, cwd: io.cwd, env: io.env }), cfg.config);
        checks.push({ name: "Rule engine self-test (ls is allowed)", ok: q.decision === "ALLOW", detail: `decision ${q.decision}`, optional: false });
        if (cfg.config.logging.enabled) {
            const file = (0, runtime_1.auditPath)(cfg.config, io.env);
            let ok = false;
            let detail = file;
            try {
                fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
                fs.accessSync(path.dirname(file), fs.constants.W_OK);
                ok = true;
            }
            catch (e) {
                detail = `${file}: ${e.message}`;
            }
            checks.push({ name: "Audit log writable", ok, detail, optional: false });
        }
        const home = io.env.HOME ?? "";
        for (const sh of ["bash", "zsh"]) {
            let installed = false;
            try {
                installed = fs.readFileSync((0, hookInstaller_1.defaultRcFile)(sh, home), "utf8").includes(hookInstaller_1.BEGIN_MARK);
            }
            catch {
                /* none */
            }
            checks.push({ name: `${sh} hook installed`, ok: installed, detail: installed ? (0, hookInstaller_1.defaultRcFile)(sh, home) : `run: guard install-hook ${sh}`, optional: true });
        }
        if (cfg.config.ai.enabled) {
            const client = new ollamaClient_1.OllamaClient({ baseUrl: cfg.config.ai.baseUrl, model: cfg.config.ai.model, timeoutMs: 2000, fetchImpl: io.fetchImpl });
            let up = false;
            let models = [];
            try {
                models = await client.listModels();
                up = true;
            }
            catch {
                /* offline */
            }
            checks.push({ name: "Ollama reachable", ok: up, detail: up ? cfg.config.ai.baseUrl : `not reachable at ${cfg.config.ai.baseUrl} (explanations fall back to built-in text)`, optional: true });
            if (up) {
                const has = models.includes(cfg.config.ai.model);
                checks.push({ name: `Model "${cfg.config.ai.model}" installed`, ok: has, detail: has ? "yes" : `not found; installed: ${models.join(", ") || "none"}`, optional: true });
            }
        }
        else {
            checks.push({ name: "AI explanations", ok: true, detail: "disabled in configuration", optional: true });
        }
    }
    const st = { color: (0, terminalFormatter_1.colorEnabled)({ isTTY: io.stdoutIsTTY }, io.env) };
    io.stdout((0, terminalFormatter_1.paint)(st, "bold", "Command Guard doctor") + "\n\n");
    for (const c of checks) {
        const mark = c.ok ? (0, terminalFormatter_1.paint)(st, "green", "[ OK ]") : c.optional ? (0, terminalFormatter_1.paint)(st, "yellow", "[ -- ]") : (0, terminalFormatter_1.paint)(st, "red", "[FAIL]");
        io.stdout(`${mark} ${c.name}${c.optional ? (0, terminalFormatter_1.paint)(st, "dim", " (optional)") : ""}\n       ${c.detail}\n`);
    }
    const failed = checks.filter((c) => !c.ok && !c.optional);
    io.stdout(`\n${failed.length === 0 ? "All required security components are working." : `${failed.length} required check(s) failed.`}\n`);
    return cfgOk && failed.length === 0 ? 0 : 1;
}
