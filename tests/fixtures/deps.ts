import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PassThrough } from "node:stream";
import type { FetchLike } from "../../src/ai/ollamaClient";
import type { GuardConfig } from "../../src/config/configSchema";
import { createLineReader } from "../../src/execution/confirmation";
import type { GuardDeps } from "../../src/execution/executionController";
import { AuditLogger } from "../../src/logging/auditLogger";
import { cfg } from "./helpers";

export interface Harness {
  dir: string;
  work: string;
  deps: GuardDeps;
  output: () => string;
  logger: AuditLogger;
  cleanup: () => void;
}

/** Builds a sandbox: temp working dir, answers typed to the prompt, captured output, real audit file. */
export function harness(opts: { answers?: string[]; config?: GuardConfig; env?: NodeJS.ProcessEnv; fetchImpl?: FetchLike; protectedRel?: string[] } = {}): Harness {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guard-it-"));
  const work = path.join(dir, "work");
  fs.mkdirSync(work);
  const protectedDirs = (opts.protectedRel ?? []).map((p) => path.join(dir, p));
  const config: GuardConfig = opts.config
    ? { ...opts.config, environment: { ...opts.config.environment, protectedDirectories: [...opts.config.environment.protectedDirectories, ...protectedDirs] } }
    : cfg({ environment: { protectedDirectories: protectedDirs } });
  const input = new PassThrough();
  for (const a of opts.answers ?? []) input.write(a + "\n");
  input.end();
  const reader = createLineReader(input);
  const logger = new AuditLogger(path.join(dir, "audit.log"), { enabled: true, storeRawCommands: false, retentionDays: 90 });
  let out = "";
  const deps: GuardDeps = {
    config,
    logger,
    cwd: work,
    home: dir,
    env: { ...process.env, HOME: dir, ...(opts.env ?? {}) },
    write: (s) => void (out += s),
    style: { color: false },
    reader,
    fetchImpl: opts.fetchImpl,
    stdio: "pipe",
    environment: { kubeContext: null, terraformWorkspace: null, awsProfile: null, databaseUrls: [] },
  };
  return {
    dir,
    work,
    deps,
    output: () => out,
    logger,
    cleanup: () => {
      reader.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function makeTree(root: string, files: string[]): void {
  for (const f of files) {
    const p = path.join(root, f);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "data");
  }
}
