import * as path from "node:path";
import type { Analysis, RawSegment, Segment, Token } from "../types";
import { isKnownCommand, SHELL_INTERPRETERS, SUDO_ARG_OPTIONS } from "./commandCatalog";
import { joinArgv, tokenize } from "./tokenizer";

const MAX_DEPTH = 3;
const ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;

function plainToken(value: string): Token {
  return { value, quoted: true, hasExpansion: false, hasGlob: false };
}

interface Unwrapped {
  index: number;
  env: Record<string, string>;
  privileged: boolean;
  wrappers: string[];
}

function takeAssignments(tokens: Token[], idx: number, env: Record<string, string>): number {
  while (idx < tokens.length && ASSIGNMENT_RE.test(tokens[idx].value)) {
    const t = tokens[idx].value;
    const eq = t.indexOf("=");
    env[t.slice(0, eq)] = t.slice(eq + 1);
    idx++;
  }
  return idx;
}

/** Skip wrapper commands (sudo, env, nohup, ...) and return index of the real command. */
function unwrap(tokens: Token[], startIdx: number, env: Record<string, string>): Unwrapped {
  let idx = takeAssignments(tokens, startIdx, env);
  let privileged = false;
  const wrappers: string[] = [];
  for (let guard = 0; guard < 10 && idx < tokens.length; guard++) {
    const name = path.basename(tokens[idx].value);
    if (name === "sudo" || name === "doas") {
      privileged = true;
      wrappers.push(name);
      idx++;
      while (idx < tokens.length && tokens[idx].value.startsWith("-") && tokens[idx].value !== "-") {
        const opt = tokens[idx].value;
        idx++;
        if (opt === "--") break;
        if (SUDO_ARG_OPTIONS.has(opt) && idx < tokens.length) idx++;
      }
      idx = takeAssignments(tokens, idx, env);
      continue;
    }
    if (name === "env") {
      wrappers.push(name);
      idx++;
      while (idx < tokens.length) {
        const v = tokens[idx].value;
        if (ASSIGNMENT_RE.test(v)) {
          idx = takeAssignments(tokens, idx, env);
        } else if (v === "-u" || v === "-C" || v === "-S") {
          idx += 2;
        } else if (v.startsWith("-") && v !== "-") {
          idx++;
        } else break;
      }
      continue;
    }
    if (name === "nohup" || name === "command" || name === "builtin" || name === "exec" || name === "time") {
      wrappers.push(name);
      idx++;
      while (idx < tokens.length && tokens[idx].value.startsWith("-") && tokens[idx].value !== "-") idx++;
      continue;
    }
    if (name === "nice" || name === "ionice") {
      wrappers.push(name);
      idx++;
      while (idx < tokens.length && tokens[idx].value.startsWith("-")) {
        const opt = tokens[idx].value;
        idx++;
        if ((opt === "-n" || opt === "-c" || opt === "-p") && idx < tokens.length) idx++;
      }
      continue;
    }
    if (name === "timeout") {
      wrappers.push(name);
      idx++;
      while (idx < tokens.length && tokens[idx].value.startsWith("-")) {
        const opt = tokens[idx].value;
        idx++;
        if ((opt === "-s" || opt === "-k") && idx < tokens.length) idx++;
      }
      if (idx < tokens.length) idx++; // duration
      continue;
    }
    break;
  }
  return { index: idx, env, privileged, wrappers };
}

function buildSegment(raw: RawSegment): Segment {
  const inlineEnv: Record<string, string> = {};
  const startIdx = takeAssignments(raw.tokens, 0, inlineEnv);
  const un = unwrap(raw.tokens, 0, inlineEnv);
  const argvTokens = raw.tokens.slice(startIdx);
  const execTok = un.index < raw.tokens.length ? raw.tokens[un.index] : null;
  const executableText = execTok ? execTok.value : null;
  const executable = executableText ? path.basename(executableText) : null;
  const args = execTok ? raw.tokens.slice(un.index + 1) : [];
  return {
    raw: raw.raw,
    argv: argvTokens.map((t) => t.value),
    argvTokens,
    env: un.env,
    executable,
    executableText,
    executableHasExpansion: execTok ? execTok.hasExpansion : false,
    args,
    privileged: un.privileged,
    wrappers: un.wrappers,
    redirections: raw.redirections,
    operatorBefore: raw.operatorBefore,
    known: isKnownCommand(executable) || (executable ? executable.startsWith("mkfs.") : false),
  };
}

