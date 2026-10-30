import { analyzeArgv, analyzeCommand } from "../analyzer/commandAnalyzer";
import { explain } from "../ai/explanationService";
import type { FetchLike } from "../ai/ollamaClient";
import type { GuardConfig } from "../config/configSchema";
import { detectEnvironment, EnvironmentContext } from "../environment/environmentDetector";
import type { AuditLogger } from "../logging/auditLogger";
import { evaluatePolicy } from "../policy/policyEngine";
import { evaluateRules } from "../rules/ruleEngine";
import { renderAnalysis, renderExplanation, safeText, Style } from "../ui/terminalFormatter";
import { Analysis, EXIT, Explanation, Finding, GuardResult, PolicyResult } from "../types";
import { askConfirmation, LineReader } from "./confirmation";
import { runCommand } from "./commandRunner";
import { buildPreview } from "./previewService";

export interface GuardDeps {
  config: GuardConfig;
  logger: AuditLogger;
  cwd: string;
  home: string;
  env: NodeJS.ProcessEnv;
  /** Where guard messages are written. */
  write: (s: string) => void;
  style: Style;
  reader: LineReader;
  fetchImpl?: FetchLike;
  promptsDir?: string;
  stdio?: "inherit" | "pipe";
  environment?: EnvironmentContext;
}

export interface GuardInput {
  /** A command typed as one shell string. */
  raw?: string;
  /** A command already split into arguments (executed without a shell). */
  argv?: string[];
}

export interface GuardOptions {
  useAi?: boolean;
  dryRun?: boolean;
  assumeYes?: boolean;
  source?: "run" | "hook" | "check";
}

export interface Assessment {
  analysis: Analysis;
  findings: Finding[];
  policy: PolicyResult;
  explanation: Explanation;
  aiAttempted: boolean;
  aiFailed: boolean;
}

export function analyzeInput(input: GuardInput): Analysis {
  if (input.argv && input.argv.length > 0) return analyzeArgv(input.argv);
  return analyzeCommand(input.raw ?? "");
}

/** Analyse + apply rules + decide policy + explain. Executes nothing. */
export async function assess(input: GuardInput, deps: GuardDeps, opts: GuardOptions = {}): Promise<Assessment> {
  const analysis = analyzeInput(input);
  const environment = deps.environment ?? detectEnvironment({ env: deps.env, home: deps.home });
  const findings = evaluateRules(analysis, { config: deps.config, cwd: deps.cwd, home: deps.home, env: deps.env, environment });
  const policy = evaluatePolicy(analysis, findings, deps.config);
  const out = await explain(analysis, policy.findings, deps.config, {
    useAi: Boolean(opts.useAi),
    fetchImpl: deps.fetchImpl,
    promptsDir: deps.promptsDir,
  });
  return { analysis, findings: policy.findings, policy, explanation: out.explanation, aiAttempted: out.aiAttempted, aiFailed: out.aiFailed };
}

export function categoryOf(findings: Finding[]): string {
  return findings.find((f) => f.risk !== "LOW")?.category ?? findings[0]?.category ?? "general";
}

function logDecision(
  deps: GuardDeps,
  a: Assessment,
  extra: { confirmationRequested: boolean; approved: boolean; executed: boolean; exitCode?: number; source: "run" | "hook" | "check" },
): void {
  deps.logger.write(
    {
      commandCategory: categoryOf(a.findings),
      risk: a.policy.risk,
      ruleIds: a.findings.map((f) => f.ruleId),
      decision: a.policy.decision,
      confirmationRequested: extra.confirmationRequested,
      approved: extra.approved,
      executed: extra.executed,
      exitCode: extra.exitCode,
      uncertain: a.policy.uncertain,
      source: extra.source,
    },
    a.analysis.raw,
  );
}

/**
 * The full guarded workflow:
 * analyse -> rules -> policy -> explain -> (block | confirm | warn) -> execute -> audit.
 * The explanation (AI or not) is display-only and cannot approve anything.
 */
