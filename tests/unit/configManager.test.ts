import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigError, loadConfig, mergeConfig, parseConfig, redactConfig, writeDefaultConfig } from "../../src/config/configManager";
import { defaultConfig } from "../../src/config/defaultConfig";
import { detectEnvironment } from "../../src/environment/environmentDetector";

describe("configManager", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "guard-cfg-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const write = (name: string, obj: unknown) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, typeof obj === "string" ? obj : JSON.stringify(obj));
    return p;
  };

  it("provides safe defaults", () => {
    const c = defaultConfig();
    expect(c.security.requireConfirmationForHighRisk).toBe(true);
    expect(c.security.blockCriticalOperations).toBe(true);
    expect(c.security.allowYesFlag).toBe(false);
    expect(c.security.defaultUnknownCommandPolicy).toBe("WARN");
    expect(c.logging.storeRawCommands).toBe(false);
    expect(c.ai.baseUrl).toBe("http://127.0.0.1:11434");
  });

  it("a missing config file means defaults", () => {
    const r = loadConfig({ configPath: path.join(dir, "nope.json") });
    expect(r.exists).toBe(false);
    expect(r.config.security.blockCriticalOperations).toBe(true);
  });

  it("loads and validates a user file", () => {
    const p = write("c.json", { version: 1, environment: { protectedDirectories: ["/data"] }, security: { defaultUnknownCommandPolicy: "CONFIRM" } });
    const r = loadConfig({ configPath: p });
    expect(r.config.environment.protectedDirectories).toEqual(["/data"]);
    expect(r.config.security.defaultUnknownCommandPolicy).toBe("CONFIRM");
  });

  it("rejects invalid values with readable messages (fail closed)", () => {
    expect(() => parseConfig({ security: { defaultUnknownCommandPolicy: "MAYBE" } })).toThrow(ConfigError);
    expect(() => parseConfig({ security: { defaultUnknownCommandPolicy: "MAYBE" } })).toThrow(/security\.defaultUnknownCommandPolicy/);
    expect(() => parseConfig({ unknownKey: 1 })).toThrow(/Unrecognized key/);
    expect(() => parseConfig({ ai: { baseUrl: "not a url" } })).toThrow(/ai\.baseUrl/);
    expect(() => parseConfig({ security: { blockedCommands: ["regex:("] } })).toThrow(/not a valid regular expression/);
  });

  it("reports unreadable and malformed JSON files", () => {
    expect(() => loadConfig({ configPath: write("bad.json", "{oops") })).toThrow(/Invalid JSON/);
    expect(() => loadConfig({ configPath: write("arr.json", "[]") })).toThrow(/top-level value must be an object/);
  });

  it("applies policy profiles under the user file", () => {
    const profiles = path.join(dir, "profiles");
    fs.mkdirSync(profiles);
    fs.writeFileSync(path.join(profiles, "prod.json"), JSON.stringify({ security: { defaultUnknownCommandPolicy: "CONFIRM", blockedCommands: ["terraform destroy*"] } }));
    const p = write("c.json", { policyProfile: "prod", security: { blockedCommands: ["rm -rf /*"] } });
    const r = loadConfig({ configPath: p, profilesDir: profiles });
    expect(r.config.security.defaultUnknownCommandPolicy).toBe("CONFIRM");
    // arrays are unioned so a user file cannot remove a profile's blocks
    expect(r.config.security.blockedCommands.sort()).toEqual(["rm -rf /*", "terraform destroy*"]);
  });

  it("errors when the named profile does not exist", () => {
    expect(() => loadConfig({ configPath: write("c.json", { policyProfile: "ghost" }), profilesDir: dir })).toThrow(/Policy profile "ghost" not found/);
  });

  it("the shipped profiles are valid", () => {
    for (const name of ["default", "development", "production"]) {
      const r = loadConfig({ configPath: write(`${name}.json`, { policyProfile: name }) });
      expect(r.config.version).toBe(1);
    }
    const prod = loadConfig({ configPath: write("p.json", { policyProfile: "production" }) });
    expect(prod.config.security.blockedCommands).toContain("terraform destroy*");
    expect(prod.config.security.hookMode).toBe("all");
  });

  it("mergeConfig: objects merge, arrays union, scalars override", () => {
    const m = mergeConfig({ a: { x: 1, list: [1, 2] }, s: "a" }, { a: { y: 2, list: [2, 3] }, s: "b" });
    expect(m).toEqual({ a: { x: 1, y: 2, list: [1, 2, 3] }, s: "b" });
  });

  it("GUARD_CONFIG selects the file", () => {
    const p = write("env.json", { security: { defaultUnknownCommandPolicy: "BLOCK" } });
    expect(loadConfig({ env: { GUARD_CONFIG: p } }).config.security.defaultUnknownCommandPolicy).toBe("BLOCK");
  });

  it("redactConfig hides URL credentials", () => {
    const c = parseConfig({ ai: { baseUrl: "http://user:pw@127.0.0.1:11434" } });
    const r = redactConfig(c);
    expect(JSON.stringify(r)).not.toContain("pw@");
    expect(JSON.stringify(c)).toContain("pw@"); // original untouched
  });

  it("writeDefaultConfig creates a private, valid file and does not overwrite", () => {
    const p = path.join(dir, "sub", "config.json");
    expect(writeDefaultConfig(p)).toBe(true);
    expect(writeDefaultConfig(p)).toBe(false);
    expect(loadConfig({ configPath: p }).exists).toBe(true);
    if (process.platform !== "win32") expect(fs.statSync(p).mode & 0o777).toBe(0o600);
  });
});

describe("environmentDetector", () => {
  it("reads the kubeconfig current-context without running kubectl", () => {
    const e = detectEnvironment({ env: { HOME: "/h" }, home: "/h", readFile: (p) => (p === "/h/.kube/config" ? "apiVersion: v1\ncurrent-context: prod-cluster\n" : null) });
    expect(e.kubeContext).toBe("prod-cluster");
  });

  it("honours KUBECONFIG with several files", () => {
    const e = detectEnvironment({ env: { KUBECONFIG: "/a:/b", HOME: "/h" }, readFile: (p) => (p === "/b" ? "current-context: \"dev\"" : null) });
    expect(e.kubeContext).toBe("dev");
  });

  it("returns null when nothing is configured", () => {
    const e = detectEnvironment({ env: { HOME: "/h" }, home: "/h", readFile: () => null });
    expect(e).toEqual({ kubeContext: null, terraformWorkspace: null, awsProfile: null, databaseUrls: [] });
  });

  it("collects workspace, profile and database URLs from the environment", () => {
    const e = detectEnvironment({ env: { TF_WORKSPACE: "production", AWS_PROFILE: "prod", DATABASE_URL: "postgres://x@h/db", PGHOST: "h2" }, home: "/h", readFile: () => null });
    expect(e.terraformWorkspace).toBe("production");
    expect(e.awsProfile).toBe("prod");
    expect(e.databaseUrls).toEqual(["postgres://x@h/db", "h2"]);
  });
});