function emptyAnalysis(raw: string, mode: "string" | "argv", via: string | null): Analysis {
  return {
    raw,
    mode,
    segments: [],
    operators: [],
    nested: [],
    nestedVia: via,
    hasPipe: false,
    hasSubstitution: false,
    hasVariables: false,
    hasGlob: false,
    pipeToShell: false,
    uncertain: false,
    uncertaintyReasons: [],
    unrecognized: [],
    needsShell: false,
  };
}

function addReason(a: Analysis, reason: string): void {
  a.uncertain = true;
  if (!a.uncertaintyReasons.includes(reason)) a.uncertaintyReasons.push(reason);
}

/** Extract the script following -c in `bash -c "..."` (supports combined flags like -lc). */
function shellDashC(seg: Segment): string | null {
  if (!seg.executable || !SHELL_INTERPRETERS.has(seg.executable)) return null;
  for (let i = 0; i < seg.args.length; i++) {
    const v = seg.args[i].value;
    if (/^-[A-Za-z]*c[A-Za-z]*$/.test(v)) {
      const next = seg.args[i + 1];
      return next ? next.value : "";
    }
  }
  return null;
}

/** Parse `find ... -exec CMD ARGS ;|+` and return the embedded commands as argv arrays. */
function findExecCommands(seg: Segment): string[][] {
  const out: string[][] = [];
  const a = seg.args.map((t) => t.value);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "-exec" || a[i] === "-execdir" || a[i] === "-ok" || a[i] === "-okdir") {
      const cmd: string[] = [];
      let j = i + 1;
      while (j < a.length && a[j] !== ";" && a[j] !== "\\;" && a[j] !== "+") {
        cmd.push(a[j]);
        j++;
      }
      if (cmd.length) out.push(cmd);
      i = j;
    }
  }
  return out;
}

/** Parse `xargs [opts] CMD ARGS` and return CMD ARGS. */
function xargsCommand(seg: Segment): string[] | null {
  if (seg.executable !== "xargs") return null;
  const a = seg.args.map((t) => t.value);
  const withArg = new Set(["-I", "-n", "-P", "-d", "-L", "-s", "-E", "-a", "-i", "-l"]);
  let i = 0;
  while (i < a.length && a[i].startsWith("-")) {
    const opt = a[i];
    i++;
    if (opt === "--") break;
    if (withArg.has(opt) && i < a.length) i++;
  }
  const rest = a.slice(i);
  return rest.length ? rest : null;
}

