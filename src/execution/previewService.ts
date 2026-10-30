import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { findStartPoints } from "../rules/filesystem.rules";
import { gitSubcommand } from "../rules/git.rules";
import { parseArgs } from "../rules/ruleHelpers";
import type { Analysis } from "../types";
import { resolveTarget } from "../utils/paths";

export interface Preview {
  title: string;
  lines: string[];
  truncated: boolean;
  note: string;
}

const LIMIT = 20;
const STALE_NOTE = "Preview only: the files may change before the command runs, and it may not cover everything.";

function nativePath(value: string): string {
  const winDrive = value.match(/^\/([A-Za-z]:\/.*)$/);
  if (process.platform !== "win32" || !winDrive) return path.normalize(value);
  const drive = winDrive[1].slice(0, 2);
  return path.win32.join(drive + "\\", ...winDrive[1].slice(3).split("/").filter(Boolean));
}

function displayPath(value: string): string {
  if (process.platform === "win32") return value.replace(/\\/g, "/");
  return value;
}

function walk(root: string, out: string[], limit: number, displayRoot?: string): boolean {
  let st: fs.Stats;
  try {
    st = fs.lstatSync(root);
  } catch {
    return false;
  }
  if (out.length >= limit) return true;
  out.push(displayRoot ?? root);
  if (st.isDirectory() && !st.isSymbolicLink()) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(root);
    } catch {
      return false;
    }
    for (const n of names) {
      if (walk(path.join(root, n), out, limit, displayRoot ? `${displayRoot}/${n}` : undefined)) return true;
    }
  }
  return out.length >= limit;
}

function walkForDisplay(root: string, label: string, out: string[], limit: number): boolean {
  let st: fs.Stats;
  try {
    st = fs.lstatSync(root);
  } catch {
    return false;
  }
  if (out.length >= limit) return true;
  out.push(label);
  if (st.isDirectory() && !st.isSymbolicLink()) {
    let names: string[];
    try {
      names = fs.readdirSync(root);
    } catch {
      return false;
    }
    for (const name of names) {
      if (walkForDisplay(path.join(root, name), `${label}/${name}`, out, limit)) return true;
    }
  }
  return out.length >= limit;
}

function findMatches(root: string, pattern: string, out: string[], limit: number): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  const escaped = pattern.replace(/[.+^${}()|[\\]\\\\]/g, "\\\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  const re = new RegExp(`^${escaped}$`);
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (re.test(entry.name)) out.push(target);
    if (out.length >= limit) return;
    if (entry.isDirectory() && !entry.isSymbolicLink()) findMatches(target, pattern, out, limit);
    if (out.length >= limit) return;
  }
}

function run(file: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(file, args, { cwd, timeout: 5000, maxBuffer: 1024 * 1024 }, (err, stdout) => resolve(err && !stdout ? "" : stdout.toString()));
  });
}

/**
 * Build a read-only preview for commands where one is reliable: rm, find ... -delete, git clean.
 * Nothing is modified; commands run without a shell.
 */
export async function buildPreview(analysis: Analysis, cwd: string, home: string): Promise<Preview | null> {
  if (analysis.segments.length !== 1 || analysis.needsShell) return null;
  const seg = analysis.segments[0];
  const cmd = seg.executable;
  if (cmd === "rm") {
    const p = parseArgs(seg.args);
    const found: string[] = [];
    let truncated = false;
    for (const token of p.positionals) {
      if (token.hasExpansion || token.hasGlob) return null;
      const root = nativePath(resolveTarget(token.value, cwd, home));
      const targetItems: string[] = [];
      if (walk(root, targetItems, LIMIT + 1, token.value.replace(/\\/g, "/").replace(/\/$/, ""))) truncated = true;
      found.push(...targetItems);
    }
    if (found.length === 0) return { title: "Nothing exists at the given path(s)", lines: [], truncated: false, note: STALE_NOTE };
    return { title: `rm would delete ${truncated ? `at least ${LIMIT}` : found.length} item(s)`, lines: found.slice(0, LIMIT), truncated, note: STALE_NOTE };
  }
  if (cmd === "find" && seg.args.some((t) => t.value === "-delete")) {
    const args = seg.args.map((token) => token.value);
    const starts = findStartPoints(seg.args).map((t) => t.value);
    if (starts.some((s) => /[$`]/.test(s))) return null;
    const patternToken = seg.args.findIndex((token, i, all) => token.value === "-name" && Boolean(all[i + 1]));
    const pattern = patternToken >= 0 ? args[patternToken + 1].replace(/^['"]|['"]$/g, "") : "*";
    if (!pattern) return null;
    const found: string[] = [];
    const nativeRoot = (value: string): string => {
      if (process.platform !== "win32") return value;
      const match = value.match(/^\/([A-Za-z]):\/(.*)$/);
      return match ? `${match[1]}:\\${match[2].replace(/\//g, "\\")}` : value.replace(/\//g, "\\");
    };
    for (const start of starts) findMatches(nativeRoot(resolveTarget(start, cwd, home)), pattern, found, LIMIT + 1);
    return { title: `find would delete ${found.length} match(es)`, lines: found.slice(0, LIMIT).map((item) => item.replace(/\\/g, "/")), truncated: found.length > LIMIT, note: STALE_NOTE };
  }
  if (cmd === "git") {
    const { sub, rest } = gitSubcommand(seg.args);
    if (sub === "clean") {
      const filtered = rest.map((t) => t.value).filter((v) => !/^-[a-zA-Z]*f[a-zA-Z]*$/.test(v) && v !== "--force");
      const flags = rest.map((t) => t.value).filter((v) => /^-[a-zA-Z]+$/.test(v)).join("").replace(/[-f]/g, "");
      const args = ["clean", "-n" + flags, ...filtered.filter((v) => !v.startsWith("-"))];
      const out = await run("git", args, cwd);
      const lines = out.split("\n").filter(Boolean);
      return { title: `git clean would remove ${lines.length} item(s)`, lines: lines.slice(0, LIMIT), truncated: lines.length > LIMIT, note: STALE_NOTE };
    }
  }
  return null;
}
