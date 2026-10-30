import { describe, expect, it } from "vitest";
import { analyzeCommand } from "../../src/analyzer/commandAnalyzer";
import { explainDeterministic, knownFacts } from "../../src/ai/fallbackExplainer";

const ex = (c: string) => explainDeterministic(analyzeCommand(c));

describe("fallbackExplainer", () => {
  it("explains rm -rf with per-flag meanings", () => {
    const e = ex("rm -rf ./build");
    expect(e.source).toBe("fallback");
    expect(e.summary).toMatch(/delete files or directories/i);
    expect(e.flags.map((f) => f.flag).join(" ")).toMatch(/-r/);
    expect(e.flags.find((f) => f.flag.startsWith("-f"))?.meaning).toMatch(/prompt/i);
    expect(e.flags.find((f) => f.flag === "./build")?.meaning).toBe("Target");
    expect(e.sideEffects.join(" ")).toMatch(/not go to the trash/i);
  });

  it("explains sudo chmod with a numeric mode breakdown", () => {
    const e = ex("sudo chmod -R 777 /var/www");
    expect(e.flags.some((f) => f.flag === "sudo")).toBe(true);
    const mode = e.flags.find((f) => f.flag === "777");
    expect(mode?.meaning).toMatch(/owner read\+write\+execute, group read\+write\+execute, others read\+write\+execute/);
    expect(e.flags.find((f) => f.flag === "-R")?.meaning).toMatch(/every file below/);
  });

  it("explains each part of a find expression", () => {
    const e = ex('find . -type f -name "*.log" -delete');
    const text = e.flags.map((f) => `${f.flag} => ${f.meaning}`).join("\n");
    expect(e.summary).toMatch(/delete every match/i);
    expect(text).toMatch(/-type f => Match regular files/);
    expect(text).toMatch(/-name \*\.log/);
    expect(text).toMatch(/-delete => Delete every match/);
  });

  it("explains git subcommands and flags", () => {
    const e = ex("git push --force origin main");
    expect(e.summary).toMatch(/git push/i);
    expect(e.flags.find((f) => f.flag === "--force")?.meaning).toMatch(/overwrite the remote/i);
  });

  it("describes pipelines step by step", () => {
    const e = ex("cat a.txt | grep foo && echo done");
    expect(e.summary).toMatch(/piped into/);
    expect(e.summary).toMatch(/only if that succeeds/);
  });

  it("describes redirections", () => {
    const e = ex("echo hi > out.txt");
    expect(e.flags.some((f) => /overwrite/i.test(f.meaning))).toBe(true);
  });

  it("never invents an explanation for unknown commands", () => {
    const e = ex("frobnicate --now");
    expect(e.summary).toMatch(/No reliable explanation/);
    expect(e.uncertainties.join(" ")).toMatch(/No built-in description for `frobnicate`/);
    expect(e.flags).toEqual([]);
  });

  it("marks unknown options explicitly", () => {
    const e = ex("ls --made-up-flag");
    expect(e.flags.find((f) => f.flag === "--made-up-flag")?.meaning).toMatch(/no built-in description/);
  });

  it("surfaces analyser uncertainty", () => {
    expect(ex("eval \"$X\"").uncertainties.join(" ")).toMatch(/eval/i);
  });

  it("handles empty input", () => {
    expect(ex("").summary).toBe("Nothing to run.");
  });

  it("knownFacts only lists recognised commands", () => {
    expect(knownFacts(analyzeCommand("rm -rf x"))).toEqual(["rm: delete files or directories"]);
    expect(knownFacts(analyzeCommand("frobnicate"))).toEqual([]);
  });
});
