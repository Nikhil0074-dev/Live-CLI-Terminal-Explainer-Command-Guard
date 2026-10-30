import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "../../src/cli";
import type { CliIO } from "../../src/commands/runtime";
import { createLineReader } from "../../src/execution/confirmation";

let dir: string;
let work: string;
let ghome: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "guard-cli-"));
  work = path.join(dir, "work");
  ghome = path.join(dir, "ghome");
  fs.mkdirSync(work);
  fs.mkdirSync(ghome);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function writeConfig(obj: unknown) {
  fs.writeFileSync(path.join(ghome, "config.json"), JSON.stringify(obj));
}

function cli(args: string[], opts: { stdin?: string[]; env?: NodeJS.ProcessEnv; tty?: string[] | null } = {}) {
  const stdin = new PassThrough();
  for (const l of opts.stdin ?? []) stdin.write(l + "\n");
  stdin.end();
  let stdout = "";
  let stderr = "";
  const io: CliIO = {
    env: { PATH: process.env.PATH, HOME: dir, GUARD_HOME: ghome, NO_COLOR: "1", ...(opts.env ?? {}) },
    cwd: work,
    stdin,
    stdout: (s) => void (stdout += s),
    stderr: (s) => void (stderr += s),
    capture: true,
    openTty:
      opts.tty === undefined
        ? () => null
        : opts.tty === null
          ? () => null
          : () => {
              const t = new PassThrough();
              for (const l of opts.tty as string[]) t.write(l + "\n");
              t.end();
              const reader = createLineReader(t);
              return { reader, write: (s: string) => void (stderr += s), close: () => reader.close() };
            },
  };
  return main(args, io).then((code) => ({ code, stdout, stderr }));
}

