import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuditLogger } from "../../src/logging/auditLogger";
import { sanitizeCommand } from "../../src/logging/logSanitizer";

describe("logSanitizer", () => {
  const redacted = (s: string) => sanitizeCommand(s);

  it("redacts password and token flags", () => {
    expect(redacted("tool --password=hunter2 run")).not.toContain("hunter2");
    expect(redacted("tool --token abc123def run")).not.toContain("abc123def");
    expect(redacted("tool --api-key 'my secret key'")).not.toContain("my secret key");
    expect(redacted("mysql -u root -pSuperSecret db")).not.toContain("SuperSecret");
  });

  it("keeps harmless flags that merely look similar", () => {
    expect(redacted("ls -la --password-prompt-none")).toContain("ls -la");
    expect(redacted("psql -p 5432")).toContain("-p 5432");
  });

  it("redacts URL credentials but keeps host and user", () => {
    const out = redacted("psql postgres://admin:s3cr3t@db.internal:5432/app");
    expect(out).not.toContain("s3cr3t");
    expect(out).toContain("admin");
    expect(out).toContain("db.internal");
  });

  it("redacts secret-looking environment assignments", () => {
    const out = redacted("AWS_SECRET_ACCESS_KEY=abcd1234 DB_PASSWORD='p w' npm start");
    expect(out).not.toContain("abcd1234");
    expect(out).not.toContain("p w");
    expect(out).toContain("npm start");
  });

  it("redacts bearer tokens and well-known token shapes", () => {
    expect(redacted('curl -H "Authorization: Bearer abc.def.ghi"')).not.toContain("abc.def.ghi");
    expect(redacted("echo AKIAIOSFODNN7EXAMPLE")).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(redacted("echo ghp_abcdefghijklmnopqrstuvwxyz0123456789")).not.toMatch(/ghp_abc/);
    expect(redacted("echo sk-abcdefghijklmnopqrstuvwx")).not.toMatch(/sk-abc/);
  });

  it("leaves ordinary commands unchanged", () => {
    expect(redacted("git push origin main")).toBe("git push origin main");
  });
});

describe("AuditLogger", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "guard-audit-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const rec = { commandCategory: "filesystem", risk: "HIGH" as const, ruleIds: ["FS_RECURSIVE_DELETE"], decision: "CONFIRM" as const, confirmationRequested: true, approved: false, executed: false };

  it("writes JSON lines with a timestamp and no raw command by default", () => {
    const l = new AuditLogger(path.join(dir, "audit.log"), { enabled: true, storeRawCommands: false, retentionDays: 90 });
    expect(l.write(rec, "rm -rf secret-project --password=abc")).toBe(true);
    const text = fs.readFileSync(l.path, "utf8");
    expect(text.trim().split("\n")).toHaveLength(1);
    const parsed = JSON.parse(text);
    expect(parsed.timestamp).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(parsed.command).toBeUndefined();
    expect(text).not.toContain("secret-project");
    expect(parsed).toMatchObject({ risk: "HIGH", decision: "CONFIRM", approved: false, executed: false });
  });

  it("stores only the sanitised command when storeRawCommands is true", () => {
    const l = new AuditLogger(path.join(dir, "audit.log"), { enabled: true, storeRawCommands: true, retentionDays: 90 });
    l.write(rec, "deploy --password=hunter2");
    const text = fs.readFileSync(l.path, "utf8");
    expect(text).toContain("deploy");
    expect(text).not.toContain("hunter2");
  });

  it("creates private files and directories", () => {
    const l = new AuditLogger(path.join(dir, "sub", "audit.log"), { enabled: true, storeRawCommands: false, retentionDays: 90 });
    l.write(rec);
    if (process.platform !== "win32") {
      expect(fs.statSync(l.path).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.dirname(l.path)).mode & 0o777).toBe(0o700);
    }
  });

  it("does nothing when disabled", () => {
    const l = new AuditLogger(path.join(dir, "audit.log"), { enabled: false, storeRawCommands: false, retentionDays: 90 });
    expect(l.write(rec)).toBe(false);
    expect(fs.existsSync(l.path)).toBe(false);
  });

  it("never throws when the log location is unwritable", () => {
    const blocker = path.join(dir, "file");
    fs.writeFileSync(blocker, "x");
    const l = new AuditLogger(path.join(blocker, "audit.log"), { enabled: true, storeRawCommands: false, retentionDays: 90 });
    expect(l.write(rec)).toBe(false);
  });

  it("reads the last N records and skips corrupt lines", () => {
    const file = path.join(dir, "audit.log");
    const l = new AuditLogger(file, { enabled: true, storeRawCommands: false, retentionDays: 90 });
    for (let i = 0; i < 5; i++) l.write({ ...rec, ruleIds: ["R" + i] });
    fs.appendFileSync(file, "{not json\n");
    expect(l.read(2).map((r) => r.ruleIds[0])).toEqual(["R3", "R4"]);
    expect(l.read(0)).toHaveLength(5);
    expect(new AuditLogger(path.join(dir, "none.log"), { enabled: true, storeRawCommands: false, retentionDays: 1 }).read()).toEqual([]);
  });

  it("prunes records older than the retention period", () => {
    const file = path.join(dir, "audit.log");
    let now = new Date("2026-01-01T00:00:00Z");
    const l = new AuditLogger(file, { enabled: true, storeRawCommands: false, retentionDays: 30, now: () => now });
    l.write({ ...rec, ruleIds: ["OLD"] });
    now = new Date("2026-03-01T00:00:00Z");
    l.write({ ...rec, ruleIds: ["NEW"] });
    expect(l.prune()).toBe(1);
    expect(l.read(0).map((r) => r.ruleIds[0])).toEqual(["NEW"]);
    expect(l.prune()).toBe(0);
  });
});
