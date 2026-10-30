import { describe, expect, it } from "vitest";
import { commandForms, evaluatePolicy, matchesAny, normalizeCommand, patternToRegExp } from "../../src/policy/policyEngine";
import { highestRisk, riskScore } from "../../src/policy/riskScorer";
import type { Finding } from "../../src/types";
import { cfg, judge } from "../fixtures/helpers";
import { analyzeCommand } from "../../src/analyzer/commandAnalyzer";

const f = (risk: Finding["risk"], extra: Partial<Finding> = {}): Finding => ({
  ruleId: "T_" + risk,
  category: "general",
  risk,
  reason: "test",
  requiresConfirmation: risk === "HIGH",
  ...extra,
});

describe("policyEngine: decisions", () => {
  it("maps risk to the default decision", () => {
    expect(judge("ls").policy.decision).toBe("ALLOW");
    expect(judge("rm file.txt").policy.decision).toBe("WARN");
    expect(judge("rm -rf build").policy.decision).toBe("CONFIRM");
    expect(judge("rm -rf /").policy.decision).toBe("BLOCK");
  });

  it("requireConfirmationForHighRisk=false downgrades HIGH to WARN but never CRITICAL or mandatory ones", () => {
    const c = cfg({ security: { requireConfirmationForHighRisk: false } });
    expect(judge("rm -rf build", c).policy.decision).toBe("WARN");
    expect(judge("rm -rf /", c).policy.decision).toBe("BLOCK");
    expect(judge("psql -h prod-db.example.com -c 'select 1'", c).policy.decision).toBe("CONFIRM");
  });

  it("blockCriticalOperations=false turns soft-critical into CONFIRM, but hard blocks remain", () => {
    const c = cfg({ security: { blockCriticalOperations: false } });
    // FS_ROOT_DELETE has block:true (hard) so it stays blocked
    expect(judge("rm -rf /", c).policy.decision).toBe("BLOCK");
    // a critical finding without block:true becomes CONFIRM
    const a = analyzeCommand("echo hi");
    const res = evaluatePolicy(a, [f("CRITICAL")], c);
    expect(res.decision).toBe("CONFIRM");
    expect(evaluatePolicy(a, [f("CRITICAL")], cfg()).decision).toBe("BLOCK");
  });

  it("block findings cannot be overridden by trusted commands", () => {
    const c = cfg({ security: { trustedCommands: ["rm -rf /"] } });
    expect(judge("rm -rf /", c).policy.decision).toBe("BLOCK");
  });

  it("trusted commands reduce CONFIRM to WARN only for exact matches", () => {
    const c = cfg({ security: { trustedCommands: ["rm -rf build"] } });
    expect(judge("rm -rf build", c).policy.decision).toBe("WARN");
    expect(judge("rm   -rf   build", c).policy.decision).toBe("WARN"); // whitespace normalised
    expect(judge("rm -rf build2", c).policy.decision).toBe("CONFIRM");
  });

  it("trusted commands cannot lower a mandatory confirmation", () => {
    const cmd = "psql -h prod-db.example.com -c 'select 1'";
    const c = cfg({ security: { trustedCommands: [cmd] } });
    expect(judge(cmd, c).policy.decision).toBe("CONFIRM");
  });

  it("blocked-command patterns block regardless of risk", () => {
    const c = cfg({ security: { blockedCommands: ["git push*", "regex:^npm (publish|unpublish)"] } });
    const r = judge("git push origin main", c);
    expect(r.policy.decision).toBe("BLOCK");
    expect(r.policy.blockedBy).toContain("POLICY_BLOCKED_COMMAND");
    expect(judge("npm publish", c).policy.decision).toBe("BLOCK");
    expect(judge("git status", c).policy.decision).toBe("ALLOW");
  });

  it("blocked patterns see through sudo and nested shells", () => {
    const c = cfg({ security: { blockedCommands: ["terraform destroy*"] } });
    expect(judge("sudo terraform destroy -auto-approve", c).policy.decision).toBe("BLOCK");
    expect(judge('bash -c "terraform destroy"', c).policy.decision).toBe("BLOCK");
  });

  it("an unusable block pattern fails closed (treated as a match)", () => {
    expect(matchesAny(["regex:("], ["anything"])).toBe("regex:(");
  });

  it("unknown commands follow defaultUnknownCommandPolicy as a floor", () => {
    expect(judge("frobnicate", cfg({ security: { defaultUnknownCommandPolicy: "ALLOW" } })).policy.decision).toBe("ALLOW");
    expect(judge("frobnicate", cfg({ security: { defaultUnknownCommandPolicy: "WARN" } })).policy.decision).toBe("WARN");
    expect(judge("frobnicate", cfg({ security: { defaultUnknownCommandPolicy: "CONFIRM" } })).policy.decision).toBe("CONFIRM");
    expect(judge("frobnicate", cfg({ security: { defaultUnknownCommandPolicy: "BLOCK" } })).policy.decision).toBe("BLOCK");
  });

  it("the unknown policy never lowers a risk-based decision", () => {
    const c = cfg({ security: { defaultUnknownCommandPolicy: "ALLOW" } });
    expect(judge("rm -rf build", c).policy.decision).toBe("CONFIRM");
  });

  it("uncertain syntax is subject to the unknown policy", () => {
    const c = cfg({ security: { defaultUnknownCommandPolicy: "CONFIRM" } });
    const r = judge("echo $(date)", c);
    expect(r.policy.decision).toBe("CONFIRM");
    expect(r.policy.fromUnknownPolicy).toBe(true);
  });

  it("AI availability is irrelevant to the decision (no AI input exists)", () => {
    const a = judge("rm -rf /");
    expect(a.policy.decision).toBe("BLOCK");
    expect(evaluatePolicy.length).toBe(3); // (analysis, findings, config): no explanation parameter
  });

  it("reports reasons and the rules that blocked", () => {
    const r = judge("rm -rf /");
    expect(r.policy.blockedBy).toContain("FS_ROOT_DELETE");
    expect(r.policy.reasons.join(" ")).toMatch(/FS_ROOT_DELETE/);
  });

  it("empty input is allowed with no findings", () => {
    const r = judge("");
    expect(r.policy.decision).toBe("ALLOW");
    expect(r.findings).toEqual([]);
  });
});

