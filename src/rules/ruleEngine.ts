import { allUncertaintyReasons, allUnrecognized, collectSegments } from "../analyzer/commandAnalyzer";
import type { GuardConfig } from "../config/configSchema";
import { detectEnvironment, EnvironmentContext } from "../environment/environmentDetector";
import { Analysis, Finding, RISK_ORDER } from "../types";
import { cloudRules } from "./cloud.rules";
import { databaseRules } from "./database.rules";
import { filesystemRules } from "./filesystem.rules";
import { gitRules } from "./git.rules";
import { networkRules } from "./network.rules";
import { permissionRules } from "./permissions.rules";
import { analysisLevelProcessFindings, processRules } from "./process.rules";
import type { Rule, RuleContext } from "./ruleTypes";
import { shellRules, unrecognizedFindings, uncertaintyFindings } from "./shell.rules";

export const ALL_RULES: Rule[] = [
  filesystemRules,
  permissionRules,
  gitRules,
  databaseRules,
  cloudRules,
  networkRules,
  processRules,
  shellRules,
];

export interface EvaluateOptions {
  config: GuardConfig;
  cwd?: string;
  home?: string;
  env?: NodeJS.ProcessEnv;
  environment?: EnvironmentContext;
}

/**
 * Deterministic rule evaluation. Pure with respect to the command: the same
 * analysis, config and environment always produce the same findings.
 * Nothing is executed and the filesystem is never touched.
 */
export function evaluateRules(analysis: Analysis, opts: EvaluateOptions): Finding[] {
  const env = opts.env ?? process.env;
  const cwd = opts.cwd ?? process.cwd();
  const home = opts.home ?? env.HOME ?? "/";
  const environment = opts.environment ?? detectEnvironment({ env, home });
  const found: Finding[] = [];

  for (const { segment, analysis: owner } of collectSegments(analysis)) {
    const ctx: RuleContext = {
      segment,
      analysis: owner,
      config: opts.config,
      cwd,
      home,
      env: { ...env, ...segment.env },
      environment,
    };
    for (const rule of ALL_RULES) found.push(...rule(ctx));
  }

  // whole-command rules (also look at nested text)
  const walk = (a: Analysis): void => {
    found.push(...analysisLevelProcessFindings(a.raw));
    a.nested.forEach(walk);
  };
  walk(analysis);

  found.push(...uncertaintyFindings(allUncertaintyReasons(analysis)));
  found.push(...unrecognizedFindings(allUnrecognized(analysis)));

  return dedupe(found).sort((a, b) => RISK_ORDER[b.risk] - RISK_ORDER[a.risk]);
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const f of findings) {
    const key = `${f.ruleId}|${f.target ?? ""}|${f.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}
