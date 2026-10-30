import type { Finding, Token } from "../types";
import { containsHost, finding } from "./ruleHelpers";
import type { Rule, RuleContext } from "./ruleTypes";

function values(args: Token[]): string[] {
  return args.map((t) => t.value);
}

/** Value of --name VALUE or --name=VALUE. */
function optionValue(args: string[], names: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    for (const n of names) {
      if (args[i] === n && i + 1 < args.length) return args[i + 1];
      if (args[i].startsWith(n + "=")) return args[i].slice(n.length + 1);
    }
  }
  return null;
}

function firstPositional(args: string[], valueOpts: string[]): { index: number; value: string | null } {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (valueOpts.includes(a)) {
      i++;
      continue;
    }
    if (a.startsWith("-")) continue;
    return { index: i, value: a };
  }
  return { index: -1, value: null };
}

function prodFinding(id: string, destructive: boolean, what: string): Finding {
  return destructive
    ? finding(id, "cloud", "CRITICAL", `Destructive operation against a protected production target (${what}).`, { block: true, mandatory: true })
    : finding(id, "cloud", "HIGH", `This changes a protected production target (${what}).`, { mandatory: true, requiresConfirmation: true });
}

function terraform(ctx: RuleContext): Finding[] {
  const a = values(ctx.segment.args);
  const out: Finding[] = [];
  const { value: sub, index } = firstPositional(a, ["-chdir"]);
  if (!sub) return out;
  const rest = a.slice(index + 1);
  const autoApprove = rest.includes("-auto-approve") || rest.includes("--auto-approve");
  const destroyFlag = rest.includes("-destroy");
  const destructive = sub === "destroy" || (sub === "apply" && (destroyFlag || autoApprove)) || (sub === "state" && rest[0] === "rm");
  if (sub === "destroy" || destroyFlag) {
    out.push(finding("CLOUD_TERRAFORM_DESTROY", "cloud", "HIGH", "This destroys managed infrastructure."));
  } else if (sub === "apply") {
    out.push(
      autoApprove
        ? finding("CLOUD_TERRAFORM_AUTO_APPLY", "cloud", "HIGH", "apply -auto-approve changes infrastructure without showing the plan for approval.")
        : finding("CLOUD_TERRAFORM_APPLY", "cloud", "MEDIUM", "This changes real infrastructure; review the plan first."),
    );
  } else if (sub === "state" && rest[0] === "rm") {
    out.push(finding("CLOUD_TERRAFORM_STATE_RM", "cloud", "MEDIUM", "Removing resources from state makes Terraform forget them."));
  } else if (sub === "import" || sub === "taint" || sub === "untaint") {
    out.push(finding("CLOUD_TERRAFORM_STATE_CHANGE", "cloud", "MEDIUM", `terraform ${sub} modifies state.`));
  }
  const mutating = ["apply", "destroy", "import", "taint", "untaint", "state"].includes(sub) && (sub !== "state" || rest[0] !== "list");
  if (mutating) {
    const ws = ctx.env.TF_WORKSPACE ?? ctx.environment.terraformWorkspace;
    const prod = ws && ctx.config.environment.productionTerraformWorkspaces.includes(ws) ? ws : null;
    if (prod) out.push(prodFinding("CLOUD_PRODUCTION_TARGET", destructive || sub === "destroy", `Terraform workspace "${prod}"`));
  }
  return out;
}

const K8S_READ_ONLY = new Set(["get", "describe", "logs", "top", "explain", "api-resources", "api-versions", "version", "cluster-info", "diff", "events", "auth", "wait", "port-forward", "completion", "options", "help"]);

