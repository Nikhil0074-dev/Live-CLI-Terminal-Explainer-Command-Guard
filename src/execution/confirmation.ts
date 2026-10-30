import * as readline from "node:readline";
import type { Readable } from "node:stream";

export type Answer = "yes" | "no" | "explain";

export interface LineReader {
  readLine(): Promise<string | null>;
  close(): void;
}

/** A single reader for a stream, so several prompts can share one stdin without losing buffered input. */
export function createLineReader(input: Readable): LineReader {
  const rl = readline.createInterface({ input, terminal: false, crlfDelay: Infinity });
  const queue: string[] = [];
  const waiters: Array<(l: string | null) => void> = [];
  let closed = false;
  rl.on("line", (l) => {
    const w = waiters.shift();
    if (w) w(l);
    else queue.push(l);
  });
  rl.on("close", () => {
    closed = true;
    while (waiters.length) (waiters.shift() as (l: string | null) => void)(null);
  });
  return {
    readLine(): Promise<string | null> {
      if (queue.length) return Promise.resolve(queue.shift() as string);
      if (closed) return Promise.resolve(null);
      return new Promise((resolve) => waiters.push(resolve));
    },
    close(): void {
      rl.close();
    },
  };
}

/**
 * Ask a yes/no question. ONLY "y"/"yes" means yes. Enter, anything else, or end of input means no.
 * "e"/"explain" asks for more detail.
 */
export async function askConfirmation(reader: LineReader, write: (s: string) => void, question: string): Promise<Answer> {
  write(question);
  const line = await reader.readLine();
  write("\n");
  if (line === null) return "no";
  const a = line.trim().toLowerCase();
  if (a === "y" || a === "yes") return "yes";
  if (a === "e" || a === "explain") return "explain";
  return "no";
}
