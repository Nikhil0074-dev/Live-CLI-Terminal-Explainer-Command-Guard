import type { RawSegment, Redirection, Token, TokenizeResult } from "../types";

/**
 * Conservative POSIX-shell tokenizer. It never executes anything.
 *
 * It understands: single/double quotes, backslash escapes, control operators
 * (&&, ||, |, |&, ;, &, newline), redirections, $VAR / ${VAR}, $(...), `...`,
 * $((...)), comments, globs and brace expansion. Anything it cannot model
 * (heredocs, subshell grouping, unterminated quotes) is reported so the
 * caller can treat the command as "uncertain" instead of "safe".
 */

const CONTROL_OPS = ["&&", "||", "|&", "|", ";", "&"];

interface Cur {
  buf: string;
  active: boolean;
  quoted: boolean;
  exp: boolean;
  glob: boolean;
}

function emptyCur(): Cur {
  return { buf: "", active: false, quoted: false, exp: false, glob: false };
}

/** Find the index of the ")" matching the "(" at openIdx, or -1. */
export function findMatchingParen(s: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === "'") {
      const e = s.indexOf("'", i + 1);
      if (e < 0) return -1;
      i = e;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== '"') {
        if (s[j] === "\\") j++;
        j++;
      }
      if (j >= s.length) return -1;
      i = j;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function tokenize(input: string): TokenizeResult {
  const segments: RawSegment[] = [];
  const operators: string[] = [];
  const substitutions: string[] = [];
  const errors: string[] = [];
  let hasHeredoc = false;
  let hasVariables = false;
  let hasSubstitution = false;
  let hasGrouping = false;

  let tokens: Token[] = [];
  let redirs: Redirection[] = [];
  let opBefore: string | null = null;
  let segStart = 0;
  let cur = emptyCur();
  let pendingRedirect: string | null = null;
  let i = 0;
  const n = input.length;

  const pushToken = (): void => {
    if (!cur.active) return;
    if (!cur.quoted && /\{[^{}]*(,|\.\.)[^{}]*\}/.test(cur.buf)) cur.glob = true;
    if (pendingRedirect) {
      redirs.push({ op: pendingRedirect, target: cur.buf, targetHasExpansion: cur.exp });
      pendingRedirect = null;
    } else {
      tokens.push({ value: cur.buf, quoted: cur.quoted, hasExpansion: cur.exp, hasGlob: cur.glob });
    }
    cur = emptyCur();
  };

  const endSegment = (op: string | null, endIdx: number): void => {
    pushToken();
    if (pendingRedirect) {
      errors.push("redirection without a target");
      pendingRedirect = null;
    }
    if (tokens.length > 0 || redirs.length > 0) {
      segments.push({
        tokens,
        redirections: redirs,
        operatorBefore: opBefore,
        raw: input.slice(segStart, endIdx).trim(),
      });
    } else if (op !== null && op !== ";" && op !== "&") {
      errors.push(`operator "${op}" has no command before it`);
    }
    tokens = [];
    redirs = [];
    if (op !== null) {
      operators.push(op);
      opBefore = op;
      segStart = endIdx + op.length;
    }
  };

  const consumeDollar = (): void => {
    const nx = input[i + 1];
    cur.active = true;
    if (nx === "(") {
      const end = findMatchingParen(input, i + 1);
      if (end < 0) {
        errors.push("unterminated command substitution");
        cur.buf += input.slice(i);
        cur.exp = true;
        hasSubstitution = true;
        i = n;
        return;
      }
      if (input[i + 2] === "(") {
        // arithmetic expansion $(( ... )): a value, not a command
        hasVariables = true;
      } else {
        substitutions.push(input.slice(i + 2, end));
        hasSubstitution = true;
      }
      cur.buf += input.slice(i, end + 1);
      cur.exp = true;
      i = end + 1;
      return;
    }
    if (nx === "{") {
      const end = input.indexOf("}", i + 2);
      if (end < 0) {
        errors.push("unterminated ${...} expansion");
        cur.buf += input.slice(i);
        cur.exp = true;
        hasVariables = true;
        i = n;
        return;
      }
      cur.buf += input.slice(i, end + 1);
      cur.exp = true;
      hasVariables = true;
      i = end + 1;
      return;
    }
    if (nx === "'") {
      // ANSI-C quoting $'...' : value depends on escapes, treat as expansion
      let j = i + 2;
      while (j < n && input[j] !== "'") {
        if (input[j] === "\\") j++;
        j++;
      }
      if (j >= n) {
        errors.push("unterminated $'...' string");
        cur.buf += input.slice(i);
        i = n;
      } else {
        cur.buf += input.slice(i + 2, j);
        i = j + 1;
      }
      cur.quoted = true;
      cur.exp = true;
      return;
    }
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(input.slice(i + 1));
    if (m) {
      cur.buf += "$" + m[0];
      cur.exp = true;
      hasVariables = true;
      i += 1 + m[0].length;
      return;
    }
    if (nx !== undefined && /[0-9@*#?!$-]/.test(nx)) {
      cur.buf += "$" + nx;
      cur.exp = true;
      hasVariables = true;
      i += 2;
      return;
    }
    cur.buf += "$";
    i++;
  };

  const consumeBacktick = (): void => {
    cur.active = true;
    let j = i + 1;
    while (j < n && input[j] !== "`") {
      if (input[j] === "\\") j++;
      j++;
    }
    if (j >= n) {
      errors.push("unterminated backtick substitution");
      cur.buf += input.slice(i);
      i = n;
    } else {
      substitutions.push(input.slice(i + 1, j));
      cur.buf += input.slice(i, j + 1);
      i = j + 1;
    }
    cur.exp = true;
    hasSubstitution = true;
  };

  while (i < n) {
    const c = input[i];

    if (c === "\\") {
      if (i + 1 < n) {
        if (input[i + 1] === "\n") {
          i += 2;
          continue;
        }
        cur.active = true;
        cur.quoted = true;
        cur.buf += input[i + 1];
        i += 2;
      } else {
        cur.active = true;
        cur.buf += "\\";
        i++;
      }
      continue;
    }

    if (c === "'") {
      const end = input.indexOf("'", i + 1);
      cur.active = true;
      cur.quoted = true;
      if (end < 0) {
        errors.push("unterminated single quote");
        cur.buf += input.slice(i + 1);
        i = n;
      } else {
        cur.buf += input.slice(i + 1, end);
        i = end + 1;
      }
      continue;
    }

    if (c === '"') {
      cur.active = true;
      cur.quoted = true;
      i++;
      let closed = false;
      while (i < n) {
        const d = input[i];
        if (d === '"') {
          closed = true;
          i++;
          break;
        }
        if (d === "\\" && i + 1 < n) {
          const nx = input[i + 1];
          if (nx === '"' || nx === "\\" || nx === "$" || nx === "`") {
            cur.buf += nx;
            i += 2;
          } else if (nx === "\n") {
            i += 2;
          } else {
            cur.buf += d;
            i++;
          }
          continue;
        }
        if (d === "$") {
          consumeDollar();
          continue;
        }
        if (d === "`") {
          consumeBacktick();
          continue;
        }
        cur.buf += d;
        i++;
      }
      if (!closed) errors.push("unterminated double quote");
      continue;
    }

    if (c === "$") {
      consumeDollar();
      continue;
    }
    if (c === "`") {
      consumeBacktick();
      continue;
    }

    if (c === "#" && !cur.active) {
      while (i < n && input[i] !== "\n") i++;
      continue;
    }

    if (c === "\n") {
      endSegment(";", i);
      // newline is one character; fix segStart (operator length is 1 for ";")
      i++;
      continue;
    }

    if (c === " " || c === "\t" || c === "\r") {
      pushToken();
      i++;
      continue;
    }

    // Redirections (including &> and fd-prefixed forms like 2>)
    if (c === ">" || c === "<" || (c === "&" && input[i + 1] === ">")) {
      // process substitution <(...) >(...)
      if ((c === "<" || c === ">") && input[i + 1] === "(") {
        const end = findMatchingParen(input, i + 1);
        cur.active = true;
        cur.exp = true;
        hasSubstitution = true;
        if (end < 0) {
          errors.push("unterminated process substitution");
          cur.buf += input.slice(i);
          i = n;
        } else {
          substitutions.push(input.slice(i + 2, end));
          cur.buf += input.slice(i, end + 1);
          i = end + 1;
        }
        continue;
      }
      let fd = "";
      if (cur.active && !cur.quoted && /^\d+$/.test(cur.buf)) {
        fd = cur.buf;
        cur = emptyCur();
      } else {
        pushToken();
      }
      let op = "";
      const rest = input.slice(i);
      const m = /^(&>>|&>|>>|>&|>\||>|<<<|<<-|<<|<&|<)/.exec(rest);
      op = m ? m[1] : c;
      i += op.length;
      if (op === "<<" || op === "<<-") hasHeredoc = true;
      pendingRedirect = fd + op;
      continue;
    }

    // Control operators
    let matchedOp: string | null = null;
    for (const op of CONTROL_OPS) {
      if (input.startsWith(op, i)) {
        matchedOp = op;
        break;
      }
    }
    if (matchedOp) {
      endSegment(matchedOp, i);
      i += matchedOp.length;
      continue;
    }

    if (c === "(" || c === ")") {
      hasGrouping = true;
    }
    if (c === "*" || c === "?" || c === "[") cur.glob = true;
    cur.active = true;
    cur.buf += c;
    i++;
  }

  endSegment(null, n);
  return { segments, operators, substitutions, errors, hasHeredoc, hasVariables, hasSubstitution, hasGrouping };
}

/** Quote a single argument so it can be displayed/re-parsed safely by a POSIX shell. */
export function shellQuote(arg: string): string {
  if (arg === "") return "''";
  if (/^[A-Za-z0-9_@%+=:,./~-]+$/.test(arg)) return arg;
  return "'" + arg.replace(/'/g, `'\\''`) + "'";
}

export function joinArgv(argv: string[]): string {
  return argv.map(shellQuote).join(" ");
}