function kubectl(ctx: RuleContext, tool: "kubectl" | "helm"): Finding[] {
  const a = values(ctx.segment.args);
  const out: Finding[] = [];
  const valueOpts = ["--context", "--kube-context", "-n", "--namespace", "--kubeconfig", "-s", "--server", "--cluster", "--user", "-l", "-f", "--timeout"];
  const { value: verb, index } = firstPositional(a, valueOpts);
  if (!verb) return out;
  const rest = a.slice(index + 1);
  const explicit = optionValue(a, ["--context", "--kube-context"]);
  const context = explicit ?? ctx.environment.kubeContext;

  let destructive = false;
  let mutating = false;
  if (tool === "kubectl") {
    if (verb === "delete") {
      destructive = true;
      const target = rest.find((r) => !r.startsWith("-")) ?? "";
      const broad = rest.includes("--all") || rest.includes("-A") || rest.includes("--all-namespaces") || /^(ns|namespace|namespaces|node|nodes|pv|pvc|crd)\b/.test(target);
      out.push(finding("CLOUD_K8S_DELETE", "cloud", "HIGH", broad ? "kubectl delete on a namespace, node, volume or with --all can remove many resources." : "kubectl delete removes cluster resources."));
    } else if (verb === "drain") {
      mutating = true;
      out.push(finding("CLOUD_K8S_DRAIN", "cloud", "HIGH", "drain evicts every workload from a node."));
    } else if (!K8S_READ_ONLY.has(verb)) {
      mutating = true;
      if (verb === "config" && (rest[0] === "view" || rest[0] === "current-context" || rest[0] === "get-contexts")) mutating = false;
      if (mutating) out.push(finding("CLOUD_K8S_MODIFY", "cloud", "MEDIUM", `kubectl ${verb} changes cluster state.`));
    }
  } else {
    if (verb === "uninstall" || verb === "delete") {
      destructive = true;
      out.push(finding("CLOUD_HELM_UNINSTALL", "cloud", "HIGH", "helm uninstall removes a release and its resources."));
    } else if (["install", "upgrade", "rollback"].includes(verb)) {
      mutating = true;
      out.push(finding("CLOUD_HELM_CHANGE", "cloud", "MEDIUM", `helm ${verb} changes cluster state.`));
    }
  }
  if ((destructive || mutating) && context && ctx.config.environment.productionKubeContexts.includes(context)) {
    out.push(prodFinding("CLOUD_PRODUCTION_TARGET", destructive, `Kubernetes context "${context}"${explicit ? "" : " (current context)"}`));
  }
  return out;
}

const AWS_READ = /^(describe|list|get|ls|head|show|lookup|batch-get|query|scan|select|filter|check|validate|wait|help|sts|view|test)/;
const AWS_DELETE = /^(delete|terminate|remove|deregister|destroy|purge|disassociate|detach|revoke|cancel|disable|stop)/;

function aws(ctx: RuleContext): Finding[] {
  const a = values(ctx.segment.args);
  const out: Finding[] = [];
  const { value: service, index } = firstPositional(a, ["--profile", "--region", "--output", "--endpoint-url", "--query"]);
  if (!service) return out;
  const afterService = a.slice(index + 1);
  const { value: op, index: opIdx } = firstPositional(afterService, ["--profile", "--region", "--output", "--endpoint-url", "--query"]);
  const rest = op ? afterService.slice(opIdx + 1) : [];
  let destructive = false;
  let mutating = false;
  if (service === "s3") {
    if (op === "rm") {
      destructive = true;
      out.push(finding("CLOUD_AWS_S3_DELETE", "cloud", "HIGH", rest.includes("--recursive") ? "aws s3 rm --recursive deletes every object under the prefix." : "aws s3 rm deletes objects."));
    } else if (op === "rb") {
      destructive = true;
      out.push(finding("CLOUD_AWS_S3_DELETE", "cloud", "HIGH", "aws s3 rb removes a bucket."));
    } else if (op === "sync" && rest.includes("--delete")) {
      destructive = true;
      out.push(finding("CLOUD_AWS_S3_DELETE", "cloud", "HIGH", "aws s3 sync --delete removes destination objects that are not in the source."));
    } else if (op === "cp" || op === "mv" || op === "sync" || op === "mb") {
      mutating = true;
    }
  } else if (op && AWS_DELETE.test(op)) {
    destructive = true;
    out.push(finding("CLOUD_AWS_DELETE", "cloud", "HIGH", `aws ${service} ${op} deletes or disables cloud resources.`));
  } else if (op && !AWS_READ.test(op) && service !== "configure") {
    mutating = true;
    out.push(finding("CLOUD_AWS_MODIFY", "cloud", "MEDIUM", `aws ${service} ${op} changes cloud resources.`));
  }
  if (destructive || mutating) {
    const profile = optionValue(a, ["--profile"]) ?? ctx.env.AWS_PROFILE ?? ctx.environment.awsProfile;
    const cfg = ctx.config.environment;
    const idsInText = a.join(" ") + " " + (ctx.env.AWS_ACCOUNT_ID ?? "");
    const acct = containsHost(idsInText, cfg.productionCloudAccountIds);
    if (profile && cfg.productionCloudProfiles.includes(profile)) out.push(prodFinding("CLOUD_PRODUCTION_TARGET", destructive, `AWS profile "${profile}"`));
    else if (acct) out.push(prodFinding("CLOUD_PRODUCTION_TARGET", destructive, `AWS account ${acct}`));
  }
  return out;
}

