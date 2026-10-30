import { assess } from "../execution/executionController";
import { renderAnalysis } from "../ui/terminalFormatter";
import { EXIT } from "../types";
import { buildRuntime, CliIO, toInput } from "./runtime";

export interface ExplainOptions {
  ai?: boolean; // commander sets false for --no-ai
  json?: boolean;
}

/** Explain a command without running it. */
export async function explainCommand(parts: string[], opts: ExplainOptions, io: CliIO): Promise<number> {
  const rt = buildRuntime(io);
  try {
    const deps = rt.deps("stdout");
    const placeholder = rt.config.ai.model === "YOUR_INSTALLED_MODEL";
    const wantAi = opts.ai !== false && rt.config.ai.enabled && !placeholder;
    const a = await assess(toInput(parts), deps, { useAi: wantAi });
    if (opts.ai !== false && rt.config.ai.enabled && placeholder && !a.explanation.aiNote) {
      a.explanation.aiNote = "No AI model is configured (ai.model is a placeholder). Showing the built-in explanation.";
    }
    if (opts.json) io.stdout(JSON.stringify({ command: a.analysis.raw, explanation: a.explanation, risk: a.policy.risk, decision: a.policy.decision }, null, 2) + "\n");
    else io.stdout(renderAnalysis(deps.style, a.analysis.raw, a.policy, a.explanation) + "\n");
    return EXIT.OK;
  } finally {
    rt.close();
  }
}