export async function guardedRun(input: GuardInput, deps: GuardDeps, opts: GuardOptions = {}): Promise<GuardResult> {
  const source = opts.source ?? "run";
  const a = await assess(input, deps, opts);
  const { policy, analysis } = a;
  // Harmless commands run silently; anything else shows the full explanation panel.
  if (policy.decision !== "ALLOW" || source !== "run") {
    deps.write(renderAnalysis(deps.style, analysis.raw, policy, a.explanation) + "\n");
  }

  const base = { decision: policy.decision, risk: policy.risk, findings: a.findings };

  if (policy.decision === "BLOCK") {
    deps.write(`\nBlocked: ${policy.blockedBy.join(", ")}. This cannot be overridden from the command line.\n`);
    logDecision(deps, a, { confirmationRequested: false, approved: false, executed: false, source });
    return { ...base, approved: false, executed: false, exitCode: EXIT.BLOCKED, cancelled: false, blocked: true, message: "blocked" };
  }

  if (analysis.segments.length === 0) {
    deps.write("\nNothing to run.\n");
    return { ...base, approved: false, executed: false, exitCode: EXIT.USAGE, cancelled: false, blocked: false, message: "empty" };
  }

  if (opts.useAi && a.aiFailed && !deps.config.security.allowExecutionWhenAiUnavailable) {
    deps.write("\nNot executed: an AI explanation was requested, it is unavailable, and allowExecutionWhenAiUnavailable is false.\n");
    logDecision(deps, a, { confirmationRequested: false, approved: false, executed: false, source });
    return { ...base, approved: false, executed: false, exitCode: EXIT.GENERIC_ERROR, cancelled: false, blocked: false, message: "ai-required" };
  }

  let approved = true;
  let confirmationRequested = false;

  if (policy.decision === "CONFIRM") {
    confirmationRequested = true;
    approved = false;
    const preview = await buildPreview(analysis, deps.cwd, deps.home).catch(() => null);
    if (preview) {
      deps.write(`\n${preview.title}\n`);
      for (const l of preview.lines) deps.write(`  ${safeText(l)}\n`);
      if (preview.truncated) deps.write("  ...\n");
      deps.write(`  (${preview.note})\n`);
    }
    if (opts.assumeYes) {
      if (deps.config.security.allowYesFlag) {
        approved = true;
        deps.write("\n--yes: approval assumed (allowed by configuration).\n");
      } else {
        deps.write("\n--yes was ignored because security.allowYesFlag is false.\n");
      }
    }
    for (let attempt = 0; !approved && attempt < 3; attempt++) {
      const ans = await askConfirmation(deps.reader, deps.write, "\nHigh-risk command. Continue? [y/N/e=explain more] ");
      if (ans === "yes") approved = true;
      else if (ans === "explain") {
        const more = await explain(analysis, a.findings, deps.config, { useAi: true, fetchImpl: deps.fetchImpl, promptsDir: deps.promptsDir });
        deps.write("\n" + renderExplanation(deps.style, more.explanation) + "\n");
      } else break;
    }
    if (!approved) {
      deps.write("Cancelled. Nothing was executed.\n");
      logDecision(deps, a, { confirmationRequested, approved: false, executed: false, source });
      return { ...base, approved: false, executed: false, exitCode: EXIT.CANCELLED, cancelled: true, blocked: false, message: "cancelled" };
    }
  }

  if (opts.dryRun) {
    deps.write("\nDry run: the command was not executed.\n");
    logDecision(deps, a, { confirmationRequested, approved, executed: false, source });
    return { ...base, approved, executed: false, exitCode: EXIT.OK, cancelled: false, blocked: false, message: "dry-run" };
  }

  const outcome = await runCommand(analysis, { cwd: deps.cwd, env: deps.env, stdio: deps.stdio ?? "inherit", home: deps.home });
  if (outcome.error) deps.write(`guard: ${outcome.error}\n`);
  if (deps.stdio === "pipe") {
    if (outcome.stdout) deps.write(outcome.stdout);
    if (outcome.stderr) deps.write(outcome.stderr);
  }
  logDecision(deps, a, { confirmationRequested, approved, executed: true, exitCode: outcome.exitCode, source });
  return { ...base, approved, executed: true, exitCode: outcome.exitCode, cancelled: false, blocked: false };
}