function otherCloud(ctx: RuleContext, tool: "gcloud" | "az"): Finding[] {
  const a = values(ctx.segment.args);
  const out: Finding[] = [];
  const del = a.includes("delete") || a.includes("remove") || a.includes("destroy");
  if (del) out.push(finding(tool === "gcloud" ? "CLOUD_GCP_DELETE" : "CLOUD_AZ_DELETE", "cloud", "HIGH", `${tool} ... delete removes cloud resources.`));
  const target = optionValue(a, tool === "gcloud" ? ["--project"] : ["--subscription"]);
  if (target && del && ctx.config.environment.productionCloudProfiles.includes(target)) {
    out.push(prodFinding("CLOUD_PRODUCTION_TARGET", true, `${tool} ${tool === "gcloud" ? "project" : "subscription"} "${target}"`));
  }
  return out;
}

function docker(ctx: RuleContext): Finding[] {
  const a = values(ctx.segment.args);
  const out: Finding[] = [];
  const { value: sub, index } = firstPositional(a, []);
  const rest = a.slice(index + 1);
  const joined = a.join(" ");
  if (sub === "system" && rest[0] === "prune") {
    out.push(finding("CLOUD_DOCKER_PRUNE", "cloud", "HIGH", "docker system prune removes stopped containers, networks and images" + (/(-a|--all|--volumes)/.test(joined) ? ", and possibly volumes and all unused images." : ".")));
  } else if (sub === "volume" && (rest[0] === "rm" || rest[0] === "prune")) {
    out.push(finding("CLOUD_DOCKER_VOLUME_DELETE", "cloud", "HIGH", "Removing Docker volumes permanently deletes their data."));
  } else if ((sub === "compose" && rest.includes("down") && /(-v|--volumes)/.test(joined)) || (sub === "down" && /(-v|--volumes)/.test(joined))) {
    out.push(finding("CLOUD_DOCKER_VOLUME_DELETE", "cloud", "HIGH", "docker compose down -v deletes the project's volumes and their data."));
  } else if ((sub === "rm" || sub === "rmi" || sub === "kill") && /(-f|--force)/.test(joined)) {
    out.push(finding("CLOUD_DOCKER_FORCE_REMOVE", "cloud", "MEDIUM", `docker ${sub} -f forcibly removes containers or images.`));
  } else if (sub === "run" && /--privileged/.test(joined)) {
    out.push(finding("CLOUD_DOCKER_PRIVILEGED", "cloud", "MEDIUM", "--privileged gives the container nearly full access to the host."));
  }
  if (sub === "run" && /(-v|--volume)[ =]+\/(:|\s)/.test(joined)) {
    out.push(finding("CLOUD_DOCKER_MOUNT_ROOT", "cloud", "HIGH", "Mounting the host root filesystem into a container exposes the whole host."));
  }
  return out;
}

export const cloudRules: Rule = (ctx) => {
  switch (ctx.segment.executable) {
    case "terraform":
    case "tofu":
      return terraform(ctx);
    case "kubectl":
      return kubectl(ctx, "kubectl");
    case "helm":
      return kubectl(ctx, "helm");
    case "aws":
      return aws(ctx);
    case "gcloud":
      return otherCloud(ctx, "gcloud");
    case "az":
      return otherCloud(ctx, "az");
    case "docker":
    case "podman":
    case "docker-compose":
      return docker(ctx);
    default:
      return [];
  }
};
