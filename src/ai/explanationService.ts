import type { GuardConfig } from "../config/configSchema";
import type { Analysis, Explanation, Finding } from "../types";
import { explainDeterministic } from "./fallbackExplainer";
import { FetchLike, OllamaClient } from "./ollamaClient";
import { buildExplanationPrompt } from "./promptBuilder";
import { parseExplanation } from "./responseParser";

export interface ExplainOptions {
  /** Ask the local model for an explanation (otherwise built-in explanations are used). */
  useAi: boolean;
  fetchImpl?: FetchLike;
  promptsDir?: string;
}

export interface ExplainOutcome {
  explanation: Explanation;
  aiAttempted: boolean;
  aiFailed: boolean;
}

const cache = new Map<string, Explanation>();

export function clearExplanationCache(): void {
  cache.clear();
}

/**
 * Produces an explanation. This service has NO influence on allow/block
 * decisions: it only returns text for display. Any AI failure falls back to
 * the deterministic explainer and is reported in `aiNote`.
 */
export async function explain(
  analysis: Analysis,
  findings: Finding[],
  config: GuardConfig,
  opts: ExplainOptions,
): Promise<ExplainOutcome> {
  const fallback = (note?: string): Explanation => explainDeterministic(analysis, findings, note);
  if (!opts.useAi) return { explanation: fallback(), aiAttempted: false, aiFailed: false };
  if (!config.ai.enabled) {
    return { explanation: fallback("AI explanations are disabled in the configuration."), aiAttempted: false, aiFailed: false };
  }
  const key = `${config.ai.model}\u0000${analysis.raw}`;
  const cached = cache.get(key);
  if (cached) return { explanation: cached, aiAttempted: true, aiFailed: false };

  const client = new OllamaClient({
    baseUrl: config.ai.baseUrl,
    model: config.ai.model,
    timeoutMs: config.ai.timeoutMs,
    fetchImpl: opts.fetchImpl,
  });
  try {
    const text = await client.generate(buildExplanationPrompt(analysis, opts.promptsDir));
    const parsed = parseExplanation(text);
    if (!parsed) {
      return { explanation: fallback("The AI answer was not valid; showing the built-in explanation instead."), aiAttempted: true, aiFailed: true };
    }
    // Always surface what the deterministic engine found, whatever the model said.
    const det = explainDeterministic(analysis, findings);
    parsed.sideEffects = [...new Set([...parsed.sideEffects, ...det.sideEffects])];
    parsed.uncertainties = [...new Set([...parsed.uncertainties, ...det.uncertainties])];
    cache.set(key, parsed);
    return { explanation: parsed, aiAttempted: true, aiFailed: false };
  } catch (e) {
    return {
      explanation: fallback(`AI explanation unavailable (${(e as Error).message}). Showing the built-in explanation. Security rules were not affected.`),
      aiAttempted: true,
      aiFailed: true,
    };
  }
}
