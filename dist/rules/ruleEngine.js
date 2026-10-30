"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_RULES = void 0;
exports.evaluateRules = evaluateRules;
const commandAnalyzer_1 = require("../analyzer/commandAnalyzer");
const environmentDetector_1 = require("../environment/environmentDetector");
const types_1 = require("../types");
const cloud_rules_1 = require("./cloud.rules");
const database_rules_1 = require("./database.rules");
const filesystem_rules_1 = require("./filesystem.rules");
const git_rules_1 = require("./git.rules");
const network_rules_1 = require("./network.rules");
const permissions_rules_1 = require("./permissions.rules");
const process_rules_1 = require("./process.rules");
const shell_rules_1 = require("./shell.rules");
exports.ALL_RULES = [
    filesystem_rules_1.filesystemRules,
    permissions_rules_1.permissionRules,
    git_rules_1.gitRules,
    database_rules_1.databaseRules,
    cloud_rules_1.cloudRules,
    network_rules_1.networkRules,
    process_rules_1.processRules,
    shell_rules_1.shellRules,
];
/**
 * Deterministic rule evaluation. Pure with respect to the command: the same
 * analysis, config and environment always produce the same findings.
 * Nothing is executed and the filesystem is never touched.
 */
function evaluateRules(analysis, opts) {
    const env = opts.env ?? process.env;
    const cwd = opts.cwd ?? process.cwd();
    const home = opts.home ?? env.HOME ?? "/";
    const environment = opts.environment ?? (0, environmentDetector_1.detectEnvironment)({ env, home });
    const found = [];
    for (const { segment, analysis: owner } of (0, commandAnalyzer_1.collectSegments)(analysis)) {
        const ctx = {
            segment,
            analysis: owner,
            config: opts.config,
            cwd,
            home,
            env: { ...env, ...segment.env },
            environment,
        };
        for (const rule of exports.ALL_RULES)
            found.push(...rule(ctx));
    }
    // whole-command rules (also look at nested text)
    const walk = (a) => {
        found.push(...(0, process_rules_1.analysisLevelProcessFindings)(a.raw));
        a.nested.forEach(walk);
    };
    walk(analysis);
    found.push(...(0, shell_rules_1.uncertaintyFindings)((0, commandAnalyzer_1.allUncertaintyReasons)(analysis)));
    found.push(...(0, shell_rules_1.unrecognizedFindings)((0, commandAnalyzer_1.allUnrecognized)(analysis)));
    return dedupe(found).sort((a, b) => types_1.RISK_ORDER[b.risk] - types_1.RISK_ORDER[a.risk]);
}
function dedupe(findings) {
    const seen = new Set();
    const out = [];
    for (const f of findings) {
        const key = `${f.ruleId}|${f.target ?? ""}|${f.reason}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(f);
    }
    return out;
}
