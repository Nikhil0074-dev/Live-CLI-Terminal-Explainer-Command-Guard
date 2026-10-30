import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { guardedRun } from "../../src/execution/executionController";
import { cfg } from "../fixtures/helpers";
import { Harness, harness, makeTree } from "../fixtures/deps";

let h: Harness;
afterEach(() => h?.cleanup());

describe("guarded execution (disposable fixtures only)", () => {
  it("ALLOW: runs a harmless command silently and records exit code", async () => {
    h = harness();
    const r = await guardedRun({ raw: "echo hello" }, h.deps);
    expect(r).toMatchObject({ decision: "ALLOW", executed: true, exitCode: 0, blocked: false, cancelled: false });
    expect(h.output()).toBe("hello\n"); // no guard panel for harmless commands
  });

  it("propagates the child's exit code", async () => {
    h = harness();
    expect((await guardedRun({ argv: ["node", "-e", "process.exit(7)"] }, h.deps)).exitCode).toBe(7);
  });

  it("WARN: shows the warning panel and still runs", async () => {
    h = harness();
    makeTree(h.work, ["a.txt"]);
    const r = await guardedRun({ argv: ["rm", "a.txt"] }, h.deps);
    expect(r.decision).toBe("WARN");
    expect(r.executed).toBe(true);
    expect(fs.existsSync(path.join(h.work, "a.txt"))).toBe(false);
    expect(h.output()).toContain("FS_DELETE_FILES");
  });

  it("CONFIRM + 'n': nothing is deleted and exit code is 130", async () => {
    h = harness({ answers: ["n"] });
    makeTree(h.work, ["build/a.js", "build/b.js"]);
    const r = await guardedRun({ argv: ["rm", "-rf", "build"] }, h.deps);
    expect(r).toMatchObject({ decision: "CONFIRM", approved: false, executed: false, cancelled: true, exitCode: 130 });
    expect(fs.existsSync(path.join(h.work, "build", "a.js"))).toBe(true);
    expect(h.output()).toMatch(/Cancelled\. Nothing was executed/);
    expect(h.output()).toMatch(/rm would delete 3 item/); // preview shown before asking
  });

  it("CONFIRM + Enter (empty answer) cancels", async () => {
    h = harness({ answers: [""] });
    makeTree(h.work, ["build/a.js"]);
    expect((await guardedRun({ argv: ["rm", "-rf", "build"] }, h.deps)).cancelled).toBe(true);
    expect(fs.existsSync(path.join(h.work, "build", "a.js"))).toBe(true);
  });

  it("CONFIRM with no input at all (non-interactive) cancels", async () => {
    h = harness({ answers: [] });
    makeTree(h.work, ["build/a.js"]);
    expect((await guardedRun({ argv: ["rm", "-rf", "build"] }, h.deps)).cancelled).toBe(true);
    expect(fs.existsSync(path.join(h.work, "build", "a.js"))).toBe(true);
  });

  it("CONFIRM + 'y': deletes the disposable directory and records approval", async () => {
    h = harness({ answers: ["y"] });
    makeTree(h.work, ["build/a.js"]);
    const r = await guardedRun({ argv: ["rm", "-rf", "build"] }, h.deps);
    expect(r).toMatchObject({ decision: "CONFIRM", approved: true, executed: true, exitCode: 0 });
    expect(fs.existsSync(path.join(h.work, "build"))).toBe(false);
  });

  it("'e' shows more explanation and then re-asks", async () => {
    h = harness({ answers: ["e", "n"] });
    makeTree(h.work, ["build/a.js"]);
    const r = await guardedRun({ argv: ["rm", "-rf", "build"] }, h.deps);
    expect(r.cancelled).toBe(true);
    expect(h.output().match(/Continue\?/g)).toHaveLength(2);
    expect(h.output().match(/Explanation/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it("BLOCK: never prompts, never executes, exit 126", async () => {
    h = harness({ answers: ["y", "y"], protectedRel: ["work/keep"] });
    makeTree(h.work, ["keep/precious.txt"]);
    const r = await guardedRun({ argv: ["rm", "-rf", "keep"] }, h.deps);
    expect(r).toMatchObject({ decision: "BLOCK", blocked: true, executed: false, exitCode: 126 });
    expect(fs.existsSync(path.join(h.work, "keep", "precious.txt"))).toBe(true);
    expect(h.output()).not.toContain("Continue?");
    expect(h.output()).toMatch(/cannot be overridden/);
  });

  it("--yes is ignored unless allowYesFlag is enabled", async () => {
    h = harness({ answers: ["n"] });
    makeTree(h.work, ["build/a.js"]);
    const r = await guardedRun({ argv: ["rm", "-rf", "build"] }, h.deps, { assumeYes: true });
    expect(r.cancelled).toBe(true);
    expect(h.output()).toMatch(/--yes was ignored/);
    h.cleanup();

    h = harness({ config: cfg({ security: { allowYesFlag: true } }) });
    makeTree(h.work, ["build/a.js"]);
    const ok = await guardedRun({ argv: ["rm", "-rf", "build"] }, h.deps, { assumeYes: true });
    expect(ok.executed).toBe(true);
  });

  it("--yes can never approve a BLOCK", async () => {
    h = harness({ config: cfg({ security: { allowYesFlag: true } }), protectedRel: ["work/keep"] });
    makeTree(h.work, ["keep/x"]);
    const r = await guardedRun({ argv: ["rm", "-rf", "keep"] }, h.deps, { assumeYes: true });
    expect(r.blocked).toBe(true);
    expect(fs.existsSync(path.join(h.work, "keep", "x"))).toBe(true);
  });

  it("dry run does everything except execute", async () => {
    h = harness({ answers: ["y"] });
    makeTree(h.work, ["build/a.js"]);
    const r = await guardedRun({ argv: ["rm", "-rf", "build"] }, h.deps, { dryRun: true });
    expect(r).toMatchObject({ executed: false, approved: true, exitCode: 0 });
    expect(fs.existsSync(path.join(h.work, "build", "a.js"))).toBe(true);
  });

  it("shell-syntax commands are analysed as a whole: a destructive tail is caught", async () => {
    h = harness({ answers: ["n"] });
    makeTree(h.work, ["build/a.js"]);
    const r = await guardedRun({ raw: "echo done && rm -rf build" }, h.deps);
    expect(r.decision).toBe("CONFIRM");
    expect(r.cancelled).toBe(true);
    expect(fs.existsSync(path.join(h.work, "build", "a.js"))).toBe(true);
  });

  it("argv mode cannot smuggle a second command", async () => {
    h = harness();
    makeTree(h.work, ["keep.txt"]);
    await guardedRun({ argv: ["echo", "hi", ";", "rm", "keep.txt"] }, h.deps);
    expect(fs.existsSync(path.join(h.work, "keep.txt"))).toBe(true);
  });

  it("empty input is rejected without running anything", async () => {
    h = harness();
    expect((await guardedRun({ raw: "   " }, h.deps)).executed).toBe(false);
  });

  it("command not found reports 127", async () => {
    h = harness({ config: cfg({ security: { defaultUnknownCommandPolicy: "ALLOW" } }) });
    const r = await guardedRun({ argv: ["definitely-not-a-command-xyz"] }, h.deps);
    expect(r.exitCode).toBe(127);
  });
});

describe("audit trail", () => {
  it("records decisions without raw commands and without secrets", async () => {
    h = harness({ answers: ["n"] });
    makeTree(h.work, ["build/a.js"]);
    await guardedRun({ argv: ["rm", "-rf", "build"] }, h.deps);
    await guardedRun({ argv: ["echo", "--password=hunter2"] }, h.deps);
    const text = fs.readFileSync(h.logger.path, "utf8");
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("build");
    const recs = h.logger.read(0);
    expect(recs).toHaveLength(2);
    expect(recs[0]).toMatchObject({ decision: "CONFIRM", confirmationRequested: true, approved: false, executed: false, ruleIds: ["FS_RECURSIVE_DELETE"], source: "run" });
    expect(recs[1]).toMatchObject({ decision: "ALLOW", executed: true, exitCode: 0 });
  });

  it("records blocks", async () => {
    h = harness({ protectedRel: ["work/keep"] });
    await guardedRun({ argv: ["rm", "-rf", "keep"] }, h.deps);
    expect(h.logger.read(1)[0]).toMatchObject({ decision: "BLOCK", executed: false, approved: false });
  });
});
