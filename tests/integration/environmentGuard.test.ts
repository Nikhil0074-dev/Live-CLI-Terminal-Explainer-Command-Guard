import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { guardedRun } from "../../src/execution/executionController";
import { evaluatePolicy } from "../../src/policy/policyEngine";
import { evaluateRules } from "../../src/rules/ruleEngine";
import { analyzeCommand } from "../../src/analyzer/commandAnalyzer";
import { detectEnvironment } from "../../src/environment/environmentDetector";
import { cfg } from "../fixtures/helpers";
import { Harness, harness, makeTree } from "../fixtures/deps";

let h: Harness;
afterEach(() => h?.cleanup());

function decide(command: string, env: NodeJS.ProcessEnv, kubeconfig?: string) {
  const config = cfg();
  const a = analyzeCommand(command);
  const environment = detectEnvironment({ env, home: "/home/dev", readFile: (p) => (kubeconfig !== undefined && p === "/home/dev/.kube/config" ? kubeconfig : null) });
  const findings = evaluateRules(a, { config, cwd: "/home/dev/project", home: "/home/dev", env, environment });
  return evaluatePolicy(a, findings, config);
}

describe("environment protection (explicit configuration, never guessed from text)", () => {
  it("kubectl uses the CURRENT kube context from the kubeconfig when --context is absent", () => {
    const prodCfg = "current-context: prod-cluster\n";
    expect(decide("kubectl delete pod web-1", { HOME: "/home/dev" }, prodCfg).decision).toBe("BLOCK");
    expect(decide("kubectl apply -f x.yaml", { HOME: "/home/dev" }, prodCfg).decision).toBe("CONFIRM");
    expect(decide("kubectl get pods", { HOME: "/home/dev" }, prodCfg).decision).toBe("ALLOW");
    expect(decide("kubectl delete pod web-1", { HOME: "/home/dev" }, "current-context: dev-cluster\n").decision).toBe("CONFIRM");
  });

  it("an explicit --context overrides the kubeconfig current-context", () => {
    expect(decide("kubectl --context dev-cluster delete pod x", { HOME: "/home/dev" }, "current-context: prod-cluster\n").decision).toBe("CONFIRM");
    expect(decide("kubectl --context=prod-cluster delete pod x", { HOME: "/home/dev" }, "current-context: dev-cluster\n").decision).toBe("BLOCK");
  });

  it("TF_WORKSPACE from the environment selects the production workspace", () => {
    expect(decide("terraform destroy", { HOME: "/home/dev", TF_WORKSPACE: "production" }).decision).toBe("BLOCK");
    expect(decide("terraform destroy", { HOME: "/home/dev", TF_WORKSPACE: "dev" }).decision).toBe("CONFIRM");
  });

  it("AWS_PROFILE from the environment selects the production profile", () => {
    expect(decide("aws s3 rb s3://bucket", { HOME: "/home/dev", AWS_PROFILE: "prod" }).decision).toBe("BLOCK");
    expect(decide("aws s3 rb s3://bucket", { HOME: "/home/dev", AWS_PROFILE: "sandbox" }).decision).toBe("CONFIRM");
  });

  it("DATABASE_URL pointing at a production host protects psql and migrations", () => {
    const env = { HOME: "/home/dev", DATABASE_URL: "postgres://app@prod-db.example.com:5432/orders" };
    expect(decide("psql -c 'DELETE FROM orders'", env).decision).toBe("BLOCK");
    expect(decide("psql -c 'select 1'", env).decision).toBe("CONFIRM");
    expect(decide("npx prisma migrate reset", env).decision).toBe("BLOCK");
    expect(decide("psql -c 'DELETE FROM orders'", { HOME: "/home/dev", DATABASE_URL: "postgres://app@localhost/orders" }).decision).toBe("CONFIRM");
  });

  it("mistaking the environment: a lookalike host name is NOT treated as production unless configured", () => {
    expect(decide("psql -h staging-db.example.com -c 'DROP TABLE t'", { HOME: "/home/dev" }).decision).toBe("CONFIRM");
  });

  it("protected directories hold through guardedRun with real files", async () => {
    h = harness({ protectedRel: ["work/data"], answers: ["y", "y"] });
    makeTree(h.work, ["data/db.sqlite", "tmp/x"]);
    const blocked = await guardedRun({ argv: ["rm", "-rf", "data"] }, h.deps);
    const viaShell = await guardedRun({ raw: "echo ok; rm -rf ./data/db.sqlite" }, h.deps);
    const viaSub = await guardedRun({ raw: 'bash -c "rm -rf data"' }, h.deps);
    expect([blocked.blocked, viaShell.blocked, viaSub.blocked]).toEqual([true, true, true]);
    expect(fs.existsSync(path.join(h.work, "data", "db.sqlite"))).toBe(true);
    // unprotected sibling still works after confirmation
    const ok = await guardedRun({ argv: ["rm", "-rf", "tmp"] }, h.deps);
    expect(ok.executed).toBe(true);
    expect(fs.existsSync(path.join(h.work, "tmp"))).toBe(false);
  });

  it("symlink-free path tricks (.., //, ./) still resolve into the protected directory", async () => {
    h = harness({ protectedRel: ["work/data"] });
    makeTree(h.work, ["data/db.sqlite", "other/x"]);
    for (const target of ["other/../data/db.sqlite", "./data//db.sqlite", path.join(h.work, "data", ".", "db.sqlite")]) {
      const r = await guardedRun({ argv: ["rm", "-f", target] }, h.deps);
      expect(r.blocked, target).toBe(true);
    }
    expect(fs.existsSync(path.join(h.work, "data", "db.sqlite"))).toBe(true);
  });
});
