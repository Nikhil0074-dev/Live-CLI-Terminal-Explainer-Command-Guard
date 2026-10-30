import * as os from "node:os";
import * as path from "node:path";
import type { Readable } from "node:stream";
import type { FetchLike } from "../ai/ollamaClient";
import { loadConfig } from "../config/configManager";
import type { GuardConfig } from "../config/configSchema";
import { createLineReader, LineReader } from "../execution/confirmation";
import type { GuardDeps, GuardInput } from "../execution/executionController";
import { AuditLogger } from "../logging/auditLogger";
import { colorEnabled } from "../ui/terminalFormatter";
import { guardHome } from "../utils/paths";

export interface CliIO {
  env: NodeJS.ProcessEnv;
  cwd: string;
  stdin: Readable;
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  stdoutIsTTY?: boolean;
  stderrIsTTY?: boolean;
  fetchImpl?: FetchLike;
  /** Capture child output instead of inheriting stdio (used by tests). */
  capture?: boolean;
  /** Test hook: provide a terminal for hook prompts. */
  openTty?: () => { reader: LineReader; write: (s: string) => void; close: () => void } | null;
}

export function processIO(): CliIO {
  return {
    env: process.env,
    cwd: process.cwd(),
    stdin: process.stdin,
    stdout: (s) => void process.stdout.write(s),
    stderr: (s) => void process.stderr.write(s),
    stdoutIsTTY: process.stdout.isTTY,
    stderrIsTTY: process.stderr.isTTY,
  };
}

export interface Runtime {
  config: GuardConfig;
  configPath: string;
  logger: AuditLogger;
  home: string;
  deps: (target: "stdout" | "stderr") => GuardDeps;
  close: () => void;
}

export function auditPath(config: GuardConfig, env: NodeJS.ProcessEnv): string {
  return config.logging.path ? path.resolve(config.logging.path) : path.join(guardHome(env), "audit.log");
}

export function buildRuntime(io: CliIO): Runtime {
  const { config, path: configPath } = loadConfig({ env: io.env });
  const home = io.env.HOME ?? os.homedir();
  const logger = new AuditLogger(auditPath(config, io.env), {
    enabled: config.logging.enabled,
    storeRawCommands: config.logging.storeRawCommands,
    retentionDays: config.logging.retentionDays,
  });
  let reader: LineReader | null = null;
  const getReader = (): LineReader => (reader ??= createLineReader(io.stdin));
  const lazyReader: LineReader = {
    readLine: () => getReader().readLine(),
    close: () => reader?.close(),
  };
  return {
    config,
    configPath,
    logger,
    home,
    close: () => reader?.close(),
    deps: (target) => ({
      config,
      logger,
      cwd: io.cwd,
      home,
      env: io.env,
      write: target === "stdout" ? io.stdout : io.stderr,
      style: { color: colorEnabled({ isTTY: target === "stdout" ? io.stdoutIsTTY : io.stderrIsTTY }, io.env) },
      reader: lazyReader,
      fetchImpl: io.fetchImpl,
      stdio: io.capture ? "pipe" : "inherit",
    }),
  };
}

/** One argument = a shell string; several arguments = an already-split argv (no shell parsing). */
export function toInput(parts: string[]): GuardInput {
  return parts.length === 1 ? { raw: parts[0] } : { argv: parts };
}
