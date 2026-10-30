import { guardedRun } from "../execution/executionController";
import { buildRuntime, CliIO, toInput } from "./runtime";

export interface RunCliOptions {
  ai?: boolean;
  dryRun?: boolean;
  yes?: boolean;
}

/** Analyse, enforce policy, then run. Guard messages go to stderr so program output stays clean. */
export async function runGuarded(parts: string[], opts: RunCliOptions, io: CliIO): Promise<number> {
  const rt = buildRuntime(io);
  try {
    rt.logger.prune();
    const res = await guardedRun(toInput(parts), rt.deps(io.capture ? "stdout" : "stderr"), {
      useAi: Boolean(opts.ai),
      dryRun: Boolean(opts.dryRun),
      assumeYes: Boolean(opts.yes),
      source: "run",
    });
    return res.exitCode;
  } finally {
    rt.close();
  }
}
