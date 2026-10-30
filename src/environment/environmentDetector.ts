import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

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

function defaultRead(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/**
 * Reads explicit environment metadata only (env vars and the kubeconfig
 * `current-context` line). It never runs kubectl/aws/terraform and never
 * guesses "production" from command text.
 */
export function detectEnvironment(opts: DetectOptions = {}): EnvironmentContext {
  const env = opts.env ?? process.env;
  const homePath = opts.home ?? env.HOME ?? process.env.HOME ?? os.homedir();
  const read = opts.readFile ?? defaultRead;

  let kubeContext: string | null = null;
  const kubeFiles = env.KUBECONFIG
    ? (env.KUBECONFIG.includes(";") ? env.KUBECONFIG.split(";") : env.KUBECONFIG.split(":" )).filter(Boolean)
    : [path.join(homePath, ".kube", "config")];
  const normalizedKubeFiles = kubeFiles.map((file) => (process.platform === "win32" ? file.replace(/\\/g, "/") : file));
  for (const f of normalizedKubeFiles) {
    const text = read(f);
    if (text) {
      const m = /^current-context:\s*["']?([^\s"']+)["']?\s*$/m.exec(text);
      if (m) {
        kubeContext = m[1];
        break;
      }
    }
  }

  const databaseUrls: string[] = [];
  for (const k of ["DATABASE_URL", "DB_URL", "POSTGRES_URL", "MYSQL_URL", "MONGODB_URI", "REDIS_URL", "PGHOST", "MYSQL_HOST"]) {
    const v = env[k];
    if (v) databaseUrls.push(v);
  }

  return {
    kubeContext,
    terraformWorkspace: env.TF_WORKSPACE ?? null,
    awsProfile: env.AWS_PROFILE ?? env.AWS_DEFAULT_PROFILE ?? null,
    databaseUrls,
  };
}
