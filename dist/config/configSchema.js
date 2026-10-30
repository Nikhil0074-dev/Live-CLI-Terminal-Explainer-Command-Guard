"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configSchema = void 0;
const zod_1 = require("zod");
const decisionSchema = zod_1.z.enum(["ALLOW", "WARN", "CONFIRM", "BLOCK"]);
exports.configSchema = zod_1.z
    .object({
    version: zod_1.z.literal(1).default(1),
    /** Name of a profile in policies/ (default | development | production) or a path to a JSON file. */
    policyProfile: zod_1.z.string().optional(),
    ai: zod_1.z
        .object({
        enabled: zod_1.z.boolean().default(true),
        provider: zod_1.z.literal("ollama").default("ollama"),
        baseUrl: zod_1.z.string().url().default("http://127.0.0.1:11434"),
        model: zod_1.z.string().min(1).default("YOUR_INSTALLED_MODEL"),
        timeoutMs: zod_1.z.number().int().min(200).max(120000).default(8000),
    })
        .strict()
        .prefault({}),
    security: zod_1.z
        .object({
        defaultUnknownCommandPolicy: decisionSchema.default("WARN"),
        requireConfirmationForHighRisk: zod_1.z.boolean().default(true),
        blockCriticalOperations: zod_1.z.boolean().default(true),
        allowExecutionWhenAiUnavailable: zod_1.z.boolean().default(true),
        allowYesFlag: zod_1.z.boolean().default(false),
        blockedCommands: zod_1.z.array(zod_1.z.string().min(1)).default([]),
        trustedCommands: zod_1.z.array(zod_1.z.string().min(1)).default([]),
        hookMode: zod_1.z.enum(["risky", "all"]).default("risky"),
    })
        .strict()
        .prefault({}),
    logging: zod_1.z
        .object({
        enabled: zod_1.z.boolean().default(true),
        storeRawCommands: zod_1.z.boolean().default(false),
        retentionDays: zod_1.z.number().int().min(1).max(3650).default(90),
        path: zod_1.z.string().optional(),
    })
        .strict()
        .prefault({}),
    environment: zod_1.z
        .object({
        protectedDirectories: zod_1.z.array(zod_1.z.string()).default([]),
        productionDatabaseHosts: zod_1.z.array(zod_1.z.string()).default([]),
        productionDatabaseNames: zod_1.z.array(zod_1.z.string()).default([]),
        productionCloudAccountIds: zod_1.z.array(zod_1.z.string()).default([]),
        productionCloudProfiles: zod_1.z.array(zod_1.z.string()).default([]),
        productionKubeContexts: zod_1.z.array(zod_1.z.string()).default([]),
        productionTerraformWorkspaces: zod_1.z.array(zod_1.z.string()).default([]),
    })
        .strict()
        .prefault({}),
})
    .strict();
