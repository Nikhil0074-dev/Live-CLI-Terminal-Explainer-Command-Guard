export type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export class OllamaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OllamaError";
  }
}

export interface OllamaOptions {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  fetchImpl?: FetchLike;
}

/** Minimal Ollama HTTP client (local only by default). Every call has a timeout. */
export class OllamaClient {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(opts: OllamaOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs;
    this.fetchImpl = opts.fetchImpl ?? ((globalThis as unknown as { fetch: FetchLike }).fetch);
  }

  private async request(path: string, init: { method?: string; body?: string }, timeoutMs: number): Promise<unknown> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await this.fetchImpl(this.baseUrl + path, {
        method: init.method ?? "GET",
        headers: { "Content-Type": "application/json" },
        body: init.body,
        signal: ctl.signal,
      });
      if (!res.ok) throw new OllamaError(`Ollama returned HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (e instanceof OllamaError) throw e;
      if ((e as Error).name === "AbortError") throw new OllamaError(`Ollama did not answer within ${timeoutMs} ms`);
      throw new OllamaError(`Cannot reach Ollama at ${this.baseUrl}: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Names of locally installed models. */
  async listModels(timeoutMs = Math.min(this.timeoutMs, 2000)): Promise<string[]> {
    const data = (await this.request("/api/tags", {}, timeoutMs)) as { models?: Array<{ name?: string; model?: string }> };
    return (data.models ?? []).map((m) => m.name ?? m.model ?? "").filter(Boolean);
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.listModels();
      return true;
    } catch {
      return false;
    }
  }

  async hasModel(): Promise<boolean> {
    const names = await this.listModels();
    return names.some((n) => n === this.model || n.split(":")[0] === this.model.split(":")[0] && !this.model.includes(":"));
  }

  /** Non-streaming JSON generation. Returns the raw model text. */
  async generate(prompt: string): Promise<string> {
    const data = (await this.request(
      "/api/generate",
      {
        method: "POST",
        body: JSON.stringify({ model: this.model, prompt, stream: false, format: "json", options: { temperature: 0 } }),
      },
      this.timeoutMs,
    )) as { response?: unknown };
    if (typeof data.response !== "string") throw new OllamaError("Ollama response had no text");
    return data.response;
  }
}
