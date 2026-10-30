import { z } from "zod";

const decisionSchema = z.enum(["ALLOW", "WARN", "CONFIRM", "BLOCK"]);

export const configSchema = z
  .object({
    version: z.literal(1).default(1),
    /** Name of a profile in policies/ (default | development | production) or a path to a JSON file. */
    policyProfile: z.string().optional(),
    ai: z
      .object({
        enabled: z.boolean().default(true),
        provider: z.literal("ollama").default("ollama"),
        baseUrl: z.string().url().default("http://127.0.0.1:11434"),
        model: z.string().min(1).default("YOUR_INSTALLED_MODEL"),
        timeoutMs: z.number().int().min(200).max(120000).default(8000),
      })
      .strict()
      .prefault({}),
    security: z
      .object({
        defaultUnknownCommandPolicy: decisionSchema.default("WARN"),
        requireConfirmationForHighRisk: z.boolean().default(true),
        blockCriticalOperations: z.boolean().default(true),
        allowExecutionWhenAiUnavailable: z.boolean().default(true),
        allowYesFlag: z.boolean().default(false),
        blockedCommands: z.array(z.string().min(1)).default([]),
        trustedCommands: z.array(z.string().min(1)).default([]),
        hookMode: z.enum(["risky", "all"]).default("risky"),
      })
      .strict()
      .prefault({}),
    logging: z
      .object({
        enabled: z.boolean().default(true),
        storeRawCommands: z.boolean().default(false),
        retentionDays: z.number().int().min(1).max(3650).default(90),
        path: z.string().optional(),
      })
      .strict()
      .prefault({}),
    environment: z
      .object({
        protectedDirectories: z.array(z.string()).default([]),
        productionDatabaseHosts: z.array(z.string()).default([]),
        productionDatabaseNames: z.array(z.string()).default([]),
        productionCloudAccountIds: z.array(z.string()).default([]),
        productionCloudProfiles: z.array(z.string()).default([]),
        productionKubeContexts: z.array(z.string()).default([]),
        productionTerraformWorkspaces: z.array(z.string()).default([]),
      })
      .strict()
      .prefault({}),
  })
  .strict();

export type GuardConfig = z.infer<typeof configSchema>;
