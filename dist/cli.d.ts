#!/usr/bin/env node
import { CliIO } from "./commands/runtime";
/** Run the CLI. Returns the process exit code (never calls process.exit itself). */
export declare function main(argv: string[], io?: CliIO): Promise<number>;
