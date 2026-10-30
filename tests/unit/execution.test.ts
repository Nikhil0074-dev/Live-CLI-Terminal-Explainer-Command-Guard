import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analyzeArgv, analyzeCommand } from "../../src/analyzer/commandAnalyzer";
import { askConfirmation, createLineReader } from "../../src/execution/confirmation";
import { runCommand } from "../../src/execution/commandRunner";
import { buildPreview } from "../../src/execution/previewService";

function reader(...lines: string[]) {
  const s = new PassThrough();
  for (const l of lines) s.write(l + "\n");
  s.end();
  return createLineReader(s);
}

describe("confirmation", () => {
  const ask = async (input: string | null) => {
    const out: string[] = [];
    const r = input === null ? reader() : reader(input);
    const ans = await askConfirmation(r, (s) => out.push(s), "Continue? ");
    r.close();
    return { ans, out: out.join("") };
  };

  it("only y/yes approves (case-insensitive, trimmed)", async () => {
    expect((await ask("y")).ans).toBe("yes");
    expect((await ask(" YES ")).ans).toBe("yes");
  });

  it("defaults to NO on Enter, junk, 'yep', and end of input", async () => {
    for (const x of ["", "n", "no", "yep", "sure", "ok", "1"]) expect((await ask(x)).ans, x).toBe("no");
    expect((await ask(null)).ans).toBe("no");
  });

  it("e / explain asks for more detail", async () => {
    expect((await ask("e")).ans).toBe("explain");
    expect((await ask("Explain")).ans).toBe("explain");
  });

  it("shows the question", async () => {
    expect((await ask("n")).out).toContain("Continue? ");
  });

  it("one reader serves several consecutive prompts without losing input", async () => {
    const r = reader("e", "y");
    const w = () => undefined;
    expect(await askConfirmation(r, w, "?")).toBe("explain");
    expect(await askConfirmation(r, w, "?")).toBe("yes");
    expect(await askConfirmation(r, w, "?")).toBe("no"); // stream ended
    r.close();
  });
});

describe("commandRunner", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "guard-run-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const run = (a: ReturnType<typeof analyzeCommand>, extra = {}) => runCommand(a, { cwd: dir, stdio: "pipe", env: { ...process.env, HOME: dir }, home: dir, ...extra });

  it("runs simple commands directly without a shell and returns the exit code", async () => {
    const r = await run(analyzeCommand("echo hello"));
    expect(r.usedShell).toBe(false);
    expect(r.stdout).toBe("hello\n");
    expect(r.exitCode).toBe(0);
    expect((await run(analyzeCommand("false"))).exitCode).toBe(1);
  });

  it("preserves argument boundaries exactly (argv mode)", async () => {
    const r = await run(analyzeArgv(["node", "-e", "console.log(JSON.stringify(process.argv.slice(1)))", "a b", "$HOME", "*", "it's"]));
    expect(r.usedShell).toBe(false);
    expect(JSON.parse(r.stdout)).toEqual(["a b", "$HOME", "*", "it's"]);
  });

  it("does not let shell metacharacters in argv mode run anything", async () => {
    const marker = path.join(dir, "pwned");
    const r = await run(analyzeArgv(["echo", `x; touch ${marker}`, "&&", "touch", marker]));
    expect(r.exitCode).toBe(0);
    expect(fs.existsSync(marker)).toBe(false);
  });

  it("uses a shell only when the syntax needs one, passing the original text", async () => {
    const r = await run(analyzeCommand("echo a && echo b | tr a-z A-Z"));
    expect(r.usedShell).toBe(true);
    expect(r.stdout).toBe("a\nB\n");
  });

  it("expands globs and variables via the shell", async () => {
    fs.writeFileSync(path.join(dir, "one.txt"), "");
    fs.writeFileSync(path.join(dir, "two.txt"), "");
    const r = await run(analyzeCommand("ls *.txt"));
    expect(r.stdout.trim().split("\n")).toEqual(["one.txt", "two.txt"]);
  });

  it("applies inline environment assignments", async () => {
    const r = await run(analyzeCommand("FOO=bar node -e \"process.stdout.write(process.env.FOO)\""));
    expect(r.stdout).toBe("bar");
  });

  it("expands a leading ~ for direct execution", async () => {
    fs.writeFileSync(path.join(dir, "f"), "x");
    const r = await run(analyzeCommand("ls ~/f"));
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe(path.join(dir, "f"));
  });

  it("reports command-not-found as exit 127", async () => {
    const r = await run(analyzeCommand("definitely-not-a-real-command-xyz"));
    expect(r.exitCode).toBe(127);
    expect(r.error).toMatch(/not found/);
  });

  it("maps signals to 128+N", async () => {
    const r = await run(analyzeCommand("node -e \"process.kill(process.pid, 'SIGTERM')\""));
    expect(r.exitCode).toBe(128 + 15);
  });
});

describe("previewService", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "guard-prev-"));
    fs.mkdirSync(path.join(dir, "build", "sub"), { recursive: true });
    fs.writeFileSync(path.join(dir, "build", "a.js"), "");
    fs.writeFileSync(path.join(dir, "build", "sub", "b.js"), "");
    fs.writeFileSync(path.join(dir, "x.log"), "");
    fs.writeFileSync(path.join(dir, "y.log"), "");
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("previews rm -rf without deleting anything", async () => {
    const p = await buildPreview(analyzeCommand("rm -rf build"), dir, dir);
    expect(p?.title).toMatch(/4 item/);
    expect(p?.lines.sort()).toEqual(["build", "build/a.js", "build/sub", "build/sub/b.js"]);
    expect(p?.note).toMatch(/may change/);
    expect(fs.existsSync(path.join(dir, "build", "a.js"))).toBe(true);
  });

  it("previews find -delete using find without -delete", async () => {
    const p = await buildPreview(analyzeCommand("find . -name '*.log' -delete"), dir, dir);
    expect(p?.title).toMatch(/2 match/);
    expect(fs.existsSync(path.join(dir, "x.log"))).toBe(true);
  });

  it("reports nothing-to-delete for missing paths", async () => {
    const p = await buildPreview(analyzeCommand("rm -rf nothing-here"), dir, dir);
    expect(p?.lines).toEqual([]);
  });

  it("truncates long previews", async () => {
    for (let i = 0; i < 40; i++) fs.writeFileSync(path.join(dir, "build", `f${i}.js`), "");
    const p = await buildPreview(analyzeCommand("rm -rf build"), dir, dir);
    expect(p?.truncated).toBe(true);
    expect(p?.lines.length).toBeLessThanOrEqual(20);
  });

  it("returns null when no reliable preview exists (globs, variables, pipelines, other commands)", async () => {
    for (const c of ["rm -rf build/*", 'rm -rf "$X"', "ls | xargs rm", "chmod -R 777 build", "echo hi"]) {
      expect(await buildPreview(analyzeCommand(c), dir, dir), c).toBeNull();
    }
  });
});
