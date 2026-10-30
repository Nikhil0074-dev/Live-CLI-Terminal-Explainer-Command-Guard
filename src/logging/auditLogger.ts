import * as fs from "node:fs";
import * as path from "node:path";
import type { Decision, RiskLevel } from "../types";
import { sanitizeCommand } from "./logSanitizer";

export interface AuditRecord {
  timestamp: string;
  commandCategory: string;
  risk: RiskLevel;
  ruleIds: string[];
  decision: Decision;
  confirmationRequested: boolean;
  approved: boolean;
  executed: boolean;
  exitCode?: number;
  uncertain?: boolean;
  source?: "run" | "hook" | "check";
  /** Present only when logging.storeRawCommands is true (and always sanitised). */
  command?: string;
}

export interface AuditOptions {
  enabled: boolean;
  storeRawCommands: boolean;
  retentionDays: number;
  now?: () => Date;
}

export class AuditLogger {
  constructor(private readonly file: string, private readonly opts: AuditOptions) {}

  private now(): Date {
    return this.opts.now ? this.opts.now() : new Date();
  }

  get path(): string {
    return this.file;
  }

  /** Never throws: a logging failure must not change a security decision. */
  write(rec: Omit<AuditRecord, "timestamp" | "command">, rawCommand?: string): boolean {
    if (!this.opts.enabled) return false;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
      const full: AuditRecord = { timestamp: this.now().toISOString(), ...rec };
      if (this.opts.storeRawCommands && rawCommand !== undefined) full.command = sanitizeCommand(rawCommand);
      fs.appendFileSync(this.file, JSON.stringify(full) + "\n", { mode: 0o600 });
      try {
        fs.chmodSync(this.file, 0o600);
      } catch {
        /* best effort (e.g. Windows) */
      }
      return true;
    } catch {
      return false;
    }
  }

  read(limit = 20): AuditRecord[] {
    let text: string;
    try {
      text = fs.readFileSync(this.file, "utf8");
    } catch {
      return [];
    }
    const recs: AuditRecord[] = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        recs.push(JSON.parse(line) as AuditRecord);
      } catch {
        /* skip corrupt line */
      }
    }
    return limit > 0 ? recs.slice(-limit) : recs;
  }

  /** Remove records older than the retention period. Returns the number removed. */
  prune(): number {
    const all = this.read(0);
    if (all.length === 0) return 0;
    const cutoff = this.now().getTime() - this.opts.retentionDays * 86_400_000;
    const keep = all.filter((r) => Date.parse(r.timestamp) >= cutoff);
    const removed = all.length - keep.length;
    if (removed > 0) {
      try {
        fs.writeFileSync(this.file, keep.map((r) => JSON.stringify(r)).join("\n") + (keep.length ? "\n" : ""), { mode: 0o600 });
      } catch {
        return 0;
      }
    }
    return removed;
  }
}
