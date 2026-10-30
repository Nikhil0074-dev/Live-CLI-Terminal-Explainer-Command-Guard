import { z } from "zod";
export declare const configSchema: z.ZodObject<{
    version: z.ZodDefault<z.ZodLiteral<1>>;
    policyProfile: z.ZodOptional<z.ZodString>;
    ai: z.ZodPrefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        provider: z.ZodDefault<z.ZodLiteral<"ollama">>;
        baseUrl: z.ZodDefault<z.ZodString>;
        model: z.ZodDefault<z.ZodString>;
        timeoutMs: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>>;
    security: z.ZodPrefault<z.ZodObject<{
        defaultUnknownCommandPolicy: z.ZodDefault<z.ZodEnum<{
            ALLOW: "ALLOW";
            WARN: "WARN";
            CONFIRM: "CONFIRM";
            BLOCK: "BLOCK";
        }>>;
        requireConfirmationForHighRisk: z.ZodDefault<z.ZodBoolean>;
        blockCriticalOperations: z.ZodDefault<z.ZodBoolean>;
        allowExecutionWhenAiUnavailable: z.ZodDefault<z.ZodBoolean>;
        allowYesFlag: z.ZodDefault<z.ZodBoolean>;
        blockedCommands: z.ZodDefault<z.ZodArray<z.ZodString>>;
        trustedCommands: z.ZodDefault<z.ZodArray<z.ZodString>>;
        hookMode: z.ZodDefault<z.ZodEnum<{
            risky: "risky";
            all: "all";
        }>>;
    }, z.core.$strict>>;
    logging: z.ZodPrefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        storeRawCommands: z.ZodDefault<z.ZodBoolean>;
        retentionDays: z.ZodDefault<z.ZodNumber>;
        path: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    environment: z.ZodPrefault<z.ZodObject<{
        protectedDirectories: z.ZodDefault<z.ZodArray<z.ZodString>>;
        productionDatabaseHosts: z.ZodDefault<z.ZodArray<z.ZodString>>;
        productionDatabaseNames: z.ZodDefault<z.ZodArray<z.ZodString>>;
        productionCloudAccountIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        productionCloudProfiles: z.ZodDefault<z.ZodArray<z.ZodString>>;
        productionKubeContexts: z.ZodDefault<z.ZodArray<z.ZodString>>;
        productionTerraformWorkspaces: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type GuardConfig = z.infer<typeof configSchema>;