describe("guard explain", () => {
  it("explains a command without running it", async () => {
    fs.writeFileSync(path.join(work, "x.log"), "");
    const r = await cli(["explain", "find . -type f -name '*.log' -delete"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Delete every match");
    expect(r.stdout).toContain("-type f");
    expect(fs.existsSync(path.join(work, "x.log"))).toBe(true);
  });

  it("says when no AI model is configured and still explains", async () => {
    const r = await cli(["explain", "ls -la"]);
    expect(r.stdout).toMatch(/No AI model is configured/);
    expect(r.stdout).toMatch(/List directory contents/);
  });

  it("--json is machine readable", async () => {
    const r = await cli(["explain", "--json", "git push --force origin main"]);
    const j = JSON.parse(r.stdout);
    expect(j.explanation.source).toBe("fallback");
    expect(j.risk).toBe("HIGH");
  });

  it("accepts the command as separate words (argv mode) without flag parsing errors", async () => {
    const r = await cli(["explain", "rm", "-rf", "./build"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("rm -rf ./build");
  });
});

describe("guard check", () => {
  it("exit codes: 0 allow/warn, 2 confirm, 3 block", async () => {
    expect((await cli(["check", "ls"])).code).toBe(0);
    expect((await cli(["check", "rm", "file.txt"])).code).toBe(0);
    expect((await cli(["check", "rm -rf build"])).code).toBe(2);
    expect((await cli(["check", "rm -rf /"])).code).toBe(3);
  });

  it("prints the proposal's example for sudo chmod -R 777 /var/www", async () => {
    const r = await cli(["check", "sudo chmod -R 777 /var/www"]);
    expect(r.stdout).toContain("HIGH RISK");
    expect(r.stdout).toContain("sudo: Run the command with administrator");
    expect(r.stdout).toContain("PERM_WORLD_WRITABLE");
    expect(r.stdout).toContain("CONFIRM - explicit approval required");
  });

  it("--json includes findings and the score", async () => {
    const j = JSON.parse((await cli(["check", "--json", "rm -rf /"])).stdout);
    expect(j).toMatchObject({ risk: "CRITICAL", decision: "BLOCK" });
    expect(j.findings.map((f: { ruleId: string }) => f.ruleId)).toContain("FS_ROOT_DELETE");
    expect(j.score).toBe(100);
  });

  it("--preview lists what would be deleted, without deleting", async () => {
    fs.mkdirSync(path.join(work, "build"));
    fs.writeFileSync(path.join(work, "build", "a.js"), "");
    const r = await cli(["check", "--preview", "rm -rf build"]);
    expect(r.stdout).toMatch(/rm would delete 2 item/);
    expect(fs.existsSync(path.join(work, "build", "a.js"))).toBe(true);
  });
});

describe("guard run (confirmation over stdin)", () => {
  it("'y' approves and deletes the disposable directory", async () => {
    fs.mkdirSync(path.join(work, "build"));
    const r = await cli(["run", "--", "rm", "-rf", "build"], { stdin: ["y"] });
    expect(r.code).toBe(0);
    expect(fs.existsSync(path.join(work, "build"))).toBe(false);
  });

  it("'n' and empty input cancel with exit 130", async () => {
    fs.mkdirSync(path.join(work, "build"));
    expect((await cli(["run", "--", "rm", "-rf", "build"], { stdin: ["n"] })).code).toBe(130);
    expect((await cli(["run", "--", "rm", "-rf", "build"], { stdin: [] })).code).toBe(130);
    expect(fs.existsSync(path.join(work, "build"))).toBe(true);
  });

  it("blocked commands exit 126 and never read stdin", async () => {
    const r = await cli(["run", "--", "rm", "-rf", "/"], { stdin: ["y"] });
    expect(r.code).toBe(126);
    expect(r.stdout).toMatch(/Blocked: FS_ROOT_DELETE/);
  });

  it("flags after -- belong to the command, not to guard", async () => {
    const r = await cli(["run", "--", "node", "-e", "console.log('x', process.argv.length)"]);
    expect(r.stdout).toContain("x 1");
    expect(r.code).toBe(0);
  });

  it("--dry-run does not execute", async () => {
    fs.mkdirSync(path.join(work, "build"));
    const r = await cli(["run", "--dry-run", "--", "rm", "-rf", "build"], { stdin: ["y"] });
    expect(r.code).toBe(0);
    expect(fs.existsSync(path.join(work, "build"))).toBe(true);
  });

  it("a protected directory from the config file is enforced", async () => {
    writeConfig({ version: 1, environment: { protectedDirectories: [path.join(work, "keep")] } });
    fs.mkdirSync(path.join(work, "keep"));
    const r = await cli(["run", "--", "rm", "-rf", "keep"], { stdin: ["y"] });
    expect(r.code).toBe(126);
    expect(fs.existsSync(path.join(work, "keep"))).toBe(true);
  });

  it("an invalid config makes the guard refuse to run (fail closed)", async () => {
    writeConfig({ security: { defaultUnknownCommandPolicy: "NOPE" } });
    fs.writeFileSync(path.join(work, "f"), "");
    const r = await cli(["run", "--", "rm", "f"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/refuses to run with an invalid configuration/);
    expect(fs.existsSync(path.join(work, "f"))).toBe(true);
  });
});

describe("guard hook-check (used by the shell integrations)", () => {
  it("allows harmless lines silently", async () => {
    const r = await cli(["hook-check", "--", "echo hi"]);
    expect(r).toMatchObject({ code: 0, stderr: "" });
  });

  it("blocks with exit 3 (never 1, which means a crashed guard)", async () => {
    const r = await cli(["hook-check", "--", "rm -rf /"]);
    expect(r.code).toBe(3);
    expect(r.stderr).toMatch(/Blocked by policy/);
  });

  it("CONFIRM: asks on the terminal; 'y' -> 0, 'n' -> 3, no terminal -> 3", async () => {
    expect((await cli(["hook-check", "--", "rm -rf build"], { tty: ["y"] })).code).toBe(0);
    expect((await cli(["hook-check", "--", "rm -rf build"], { tty: ["n"] })).code).toBe(3);
    const none = await cli(["hook-check", "--", "rm -rf build"], { tty: null });
    expect(none.code).toBe(3);
    expect(none.stderr).toMatch(/No terminal available/);
  });

  it("WARN prints a warning but allows", async () => {
    const r = await cli(["hook-check", "--", "rm file.txt"]);
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/FS_DELETE_FILES/);
  });

  it("returns 2 (guard failure) on an invalid config so the shell can fail closed", async () => {
    writeConfig({ nope: true });
    expect((await cli(["hook-check", "--", "ls"])).code).toBe(2);
  });
});

describe("guard history / config / doctor / hooks", () => {
  it("history shows decisions without commands, and --prune works", async () => {
    await cli(["check", "rm -rf build"]);
    await cli(["run", "--", "echo", "hi"]);
    const h = await cli(["history"]);
    expect(h.stdout).toMatch(/CONFIRM/);
    expect(h.stdout).toMatch(/FS_RECURSIVE_DELETE/);
    expect(h.stdout).not.toContain("build");
    expect(JSON.parse((await cli(["history", "--json", "-n", "1"])).stdout)).toHaveLength(1);
    expect((await cli(["history", "--prune"])).stdout).toMatch(/Removed 0 record/);
  });

  it("config path / init / show", async () => {
    expect((await cli(["config", "path"])).stdout.trim()).toBe(path.join(ghome, "config.json"));
    expect((await cli(["config", "init"])).stdout).toMatch(/Created/);
    expect((await cli(["config", "init"])).code).toBe(1);
    const shown = await cli(["config", "show"]);
    expect(shown.stdout).toContain('"blockCriticalOperations": true');
  });

  it("doctor passes the required checks with Ollama offline (optional)", async () => {
    writeConfig({ version: 1, ai: { baseUrl: "http://127.0.0.1:9", model: "m", timeoutMs: 300 } });
    const r = await cli(["doctor"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/\[ OK \] Rule engine self-test \(rm -rf \/ is blocked\)/);
    expect(r.stdout).toMatch(/\[ -- \] Ollama reachable \(optional\)/);
    expect(r.stdout).toMatch(/All required security components are working/);
  });

  it("doctor fails on an invalid configuration", async () => {
    writeConfig({ bogus: 1 });
    const r = await cli(["doctor"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/\[FAIL\] Configuration/);
  });

  it("install-hook / uninstall-hook edit only the chosen rc file", async () => {
    const rc = path.join(dir, "my.bashrc");
    fs.writeFileSync(rc, "echo mine\n");
    expect((await cli(["install-hook", "bash", "--rc-file", rc])).stdout).toMatch(/Installed bash hook/);
    expect(fs.readFileSync(rc, "utf8")).toContain("live-cli-guard");
    expect((await cli(["uninstall-hook", "bash", "--rc-file", rc])).stdout).toMatch(/Removed the bash hook/);
    expect(fs.readFileSync(rc, "utf8")).toBe("echo mine\n");
    expect((await cli(["install-hook", "fish"])).code).toBe(2);
  });
});

describe("compiled binary (dist/cli.js)", () => {
  const bin = path.resolve(__dirname, "..", "..", "dist", "cli.js");
  const run = (args: string[], input?: string) =>
    spawnSync(process.execPath, [bin, ...args], { input, encoding: "utf8", cwd: work, env: { PATH: process.env.PATH, HOME: dir, GUARD_HOME: ghome, NO_COLOR: "1" } });

  it("runs, prints version and uses real exit codes", () => {
    if (!fs.existsSync(bin)) return; // `npm test` builds first
    expect(run(["--version"]).stdout.trim()).toBe("1.0.0");
    expect(run(["check", "rm -rf /"]).status).toBe(3);
    expect(run(["check", "ls"]).status).toBe(0);
  });

  it("a real child process: y deletes, n keeps, and stdout stays clean", () => {
    if (!fs.existsSync(bin)) return;
    fs.mkdirSync(path.join(work, "build"));
    const no = run(["run", "--", "rm", "-rf", "build"], "n\n");
    expect(no.status).toBe(130);
    expect(fs.existsSync(path.join(work, "build"))).toBe(true);
    const yes = run(["run", "--", "rm", "-rf", "build"], "y\n");
    expect(yes.status).toBe(0);
    expect(fs.existsSync(path.join(work, "build"))).toBe(false);
    expect(yes.stdout).toBe(""); // guard UI goes to stderr
    expect(yes.stderr).toMatch(/COMMAND GUARD/);
    const echo = run(["run", "--", "echo", "hello"]);
    expect(echo.stdout).toBe("hello\n");
  });
});