function analyzeInternal(raw: string, depth: number, via: string | null): Analysis {
  const a = emptyAnalysis(raw, "string", via);
  const tk = tokenize(raw);
  a.operators = tk.operators;
  a.hasPipe = tk.operators.some((o) => o === "|" || o === "|&");
  a.hasSubstitution = tk.hasSubstitution;
  a.hasVariables = tk.hasVariables;
  for (const e of tk.errors) addReason(a, `Syntax could not be fully parsed: ${e}`);
  if (tk.hasHeredoc) addReason(a, "Here-document (<<) content is not analysed");
  if (tk.hasGrouping) addReason(a, "Subshell/grouping or function syntax is not fully analysed");
  if (tk.hasSubstitution) addReason(a, "Command substitution or process substitution runs hidden commands");
  if (/:\s*\(\s*\)\s*\{/.test(raw)) addReason(a, "Function definition detected");

  a.segments = tk.segments.map(buildSegment);
  finishSegments(a, depth);

  for (const sub of tk.substitutions) {
    if (depth >= MAX_DEPTH) {
      addReason(a, "Nesting too deep to analyse");
      continue;
    }
    if (sub.trim()) a.nested.push(analyzeInternal(sub, depth + 1, "$(...)"));
  }
  return a;
}

function finishSegments(a: Analysis, depth: number): void {
  for (let idx = 0; idx < a.segments.length; idx++) {
    const seg = a.segments[idx];
    if (seg.executableHasExpansion) addReason(a, "The command name itself comes from a variable or substitution");
    if (seg.argvTokens.some((t) => t.hasExpansion)) a.hasVariables = true;
    if (seg.argvTokens.some((t) => t.hasGlob)) a.hasGlob = true;
    if (seg.executable && !seg.known && !a.unrecognized.includes(seg.executable)) a.unrecognized.push(seg.executable);
    if (!seg.executable && seg.argv.length === 0 && Object.keys(seg.env).length === 0 && seg.redirections.length === 0) {
      continue;
    }

    // Nested shells / eval / find -exec / xargs
    const script = shellDashC(seg);
    if (script !== null) {
      if (depth >= MAX_DEPTH) addReason(a, "Nesting too deep to analyse");
      else a.nested.push(analyzeInternal(script, depth + 1, `${seg.executable} -c`));
    } else if (seg.executable && SHELL_INTERPRETERS.has(seg.executable) && seg.args.length > 0) {
      addReason(a, `Running a script file through ${seg.executable} - its contents are not analysed`);
    }
    if (seg.executable === "eval") {
      addReason(a, "eval builds and runs a command dynamically");
      const joined = seg.args.map((t) => t.value).join(" ");
      if (joined && depth < MAX_DEPTH) a.nested.push(analyzeInternal(joined, depth + 1, "eval"));
    }
    if (seg.executable === "find") {
      for (const cmd of findExecCommands(seg)) {
        if (depth >= MAX_DEPTH) {
          addReason(a, "Nesting too deep to analyse");
          continue;
        }
        a.nested.push(analyzeArgvInternal(cmd.map((c) => c.replace(/^\{\}$/, "__FOUND__")), depth + 1, "find -exec"));
      }
    }
    const xc = xargsCommand(seg);
    if (xc && depth < MAX_DEPTH) a.nested.push(analyzeArgvInternal(xc, depth + 1, "xargs"));
    if (seg.executable === "source" || seg.executable === ".") {
      addReason(a, "Sourcing a file runs commands that are not analysed");
    }
    if (seg.executable && /^\.{0,2}\//.test(seg.executableText ?? "") && !seg.known) {
      addReason(a, `Runs a local program or script (${seg.executableText}) whose behaviour is not analysed`);
    }

    // pipe to shell: previous stage feeds a shell/interpreter
    if (idx > 0 && (seg.operatorBefore === "|" || seg.operatorBefore === "|&")) {
      const prev = a.segments[idx - 1];
      const fetcher = prev.executable === "curl" || prev.executable === "wget" || prev.executable === "fetch";
      const interp =
        seg.executable !== null &&
        (SHELL_INTERPRETERS.has(seg.executable) || /^(python[0-9.]*|perl|ruby|node|php)$/.test(seg.executable));
      if (interp && fetcher) a.pipeToShell = true;
      if (interp && !fetcher) addReason(a, "Piped input is executed by an interpreter");
    }
  }

  a.needsShell =
    a.segments.length > 1 ||
    a.operators.length > 0 ||
    a.hasSubstitution ||
    a.hasGlob ||
    a.segments.some((s) => s.redirections.length > 0 || s.argvTokens.some((t) => t.hasExpansion || t.hasGlob)) ||
    a.uncertaintyReasons.some((r) => r.startsWith("Syntax") || r.startsWith("Here-document") || r.startsWith("Subshell"));
}

/** Analyse a command typed as a single shell string. Never executes anything. */
export function analyzeCommand(raw: string): Analysis {
  return analyzeInternal(raw, 0, null);
}

function analyzeArgvInternal(argv: string[], depth: number, via: string | null): Analysis {
  const raw = joinArgv(argv);
  const a = emptyAnalysis(raw, "argv", via);
  const tokens = argv.map(plainToken);
  const seg = buildSegment({ tokens, redirections: [], operatorBefore: null, raw });
  a.segments = argv.length ? [seg] : [];
  finishSegments(a, depth);
  // argv mode is executed without a shell, so shell syntax is inert data.
  a.needsShell = false;
  return a;
}

/**
 * Analyse a command that is already split into arguments (e.g. `guard run -- rm -rf x`).
 * Shell metacharacters inside arguments are literal data in this mode.
 */
export function analyzeArgv(argv: string[]): Analysis {
  return analyzeArgvInternal(argv, 0, null);
}

/** All segments in this analysis and every nested analysis, with a label for where they came from. */
export function collectSegments(a: Analysis): Array<{ segment: Segment; analysis: Analysis }> {
  const out: Array<{ segment: Segment; analysis: Analysis }> = [];
  const walk = (x: Analysis): void => {
    for (const s of x.segments) out.push({ segment: s, analysis: x });
    for (const n of x.nested) walk(n);
  };
  walk(a);
  return out;
}

/** True when this analysis or any nested one is uncertain. */
export function isUncertain(a: Analysis): boolean {
  return a.uncertain || a.nested.some(isUncertain);
}

export function allUncertaintyReasons(a: Analysis): string[] {
  const set = new Set<string>(a.uncertaintyReasons);
  for (const n of a.nested) for (const r of allUncertaintyReasons(n)) set.add(r);
  return [...set];
}

export function allUnrecognized(a: Analysis): string[] {
  const set = new Set<string>(a.unrecognized);
  for (const n of a.nested) for (const r of allUnrecognized(n)) set.add(r);
  return [...set];
}
