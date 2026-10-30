import { assess } from "../execution/executionController";
import { buildPreview } from "../execution/previewService";
import { renderAnalysis, safeText } from "../ui/terminalFormatter";
import { EXIT } from "../types";
import { buildRuntime, CliIO, toInput } from "./runtime";

export interface CheckOptions {
  json?: boolean;
  ai?: boolean;
  preview?: boolean;
}

/** Analyse a command without running it. Exit: 0 allow/warn, 2 confirm, 3 block. */
export async function checkCommand(parts: string[], opts: CheckOptions, io: CliIO): Promise<number> {
  const rt = buildRuntime(io);
  try {
    const deps = rt.deps("stdout");
    const a = await assess(toInput(parts), deps, { useAi: Boolean(opts.ai), source: "check" });
    rt.logger.write(
      {
        commandCategory: a.findings[0]?.category ?? "general",
        risk: a.policy.risk,
        ruleIds: a.findings.map((f) => f.ruleId),
        decision: a.policy.decision,
        confirmationRequested: false,
        approved: false,
        executed: false,
        uncertain: a.policy.uncertain,
        source: "check",
      },
      a.analysis.raw,
    );
    if (opts.json) {
      io.stdout(
        JSON.stringify(
          {
            command: a.analysis.raw,
            risk: a.policy.risk,
            decision: a.policy.decision,
            score: a.policy.score,
            uncertain: a.policy.uncertain,
            findings: a.policy.findings,
            reasons: a.policy.reasons,
            explanation: a.explanation,
          },
          null,
          2,
        ) + "\n",
      );
    } else {
      io.stdout(renderAnalysis(deps.style, a.analysis.raw, a.policy, a.explanation) + "\n");
      if (opts.preview) {
        const p = await buildPreview(a.analysis, io.cwd, rt.home);
        if (p) {
          io.stdout(`\n${p.title}\n${p.lines.map((l) => "  " + safeText(l)).join("\n")}\n  (${p.note})\n`);
        } else io.stdout("\nNo reliable preview is available for this command.\n");
      }
    }
    if (a.policy.decision === "BLOCK") return EXIT.CHECK_BLOCK;
    if (a.policy.decision === "CONFIRM") return EXIT.CHECK_CONFIRM;
    return EXIT.OK;
  } finally {
    rt.close();
  }
}
