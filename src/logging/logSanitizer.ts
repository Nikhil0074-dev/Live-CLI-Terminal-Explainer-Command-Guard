/** Redacts secret-looking values from command text before it is logged or displayed in history. */

const REDACTED = "[REDACTED]";

const PATTERNS: Array<[RegExp, string]> = [
  // URL credentials: scheme://user:pass@host
  [/(\b[a-z][a-z0-9+.-]*:\/\/)([^\s:@/]+):([^\s@/]+)@/gi, `$1$2:${REDACTED}@`],
  // --password=xxx / --token xxx / --secret=xxx / --api-key xxx
  [/(--?(?:password|passwd|pwd|token|secret|api[-_]?key|apikey|access[-_]?key|auth)(?:=|\s+))(?:"[^"]*"|'[^']*'|\S+)/gi, `$1${REDACTED}`],
  // mysql style -pPASSWORD (no space)
  [/(\s-p)(?!assword)(\S+)/g, `$1${REDACTED}`],
  // KEY=value where key looks secret
  [/\b([A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|CREDENTIALS?)[A-Z0-9_]*)=(?:"[^"]*"|'[^']*'|\S+)/gi, `$1=${REDACTED}`],
  // Authorization headers
  [/(authorization:\s*(?:bearer|basic|token)\s+)[^\s"']+/gi, `$1${REDACTED}`],
  [/\b(bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, `$1${REDACTED}`],
  // well-known token shapes
  [/\bAKIA[0-9A-Z]{16}\b/g, REDACTED],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, REDACTED],
  [/\bsk-[A-Za-z0-9_-]{16,}\b/g, REDACTED],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, REDACTED],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g, REDACTED],
];

export function sanitizeCommand(text: string): string {
  let out = text;
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out;
}
