import * as fs from "node:fs";
import * as path from "node:path";
import { packageRoot } from "../config/configManager";
import { askConfirmation, LineReader } from "../execution/confirmation";
import { assess, categoryOf } from "../execution/executionController";
import { defaultRcFile, installHook, uninstallHook } from "../shell/hookInstaller";
import type { SupportedShell } from "../shell/shellDetector";
import { renderCompact } from "../ui/terminalFormatter";
import { buildRuntime, CliIO } from "./runtime";

/** Blocking, stream-free reader for /dev/tty: one prompt, one line, no file-descriptor races. */
function openTtyDefault(): ReturnType<NonNullable<CliIO["openTty"]>> {
  let fd: number;
  try {
    fd = fs.openSync("/dev/tty", "r+");
  } catch {
    return null;
  }
  const reader: LineReader = {
    readLine: () => {
      const chunk = Buffer.alloc(1);
      let line = "";
      for (let i = 0; i < 4096; i++) {
        let n = 0;
        try {
          n = fs.readSync(fd, chunk, 0, 1, null);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === "EAGAIN") continue;
          return Promise.resolve(line.length ? line : null);
        }
        if (n === 0) return Promise.resolve(line.length ? line : null);
        const ch = chunk.toString("utf8");
        if (ch === "\n") return Promise.resolve(line);
        line += ch;
      }
      return Promise.resolve(line);
    },
    close: () => undefined,
  };
  return {
    reader,
    write: (s) => {
      try {
        fs.writeSync(fd, s);
      } catch {
        /* ignore */
      }
    },
    close: () => {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Called by the Bash/Zsh integration before a command line runs.
 * Exit codes: 0 = let the shell run it, 3 = deny (blocked or cancelled), anything else = the guard itself failed
 * (a crashed Node process exits 1, so "1" must never mean "denied").
 */
export async function hookCheck(line: string, io: CliIO): Promise<number> {
  let rt;
  try {
    rt = buildRuntime(io);
  } catch (e) {
    io.stderr(`[guard] ${(e as Error).message}\n`);
    return 2;
  }
  try {
    const deps = rt.deps("stderr");
    const a = await assess({ raw: line }, deps, { useAi: false, source: "hook" });
    const p = a.policy;
    const log = (confirmationRequested: boolean, approved: boolean): void => {
      rt.logger.write(
        {
          commandCategory: categoryOf(a.findings),
          risk: p.risk,
          ruleIds: a.findings.map((f) => f.ruleId),
          decision: p.decision,
          confirmationRequested,
          approved,
          executed: approved && p.decision !== "BLOCK",
          uncertain: p.uncertain,
          source: "hook",
        },
        line,
      );
    };
    if (p.decision === "ALLOW") {
      log(false, true);
      return 0;
    }
    io.stderr(renderCompact(deps.style, a.analysis.raw, p) + "\n");
    if (p.decision === "WARN") {
      log(false, true);
      return 0;
    }
    if (p.decision === "BLOCK") {
      log(false, false);
      return 3;
    }
    const tty = (io.openTty ?? openTtyDefault)();
    if (!tty) {
      io.stderr("  No terminal available for confirmation. Command cancelled.\n");
      log(true, false);
      return 3;
    }
    try {
      const ans = await askConfirmation(tty.reader, tty.write, "  Continue? [y/N] ");
      const ok = ans === "yes";
      if (!ok) io.stderr("  Cancelled.\n");
      log(true, ok);
      return ok ? 0 : 3;
    } finally {
      tty.close();
    }
  } catch (e) {
    io.stderr(`[guard] internal error: ${(e as Error).message}\n`);
    return 2;
  } finally {
    rt.close();
  }
}

export function installHookCommand(shell: SupportedShell, rcFile: string | undefined, io: CliIO): number {
  const home = io.env.HOME ?? "";
  const rc = rcFile ? path.resolve(rcFile) : defaultRcFile(shell, home);
  const cli = path.join(packageRoot(), "dist", "cli.js");
  const res = installHook(shell, rc, process.execPath, cli);
  io.stdout(res.changed ? `Installed ${shell} hook in ${rc}${res.backup ? ` (backup: ${res.backup})` : ""}.\nOpen a new terminal or run: source ${rc}\n` : `The ${shell} hook is already installed in ${rc}.\n`);
  return 0;
}

export function uninstallHookCommand(shell: SupportedShell, rcFile: string | undefined, io: CliIO): number {
  const home = io.env.HOME ?? "";
  const rc = rcFile ? path.resolve(rcFile) : defaultRcFile(shell, home);
  const res = uninstallHook(rc);
  io.stdout(res.changed ? `Removed the ${shell} hook from ${rc}.\n` : `No guard hook found in ${rc}.\n`);
  return 0;
}
