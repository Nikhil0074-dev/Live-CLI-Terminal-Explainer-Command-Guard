"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaClient = exports.OllamaError = void 0;
class OllamaError extends Error {
    constructor(message) {
        super(message);
        this.name = "OllamaError";
    }
}
exports.OllamaError = OllamaError;
/** Minimal Ollama HTTP client (local only by default). Every call has a timeout. */
class OllamaClient {
    baseUrl;
    model;
    timeoutMs;
    fetchImpl;
    constructor(opts) {
        this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
        this.model = opts.model;
        this.timeoutMs = opts.timeoutMs;
        this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch);
    }
    async request(path, init, timeoutMs) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), timeoutMs);
        try {
            const res = await this.fetchImpl(this.baseUrl + path, {
                method: init.method ?? "GET",
                headers: { "Content-Type": "application/json" },
                body: init.body,
                signal: ctl.signal,
            });
            if (!res.ok)
                throw new OllamaError(`Ollama returned HTTP ${res.status}`);
            return await res.json();
        }
        catch (e) {
            if (e instanceof OllamaError)
                throw e;
            if (e.name === "AbortError")
                throw new OllamaError(`Ollama did not answer within ${timeoutMs} ms`);
            throw new OllamaError(`Cannot reach Ollama at ${this.baseUrl}: ${e.message}`);
        }
        finally {
            clearTimeout(timer);
        }
    }
    /** Names of locally installed models. */
    async listModels(timeoutMs = Math.min(this.timeoutMs, 2000)) {
        const data = (await this.request("/api/tags", {}, timeoutMs));
        return (data.models ?? []).map((m) => m.name ?? m.model ?? "").filter(Boolean);
    }
    async isAvailable() {
        try {
            await this.listModels();
            return true;
        }
        catch {
            return false;
        }
    }
    async hasModel() {
        const names = await this.listModels();
        return names.some((n) => n === this.model || n.split(":")[0] === this.model.split(":")[0] && !this.model.includes(":"));
    }
    /** Non-streaming JSON generation. Returns the raw model text. */
    async generate(prompt) {
        const data = (await this.request("/api/generate", {
            method: "POST",
            body: JSON.stringify({ model: this.model, prompt, stream: false, format: "json", options: { temperature: 0 } }),
        }, this.timeoutMs));
        if (typeof data.response !== "string")
            throw new OllamaError("Ollama response had no text");
        return data.response;
    }
}
exports.OllamaClient = OllamaClient;
