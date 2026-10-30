import * as path from "node:path";
import type { Finding, RiskLevel, RuleCategory, Token } from "../types";
import { globBase, isCriticalPath, isSystemArea, isWithin, resolveTarget } from "../utils/paths";
import type { RuleContext } from "./ruleTypes";

export interface ParsedArgs {
  short: Set<string>;
  long: Set<string>;
  longValues: Map<string, string>;
  positionals: Token[];
  /** All flag-like words in order, as typed. */
  rawFlags: string[];
}

/** Generic POSIX/GNU style argument parser. Flags with values are not modelled; callers handle those. */
export function parseArgs(args: Token[]): ParsedArgs {
  const out: ParsedArgs = { short: new Set(), long: new Set(), longValues: new Map(), positionals: [], rawFlags: [] };
  let afterDD = false;
  for (const t of args) {
    const v = t.value;
    if (afterDD) {
      out.positionals.push(t);
      continue;
    }
    if (v === "--") {
      afterDD = true;
      continue;
    }
    if (v.startsWith("--") && v.length > 2) {
      const eq = v.indexOf("=");
      const name = eq > 0 ? v.slice(2, eq) : v.slice(2);
      out.long.add(name);
      if (eq > 0) out.longValues.set(name, v.slice(eq + 1));
      out.rawFlags.push(v);
    } else if (v.startsWith("-") && v.length > 1 && !/^-\d+$/.test(v)) {
      for (const ch of v.slice(1)) out.short.add(ch);
      out.rawFlags.push(v);
    } else {
      out.positionals.push(t);
    }
  }
  return out;
}

export function hasFlag(p: ParsedArgs, shortChars: string, longNames: string[] = []): boolean {
  for (const ch of shortChars) if (p.short.has(ch)) return true;
  return longNames.some((l) => p.long.has(l));
}

export function finding(
  ruleId: string,
  category: RuleCategory,
  risk: RiskLevel,
  reason: string,
  extra: Partial<Finding> = {},
): Finding {
  return { ruleId, category, risk, reason, requiresConfirmation: risk === "HIGH" || risk === "CRITICAL", ...extra };
}

export interface ResolvedTarget {
  token: Token;
  abs: string;
  /** The user typed a glob; abs is the directory the glob ranges over. */
  isGlob: boolean;
  /** The path contains a variable/substitution, so abs is a best guess. */
  unresolved: boolean;
}

/** Resolve positional path-like tokens to absolute paths (no filesystem access). */
export function resolveTargets(tokens: Token[], ctx: RuleContext): ResolvedTarget[] {
  return tokens.map((t) => {
    const isHomeVar = /^\$\{?HOME\}?(\/|$)/.test(t.value);
    const unresolved = t.hasExpansion && !isHomeVar;
    const base = t.hasGlob ? globBase(t.value) : t.value;
    const abs = resolveTarget(base || ".", ctx.cwd, ctx.home);
    return { token: t, abs, isGlob: t.hasGlob, unresolved };
  });
}

export function matchesProtected(abs: string, ctx: RuleContext, includeAncestors: boolean): string | null {
  for (const p of ctx.config.environment.protectedDirectories) {
    const prot = resolveTarget(p, ctx.cwd, ctx.home);
    if (isWithin(prot, abs)) return prot;
    if (includeAncestors && isWithin(abs, prot)) return prot;
  }
  return null;
}

export { isCriticalPath, isSystemArea, path };

export function containsHost(text: string, hosts: string[]): string | null {
  const lower = text.toLowerCase();
  for (const h of hosts) if (h && lower.includes(h.toLowerCase())) return h;
  return null;
}
