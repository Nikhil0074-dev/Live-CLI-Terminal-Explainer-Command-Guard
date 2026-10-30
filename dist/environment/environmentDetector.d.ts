export interface EnvironmentContext {
    /** Kubernetes current-context, if it could be read from the kubeconfig file. */
    kubeContext: string | null;
    terraformWorkspace: string | null;
    awsProfile: string | null;
    databaseUrls: string[];
}
export interface DetectOptions {
    env?: NodeJS.ProcessEnv;
    home?: string;
    /** Injectable for tests. Returns file contents or null. */
    readFile?: (p: string) => string | null;
}
/**
 * Reads explicit environment metadata only (env vars and the kubeconfig
 * `current-context` line). It never runs kubectl/aws/terraform and never
 * guesses "production" from command text.
 */
export declare function detectEnvironment(opts?: DetectOptions): EnvironmentContext;
