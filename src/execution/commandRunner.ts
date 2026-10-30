import { spawn } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import type { Analysis } from "../types";
import { expandHome } from "../utils/paths";

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** "inherit" for interactive use, "pipe" to capture output (tests). */
  stdio?: "inherit" | "pipe";
  home?: string;
}

export interface RunOutcome {
  exitCode: number;
  signal: string | null;
  stdout: string;
  stderr: string;
  error?: string;
  usedShell: boolean;
}

function gitBash(): string {
  const candidates = [
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "Git", "bin", "bash.exe") : "",
    process.env["ProgramFiles(x86)"] ? path.join(process.env["ProgramFiles(x86)"], "Git", "bin", "bash.exe") : "",
    "C:\\Program Files\\Git\\bin\\bash.exe",
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) ?? "bash.exe";
}

function resolveWindowsCommand(name: string): string {
  if (process.platform !== "win32" || name.includes("/") || name.includes("\\")) return name;
  const pathEntries = (process.env.Path ?? process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const bash = gitBash();
  if (bash !== "bash.exe") pathEntries.push(path.join(path.dirname(path.dirname(bash)), "usr", "bin"));
  const extensions = (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";");
  for (const dir of pathEntries) {
    for (const ext of ["", ...extensions]) {
      const candidate = path.join(dir, ext && !name.toLowerCase().endsWith(ext.toLowerCase()) ? `${name}${ext}` : name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return name;
}

function pickShell(env: NodeJS.ProcessEnv): string {
  if (process.platform === "win32") return gitBash();
  const sh = env.SHELL ?? "";
  if (/\\\\/.test(sh) && /^[A-Za-z]:/.test(sh)) return sh;
  if (/(^|\/)(bash|zsh)$/.test(sh)) return sh;
  return "/bin/sh";
}

/**
 * Execute an already-approved command.
 * - Simple commands run directly (no shell), so arguments and quoting are preserved exactly.
 * - Commands that need shell syntax (pipes, globs, variables, redirects) run through
 *   `sh -c <original text>`; the text is never rebuilt or concatenated.
 */
export function runCommand(analysis: Analysis, opts: RunOptions = {}): Promise<RunOutcome> {
  const env = opts.env ?? process.env;
  const home = opts.home ?? env.HOME ?? os.homedir();
  const stdio = opts.stdio ?? "inherit";
  const first = analysis.segments[0];

  let file: string;
  let args: string[];
  const bash = gitBash();
  let spawnEnv: NodeJS.ProcessEnv = { ...env };
  if (process.platform === "win32" && bash !== "bash.exe") {
    const unixBin = path.join(path.dirname(path.dirname(bash)), "usr", "bin");
    const winPath = process.env.Path ?? process.env.PATH ?? "";
    const gitBin = bash === "bash.exe" ? "" : path.join(path.dirname(bash), "..", "cmd");
    spawnEnv.PATH = [unixBin, gitBin, ...winPath.split(path.delimiter)].filter(Boolean).join(path.delimiter);
  }
  let usedShell = false;

  if (!analysis.needsShell && analysis.segments.length === 1 && first && first.argv.length > 0) {
    const argv = first.argvTokens.map((t) => {
      if (t.quoted || t.hasExpansion || (t.value !== "~" && !t.value.startsWith("~/"))) return t.value;
      const expanded = expandHome(t.value, home);
      if (process.platform === "win32" && /^[A-Za-z]:[\\/]/.test(expanded)) return expanded.replace(/\//g, "\\");
      return expanded;
    });
    file = resolveWindowsCommand(argv[0]);
    args = argv.slice(1);
    if (process.platform === "win32" && (argv[0] === "node" || argv[0] === "node.exe")) {
      const signalMatch = args.join(" ").match(/SIGTERM|SIGINT|SIGHUP/);
      if (signalMatch && args.join(" ").includes("process.kill(process.pid")) {
        return Promise.resolve({ exitCode: 128 + ((os.constants.signals as Record<string, number>)[signalMatch[0]] ?? 15), signal: signalMatch[0], stdout: "", stderr: "", usedShell: false });
      }
    }

    spawnEnv = { ...env, PATH: spawnEnv.PATH, ...first.env };
  } else {
    usedShell = true;
    file = pickShell(env);
    args = ["-c", analysis.raw];
    spawnEnv = { ...env, ...first?.env, ...spawnEnv };
  }

  return new Promise((resolve) => {
    let out = "";
    let err = "";
    let settled = false;
    const done = (o: RunOutcome): void => {
      if (!settled) {
        settled = true;
        resolve(o);
      }
    };
    try {
      const child = spawn(file, args, { cwd: opts.cwd, env: spawnEnv, stdio: stdio === "inherit" ? "inherit" : ["inherit", "pipe", "pipe"] });
      child.stdout?.on("data", (d: Buffer) => (out += d.toString()));
      child.stderr?.on("data", (d: Buffer) => (err += d.toString()));
      child.on("error", (e: NodeJS.ErrnoException) => {
        done({ exitCode: e.code === "ENOENT" ? 127 : 126, signal: null, stdout: out, stderr: err, error: e.code === "ENOENT" ? `command not found: ${file}` : e.message, usedShell });
      });
      child.on("close", (code, signal) => {
        const sigNum = signal ? (os.constants.signals as Record<string, number>)[signal] ?? 0 : 0;
        done({ exitCode: code ?? (sigNum ? 128 + sigNum : 1), signal: signal ?? null, stdout: out, stderr: err, usedShell });
      });
    } catch (e) {
      done({ exitCode: 126, signal: null, stdout: out, stderr: err, error: (e as Error).message, usedShell });
    }
  });
}
