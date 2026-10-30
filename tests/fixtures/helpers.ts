import { analyzeCommand, analyzeArgv } from "../../src/analyzer/commandAnalyzer";
import { parseConfig } from "../../src/config/configManager";
import type { GuardConfig } from "../../src/config/configSchema";
import { evaluatePolicy } from "../../src/policy/policyEngine";
import { evaluateRules } from "../../src/rules/ruleEngine";
import type { Analysis } from "../../src/types";
import fixtureConfig from "./fixture-config.json";

export function cfg(overrides: Record<string, unknown> = {}): GuardConfig {
  const base = JSON.parse(JSON.stringify(fixtureConfig)) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(overrides)) {
    merged[k] = typeof v === "object" && v !== null && !Array.isArray(v) ? { ...(base[k] as object), ...(v as object) } : v;
  }
  return parseConfig(merged);
}

export const TEST_ENV: NodeJS.ProcessEnv = { HOME: "/home/dev", PATH: "/usr/bin" };

export function judge(command: string | string[], config: GuardConfig = cfg(), env: NodeJS.ProcessEnv = TEST_ENV) {
  const analysis: Analysis = Array.isArray(command) ? analyzeArgv(command) : analyzeCommand(command);
  const findings = evaluateRules(analysis, {
    config,
    cwd: "/home/dev/project",
    home: "/home/dev",
    env,
    environment: { kubeContext: null, terraformWorkspace: null, awsProfile: null, databaseUrls: [] },
  });
  const policy = evaluatePolicy(analysis, findings, config);
  return { analysis, findings: policy.findings, policy };
}
