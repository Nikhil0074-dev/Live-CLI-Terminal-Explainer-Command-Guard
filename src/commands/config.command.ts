import * as fs from "node:fs";
import { redactConfig, writeDefaultConfig } from "../config/configManager";
import { buildRuntime, CliIO } from "./runtime";
import { defaultConfigPath } from "../config/configManager";

export function configShow(io: CliIO): number {
  const rt = buildRuntime(io);
  io.stdout(`# source: ${fs.existsSync(rt.configPath) ? rt.configPath : "built-in defaults (no file at " + rt.configPath + ")"}\n`);
  io.stdout(JSON.stringify(redactConfig(rt.config), null, 2) + "\n");
  return 0;
}

export function configPath(io: CliIO): number {
  io.stdout(defaultConfigPath(io.env) + "\n");
  return 0;
}

export function configInit(io: CliIO, force: boolean): number {
  const file = defaultConfigPath(io.env);
  const created = writeDefaultConfig(file, force);
  io.stdout(created ? `Created ${file}\n` : `Config already exists: ${file} (use --force to overwrite)\n`);
  return created ? 0 : 1;
}
