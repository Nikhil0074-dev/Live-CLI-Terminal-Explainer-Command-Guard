"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearExplanationCache = clearExplanationCache;
exports.explain = explain;
const fallbackExplainer_1 = require("./fallbackExplainer");
const ollamaClient_1 = require("./ollamaClient");
const promptBuilder_1 = require("./promptBuilder");
const responseParser_1 = require("./responseParser");
const cache = new Map();
function clearExplanationCache() {
    cache.clear();
}
/**
 * Produces an explanation. This service has NO influence on allow/block
 * decisions: it only returns text for display. Any AI failure falls back to
 * the deterministic explainer and is reported in `aiNote`.
 */
async function explain(analysis, findings, config, opts) {
    const fallback = (note) => (0, fallbackExplainer_1.explainDeterministic)(analysis, findings, note);
    if (!opts.useAi)
        return { explanation: fallback(), aiAttempted: false, aiFailed: false };
    if (!config.ai.enabled) {
        return { explanation: fallback("AI explanations are disabled in the configuration."), aiAttempted: false, aiFailed: false };
    }
    const key = `${config.ai.model}\u0000${analysis.raw}`;
    const cached = cache.get(key);
    if (cached)
        return { explanation: cached, aiAttempted: true, aiFailed: false };
    const client = new ollamaClient_1.OllamaClient({
        baseUrl: config.ai.baseUrl,
        model: config.ai.model,
        timeoutMs: config.ai.timeoutMs,
        fetchImpl: opts.fetchImpl,
    });
    try {
        const text = await client.generate((0, promptBuilder_1.buildExplanationPrompt)(analysis, opts.promptsDir));
        const parsed = (0, responseParser_1.parseExplanation)(text);
        if (!parsed) {
            return { explanation: fallback("The AI answer was not valid; showing the built-in explanation instead."), aiAttempted: true, aiFailed: true };
        }
        // Always surface what the deterministic engine found, whatever the model said.
        const det = (0, fallbackExplainer_1.explainDeterministic)(analysis, findings);
        parsed.sideEffects = [...new Set([...parsed.sideEffects, ...det.sideEffects])];
        parsed.uncertainties = [...new Set([...parsed.uncertainties, ...det.uncertainties])];
        cache.set(key, parsed);
        return { explanation: parsed, aiAttempted: true, aiFailed: false };
    }
    catch (e) {
        return {
            explanation: fallback(`AI explanation unavailable (${e.message}). Showing the built-in explanation. Security rules were not affected.`),
            aiAttempted: true,
            aiFailed: true,
        };
    }
}