describe("policyEngine: helpers", () => {
  it("normalizeCommand collapses whitespace", () => {
    expect(normalizeCommand("  a   b \t c ")).toBe("a b c");
  });

  it("patternToRegExp supports globs and regex:", () => {
    expect(patternToRegExp("git push*").test("git push origin x")).toBe(true);
    expect(patternToRegExp("git push*").test("echo git push")).toBe(false);
    expect(patternToRegExp("a.b").test("axb")).toBe(false);
    expect(patternToRegExp("regex:^x+$").test("xxx")).toBe(true);
    expect(() => patternToRegExp("regex:(")).toThrow();
  });

  it("commandForms includes raw, segment and unwrapped forms", () => {
    const forms = commandForms(analyzeCommand("sudo terraform destroy"));
    expect(forms).toContain("sudo terraform destroy");
    expect(forms).toContain("terraform destroy");
  });
});

describe("riskScorer", () => {
  it("highestRisk picks the maximum and defaults to LOW", () => {
    expect(highestRisk([])).toBe("LOW");
    expect(highestRisk([f("MEDIUM"), f("CRITICAL"), f("HIGH")])).toBe("CRITICAL");
  });

  it("riskScore is additive, capped at 100 and informational", () => {
    expect(riskScore([])).toBe(0);
    expect(riskScore([f("MEDIUM")])).toBe(10);
    expect(riskScore([f("HIGH"), f("HIGH"), f("HIGH")])).toBe(100);
  });

  it("a low aggregate score cannot override a hard block", () => {
    const a = analyzeCommand("echo hi");
    const r = evaluatePolicy(a, [f("LOW", { block: true, mandatory: true })], cfg());
    expect(r.score).toBeLessThan(5);
    expect(r.decision).toBe("BLOCK");
  });
});
