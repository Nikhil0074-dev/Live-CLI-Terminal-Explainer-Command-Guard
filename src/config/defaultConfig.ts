import { configSchema, GuardConfig } from "./configSchema";

export function defaultConfig(): GuardConfig {
  return configSchema.parse({});
}
