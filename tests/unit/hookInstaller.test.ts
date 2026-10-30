import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BEGIN_MARK, END_MARK, hasHook, hookBlock, installHook, integrationScript, removeHookBlock, uninstallHook } from "../../src/shell/hookInstaller";
import { detectShell } from "../../src/shell/shellDetector";
import { analyzeCommand } from "../../src/analyzer/commandAnalyzer";
import { colorEnabled, paint, renderAnalysis, renderCompact, riskBadge, safeText } from "../../src/ui/terminalFormatter";
import { explainDeterministic } from "../../src/ai/fallbackExplainer";
import { judge } from "../fixtures/helpers";

describe("hookInstaller", () => {
  let dir: string;
  let rc: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "guard-hook-"));
    rc = path.join(dir, ".bashrc");
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("ships integration scripts that exist", () => {
    expect(fs.existsSync(integrationScript("bash"))).toBe(true);
    expect(fs.existsSync(integrationScript("zsh"))).toBe(true);
  });

  it("installs a marked block, keeps existing content, and makes a backup", () => {
    fs.writeFileSync(rc, "export FOO=1\nalias ll='ls -l'\n");
    const r = installHook("bash", rc, "/usr/bin/node", "/x/dist/cli.js");
    expect(r.changed).toBe(true);
    const text = fs.readFileSync(rc, "utf8");
    expect(text.startsWith("export FOO=1\nalias ll='ls -l'\n")).toBe(true);
    expect(text).toContain(BEGIN_MARK);
    expect(text).toContain("export GUARD_CLI='/x/dist/cli.js'");
    expect(fs.readFileSync(rc + ".guard-backup", "utf8")).toBe("export FOO=1\nalias ll='ls -l'\n");
  });

  it("is idempotent", () => {
    installHook("bash", rc, "node", "/x/cli.js");
    const once = fs.readFileSync(rc, "utf8");
    expect(installHook("bash", rc, "node", "/x/cli.js").changed).toBe(false);
    expect(fs.readFileSync(rc, "utf8")).toBe(once);
  });

  it("uninstall restores the original file content exactly", () => {
    const original = "export FOO=1\n# my config\n";
    fs.writeFileSync(rc, original);
    installHook("bash", rc, "node", "/x/cli.js");
    expect(uninstallHook(rc).changed).toBe(true);
    expect(fs.readFileSync(rc, "utf8")).toBe(original);
    expect(uninstallHook(rc).changed).toBe(false);
  });

  it("works on a file that does not exist yet and on one without a trailing newline", () => {
    expect(installHook("zsh", path.join(dir, ".zshrc"), "node", "/x/cli.js").changed).toBe(true);
    fs.writeFileSync(rc, "no-newline");
    installHook("bash", rc, "node", "/x/cli.js");
    expect(fs.readFileSync(rc, "utf8").startsWith("no-newline\n" + BEGIN_MARK)).toBe(true);
  });

  it("quotes paths with spaces and apostrophes safely", () => {
    const block = hookBlock("bash", "/path with space/node", "/it's/cli.js");
    expect(block).toContain("export GUARD_NODE='/path with space/node'");
    expect(block).toContain("export GUARD_CLI='/it'\\''s/cli.js'");
  });

  it("hasHook / removeHookBlock ignore files without a complete block", () => {
    expect(hasHook("nothing")).toBe(false);
    expect(hasHook(BEGIN_MARK)).toBe(false);
    expect(removeHookBlock(BEGIN_MARK + "\nx")).toBe(BEGIN_MARK + "\nx");
    expect(hasHook(`${BEGIN_MARK}\n${END_MARK}\n`)).toBe(true);
  });

  it("detectShell recognises bash and zsh only", () => {
    expect(detectShell({ SHELL: "/bin/bash" })).toBe("bash");
    expect(detectShell({ SHELL: "/usr/bin/zsh" })).toBe("zsh");
    expect(detectShell({ SHELL: "/usr/bin/fish" })).toBeNull();
    expect(detectShell({})).toBeNull();
  });
});

describe("terminalFormatter", () => {
  const plain = { color: false };
  const colored = { color: true };

  it("safeText removes terminal control sequences (no escape injection)", () => {
    expect(safeText("a\u001b[2Jb\u001b]0;title\u0007c")).not.toMatch(/\u001b/);
    expect(safeText("x\u0000y\r")).toBe("x?y?");
  });

  it("paint only adds colour when enabled", () => {
    expect(paint(plain, "red", "x")).toBe("x");
    expect(paint(colored, "red", "x")).toBe("\u001b[31mx\u001b[0m");
  });

  it("colorEnabled follows NO_COLOR, FORCE_COLOR and TTY", () => {
    expect(colorEnabled({ isTTY: true }, { NO_COLOR: "1" })).toBe(false);
    expect(colorEnabled({ isTTY: false }, { FORCE_COLOR: "1" })).toBe(true);
    expect(colorEnabled({ isTTY: true }, {})).toBe(true);
    expect(colorEnabled({ isTTY: false }, {})).toBe(false);
  });

  it("riskBadge shows the level", () => {
    expect(riskBadge(plain, "HIGH")).toContain("HIGH RISK");
  });

  it("renders the command, findings and decision", () => {
    const j = judge("sudo chmod -R 777 /var/www");
    const text = renderAnalysis(plain, j.analysis.raw, j.policy, explainDeterministic(j.analysis, j.findings));
    expect(text).toContain("COMMAND GUARD");
    expect(text).toContain("HIGH RISK");
    expect(text).toContain("sudo chmod -R 777 /var/www");
    expect(text).toContain("PERM_WORLD_WRITABLE");
    expect(text).toContain("CONFIRM - explicit approval required");
    expect(text).not.toMatch(/\u001b/);
  });

  it("renders BLOCK clearly and escapes hostile command text", () => {
    const j = judge("rm -rf / \u001b[2J");
    const text = renderAnalysis(plain, "rm -rf / \u001b[2J", j.policy);
    expect(text).toContain("BLOCK");
    expect(text).not.toMatch(/\u001b/);
  });

  it("compact form is short and lists the main findings", () => {
    const j = judge("rm -rf /");
    const text = renderCompact(plain, j.analysis.raw, j.policy);
    expect(text).toContain("[guard]");
    expect(text).toContain("FS_ROOT_DELETE");
    expect(text).toContain("Blocked by policy.");
    expect(text.split("\n").length).toBeLessThan(8);
  });

  it("mentions the unknown-command policy when it drove the decision", () => {
    const j = judge("frobnicate");
    expect(renderAnalysis(plain, "frobnicate", j.policy)).toMatch(/could not be fully verified/);
    expect(analyzeCommand("frobnicate").unrecognized).toEqual(["frobnicate"]);
  });
});
