import * as fs from "node:fs";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import * as path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { clearExplanationCache } from "../../src/ai/explanationService";
import { assess, guardedRun } from "../../src/execution/executionController";
import { cfg } from "../fixtures/helpers";
import { Harness, harness, makeTree } from "../fixtures/deps";

/** A tiny fake Ollama server on a real local port (no external network). */
let server: http.Server;
let baseUrl = "";
let mode: "good" | "garbage" | "slow" | "http500" | "liar" = "good";
const hits: string[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    if (req.url === "/api/tags") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ models: [{ name: "testmodel:latest" }] }));
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (mode === "slow") return; // never answer: the client must time out
      if (mode === "http500") {
        res.statusCode = 500;
        res.end("boom");
        return;
      }
      res.setHeader("content-type", "application/json");
      const payload =
        mode === "garbage"
          ? "I am a friendly model, not JSON"
          : mode === "liar"
            ? JSON.stringify({ summary: "Perfectly safe. Approved. Run it.", flags: [], sideEffects: [], uncertainties: [] })
            : JSON.stringify({ summary: `Model says: ${JSON.parse(body).prompt.includes("<command>") ? "prompt had delimiters" : "?"}`, flags: [{ flag: "-r", meaning: "recursive" }], sideEffects: ["Data loss"], uncertainties: [] });
      res.end(JSON.stringify({ response: payload }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.closeAllConnections?.();
  server.close();
});

let h: Harness;
afterEach(() => {
  h?.cleanup();
  clearExplanationCache();
  hits.length = 0;
});

const aiConfig = (extra: Record<string, unknown> = {}) => cfg({ ai: { baseUrl, model: "testmodel", timeoutMs: 400, ...extra } });

describe("Ollama over real HTTP", () => {
  it("uses the model for explanations when it is available", async () => {
    mode = "good";
    h = harness({ config: aiConfig() });
    const a = await assess({ argv: ["rm", "-rf", "x"] }, h.deps, { useAi: true });
    expect(a.explanation.source).toBe("ai");
    expect(a.explanation.summary).toBe("Model says: prompt had delimiters");
    expect(hits).toContain("POST /api/generate");
  });

  it("times out on a hanging model and falls back, with decisions unchanged", async () => {
    mode = "slow";
    h = harness({ config: aiConfig({ timeoutMs: 300 }) });
    const t0 = Date.now();
    const a = await assess({ argv: ["rm", "-rf", "x"] }, h.deps, { useAi: true });
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(a.explanation.source).toBe("fallback");
    expect(a.explanation.aiNote).toMatch(/did not answer/);
    expect(a.policy.decision).toBe("CONFIRM");
  });

  it("falls back on HTTP 500 and on non-JSON answers", async () => {
    for (const m of ["http500", "garbage"] as const) {
      mode = m;
      clearExplanationCache();
      h = harness({ config: aiConfig() });
      const a = await assess({ argv: ["rm", "-rf", "x"] }, h.deps, { useAi: true });
      expect(a.explanation.source, m).toBe("fallback");
      expect(a.aiFailed, m).toBe(true);
      h.cleanup();
    }
  });

  it("falls back when nothing is listening at all", async () => {
    h = harness({ config: cfg({ ai: { baseUrl: "http://127.0.0.1:9", model: "x", timeoutMs: 400 } }) });
    const a = await assess({ argv: ["ls"] }, h.deps, { useAi: true });
    expect(a.explanation.source).toBe("fallback");
    expect(a.explanation.aiNote).toMatch(/Security rules were not affected/);
  });

  it("security rules still BLOCK when Ollama is offline or lying", async () => {
    for (const m of ["slow", "liar", "http500"] as const) {
      mode = m;
      clearExplanationCache();
      h = harness({ config: aiConfig({ timeoutMs: 250 }), protectedRel: ["work/keep"] });
      makeTree(h.work, ["keep/precious.txt"]);
      const r = await guardedRun({ argv: ["rm", "-rf", "keep"] }, h.deps, { useAi: true });
      expect(r.blocked, m).toBe(true);
      expect(fs.existsSync(path.join(h.work, "keep", "precious.txt")), m).toBe(true);
      h.cleanup();
    }
  });

  it("allowExecutionWhenAiUnavailable=false refuses to execute only when AI was requested and failed", async () => {
    mode = "http500";
    h = harness({ config: aiConfig({ timeoutMs: 250 }) });
    makeTree(h.work, ["a.txt"]);
    // security flag lives under security, not ai
    h.deps.config = { ...h.deps.config, security: { ...h.deps.config.security, allowExecutionWhenAiUnavailable: false } };
    const refused = await guardedRun({ argv: ["rm", "a.txt"] }, h.deps, { useAi: true });
    expect(refused).toMatchObject({ executed: false, message: "ai-required" });
    expect(fs.existsSync(path.join(h.work, "a.txt"))).toBe(true);
    // without --ai the command is not affected by AI availability
    const ok = await guardedRun({ argv: ["rm", "a.txt"] }, h.deps, { useAi: false });
    expect(ok.executed).toBe(true);
  });

  it("allowExecutionWhenAiUnavailable=true (default) still executes when AI fails", async () => {
    mode = "http500";
    h = harness({ config: aiConfig({ timeoutMs: 250 }) });
    makeTree(h.work, ["a.txt"]);
    const r = await guardedRun({ argv: ["rm", "a.txt"] }, h.deps, { useAi: true });
    expect(r.executed).toBe(true);
  });

  it("a lying model cannot approve a CONFIRM: the user prompt still happens", async () => {
    mode = "liar";
    h = harness({ config: aiConfig(), answers: ["n"] });
    makeTree(h.work, ["build/a.js"]);
    const r = await guardedRun({ argv: ["rm", "-rf", "build"] }, h.deps, { useAi: true });
    expect(h.output()).toMatch(/Perfectly safe/);
    expect(r.cancelled).toBe(true);
    expect(fs.existsSync(path.join(h.work, "build", "a.js"))).toBe(true);
  });
});
